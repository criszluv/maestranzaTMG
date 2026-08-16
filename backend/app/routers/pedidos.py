# app/routers/pedidos.py
"""
Módulo de pedidos (órdenes de trabajo).

  - RRHH/Admin: CRUD completo, asignación de encargado y de cliente, y
    CIERRE comercial del pedido terminado.
  - Empleado: ve sus pedidos y actualiza el estado de los que le asignaron.

Ciclo de vida completo:
  1. RRHH crea el pedido, le asigna un cliente y un encargado (empleado).
  2. El encargado avanza el estado hasta 'terminado' (y sube fotos).
  3. RRHH lo cierra eligiendo destino: 'pagado' -> Trabajo realizado;
     'pendiente' -> Factura por cobrar (pagos pendientes).
Un pedido cerrado queda congelado (no se le cambia estado ni cliente) para
que nunca contradiga al registro comercial que originó.
"""

import logging
import uuid
from datetime import date, datetime, timezone
from typing import List

import requests
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.dependencies import get_current_user, require_roles
from app.models import Cliente, Factura, Maquina, Pedido, PedidoFoto, Trabajo, User
from app.schemas.pedido import (
    FotoPedidoOut,
    PedidoCierre,
    PedidoCreate,
    PedidoEstadoUpdate,
    PedidoOut,
    PedidoUpdate,
)
from app.services.almacenamiento import (
    AlmacenamientoError,
    AlmacenamientoNoConfigurado,
    eliminar_objeto,
    subir_objeto,
    url_firmada,
)
from app.services.imagenes import TIPOS_PERMITIDOS, detectar_tipo_imagen, extension_para
from app.services.privacidad import fijar_actor_auditoria

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pedidos", tags=["Pedidos"])


def _validar_encargado(db: Session, encargado_id: int | None) -> None:
    """Si se asigna encargado, debe existir y ser un empleado."""
    if encargado_id is None:
        return
    encargado = db.query(User).filter(User.id == encargado_id).first()
    if encargado is None:
        raise HTTPException(status_code=404, detail="El encargado indicado no existe.")
    if encargado.rol != "empleado":
        raise HTTPException(
            status_code=400,
            detail="El encargado de un pedido debe ser un empleado.",
        )


def _validar_cliente(db: Session, cliente_id: int | None) -> None:
    """Al ASIGNAR un cliente, debe existir y estar habilitado."""
    if cliente_id is None:
        return
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if cliente is None:
        raise HTTPException(status_code=404, detail="El cliente indicado no existe.")
    if cliente.estado != "habilitado":
        raise HTTPException(
            status_code=400,
            detail="El cliente está deshabilitado: habilítalo o elige otro.",
        )


def _validar_maquina(db: Session, maquina_id: int | None) -> None:
    """Al asignar una máquina (pedidos de mantenimiento), debe existir."""
    if maquina_id is None:
        return
    if db.query(Maquina).filter(Maquina.id == maquina_id).first() is None:
        raise HTTPException(status_code=404, detail="La máquina indicada no existe.")


def _assert_no_cerrado(pedido: Pedido, campo: str) -> None:
    """Un pedido ya derivado a trabajos/facturas no cambia de estado ni de
    cliente: eso dejaría el registro comercial inconsistente."""
    if pedido.cerrado_en is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"El pedido ya fue cerrado como '{pedido.cierre_tipo}': no se "
                f"puede cambiar su {campo}. Corrige el registro en "
                "Trabajos o en Pagos pendientes."
            ),
        )


def _a_out(
    pedido: Pedido,
    encargado_nombre: str | None = None,
    cliente_nombre: str | None = None,
    maquina_nombre: str | None = None,
) -> PedidoOut:
    out = PedidoOut.model_validate(pedido)
    out.encargado_nombre = encargado_nombre
    out.cliente_nombre = cliente_nombre
    out.maquina_nombre = maquina_nombre
    return out


def _nombres_de(db: Session, pedido: Pedido) -> tuple[str | None, str | None, str | None]:
    """(encargado, cliente, máquina) para completar la respuesta tras escribir."""
    encargado = (
        db.query(User.nombre).filter(User.id == pedido.encargado_id).scalar()
        if pedido.encargado_id
        else None
    )
    cliente = (
        db.query(Cliente.nombre).filter(Cliente.id == pedido.cliente_id).scalar()
        if pedido.cliente_id
        else None
    )
    maquina = (
        db.query(Maquina.nombre).filter(Maquina.id == pedido.maquina_id).scalar()
        if pedido.maquina_id
        else None
    )
    return encargado, cliente, maquina


@router.get("", response_model=List[PedidoOut])
def listar_pedidos(
    db: Session = Depends(get_db),
    _actor: User = Depends(require_roles("rrhh")),
) -> List[PedidoOut]:
    """Lista todos los pedidos (vista RRHH/Admin)."""
    rows = (
        db.query(
            Pedido,
            User.nombre.label("encargado_nombre"),
            Cliente.nombre.label("cliente_nombre"),
            Maquina.nombre.label("maquina_nombre"),
        )
        .outerjoin(User, Pedido.encargado_id == User.id)
        .outerjoin(Cliente, Pedido.cliente_id == Cliente.id)
        .outerjoin(Maquina, Pedido.maquina_id == Maquina.id)
        .order_by(Pedido.id.desc())
        .all()
    )
    return [
        _a_out(p, encargado, cliente, maquina)
        for p, encargado, cliente, maquina in rows
    ]


@router.get("/mis-pedidos/{user_id}", response_model=List[PedidoOut])
def mis_pedidos(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[PedidoOut]:
    """Pedidos asignados a un trabajador (vista Empleado)."""
    if current_user.rol not in ("admin", "rrhh") and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo puedes consultar tus propios pedidos.",
        )
    rows = (
        db.query(
            Pedido,
            User.nombre.label("encargado_nombre"),
            Cliente.nombre.label("cliente_nombre"),
            Maquina.nombre.label("maquina_nombre"),
        )
        .outerjoin(User, Pedido.encargado_id == User.id)
        .outerjoin(Cliente, Pedido.cliente_id == Cliente.id)
        .outerjoin(Maquina, Pedido.maquina_id == Maquina.id)
        .filter(Pedido.encargado_id == user_id)
        .order_by(Pedido.id.desc())
        .all()
    )
    return [
        _a_out(p, encargado, cliente, maquina)
        for p, encargado, cliente, maquina in rows
    ]


@router.post("", response_model=PedidoOut, status_code=201)
def crear_pedido(
    payload: PedidoCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> PedidoOut:
    _validar_encargado(db, payload.encargado_id)
    _validar_cliente(db, payload.cliente_id)
    _validar_maquina(db, payload.maquina_id)
    if payload.tipo == "mantenimiento" and payload.maquina_id is None:
        raise HTTPException(
            status_code=400,
            detail="Una orden de mantenimiento debe indicar la máquina intervenida.",
        )
    fijar_actor_auditoria(db, actor)
    nuevo = Pedido(**payload.model_dump())
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    logger.info("Pedidos crear -> id=%s cliente=%s", nuevo.id, nuevo.cliente_id)
    return _a_out(nuevo, *_nombres_de(db, nuevo))


@router.put("/{pedido_id}", response_model=PedidoOut)
def actualizar_pedido(
    pedido_id: int,
    payload: PedidoUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> PedidoOut:
    """Edición completa (RRHH/Admin)."""
    pedido = db.query(Pedido).filter(Pedido.id == pedido_id).first()
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    datos = payload.model_dump(exclude_unset=True)
    if "encargado_id" in datos:
        _validar_encargado(db, datos["encargado_id"])
    # Solo validamos/bloqueamos cuando el valor REALMENTE cambia: así un
    # formulario que reenvía todos los campos no falla sin motivo.
    if "estado" in datos and datos["estado"] != pedido.estado:
        _assert_no_cerrado(pedido, "estado")
    if "cliente_id" in datos and datos["cliente_id"] != pedido.cliente_id:
        _assert_no_cerrado(pedido, "cliente")
        _validar_cliente(db, datos["cliente_id"])
    if "maquina_id" in datos and datos["maquina_id"] != pedido.maquina_id:
        _validar_maquina(db, datos["maquina_id"])

    fijar_actor_auditoria(db, actor)
    for campo, valor in datos.items():
        setattr(pedido, campo, valor)
    db.commit()
    db.refresh(pedido)
    return _a_out(pedido, *_nombres_de(db, pedido))


@router.patch("/{pedido_id}/estado", response_model=PedidoOut)
def actualizar_estado_pedido(
    pedido_id: int,
    payload: PedidoEstadoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PedidoOut:
    """Cambiar solo el estado. El empleado asignado, o RRHH/Admin."""
    pedido = db.query(Pedido).filter(Pedido.id == pedido_id).first()
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    if (
        current_user.rol not in ("admin", "rrhh")
        and pedido.encargado_id != current_user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo puedes actualizar pedidos asignados a ti.",
        )
    if payload.estado != pedido.estado:
        _assert_no_cerrado(pedido, "estado")

    fijar_actor_auditoria(db, current_user)
    pedido.estado = payload.estado
    db.commit()
    db.refresh(pedido)
    logger.info("Pedidos estado -> id=%s estado=%s", pedido_id, payload.estado)
    return _a_out(pedido, *_nombres_de(db, pedido))


# ===========================================================================
#  CIERRE COMERCIAL DEL PEDIDO (RRHH/Admin)
# ===========================================================================

def _detalle_por_defecto(pedido: Pedido) -> str:
    """Nombre del pedido + descripción, como detalle del registro comercial."""
    partes = [pedido.pedido.strip()]
    if (pedido.descripcion or "").strip():
        partes.append(pedido.descripcion.strip())
    return " — ".join(partes)[:2000]


@router.post("/{pedido_id}/cerrar", response_model=PedidoOut)
def cerrar_pedido(
    pedido_id: int,
    payload: PedidoCierre,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> PedidoOut:
    """
    Deriva un pedido TERMINADO al módulo comercial y lo marca como cerrado:

      tipo='pagado'     -> crea un Trabajo realizado (historial del cliente)
      tipo='pendiente'  -> crea una Factura por cobrar (pagos pendientes)

    Un pedido se cierra UNA sola vez: la fila se bloquea (SELECT ... FOR
    UPDATE) para que dos usuarios simultáneos no generen registros
    duplicados; el segundo recibe 409. Todo ocurre en una única transacción,
    así que o se crean pedido-cerrado + registro comercial, o no se crea nada.
    """
    pedido = (
        db.query(Pedido).filter(Pedido.id == pedido_id).with_for_update().first()
    )
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    if pedido.cerrado_en is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Este pedido ya fue cerrado como '{pedido.cierre_tipo}'.",
        )
    if pedido.estado != "terminado":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Solo se cierran pedidos terminados. El encargado debe marcarlo "
                "como 'terminado' primero."
            ),
        )

    # Orden de MANTENIMIENTO: nace de una anomalía de planta, no se factura.
    # Su cierre es interno y no genera trabajo ni factura.
    if pedido.tipo == "mantenimiento":
        fijar_actor_auditoria(db, actor)
        pedido.cerrado_en = datetime.now(timezone.utc)
        pedido.cierre_tipo = "interno"
        db.commit()
        db.refresh(pedido)
        logger.info(
            "Pedidos cerrar (mantenimiento) -> id=%s maquina=%s actor=%s",
            pedido_id, pedido.maquina_id, actor.id,
        )
        return _a_out(pedido, *_nombres_de(db, pedido))

    if pedido.cliente_id is None:
        raise HTTPException(
            status_code=400,
            detail="Asigna un cliente al pedido antes de cerrarlo.",
        )
    cliente = db.query(Cliente).filter(Cliente.id == pedido.cliente_id).first()
    if cliente is None:
        raise HTTPException(
            status_code=404,
            detail="El cliente del pedido ya no existe. Asigna otro cliente.",
        )

    fecha = payload.fecha or date.today()
    valor = payload.valor if payload.valor is not None else pedido.valor
    detalle = (payload.detalle or "").strip() or _detalle_por_defecto(pedido)

    fijar_actor_auditoria(db, actor)

    if payload.tipo == "pagado":
        trabajo = Trabajo(
            cliente_id=cliente.id,
            fecha=fecha,
            estado="Finalizado",
            valor=valor,
            detalle=detalle,
        )
        db.add(trabajo)
        db.flush()  # asigna el id sin cerrar la transacción
        pedido.trabajo_id = trabajo.id
        destino_id = trabajo.id
    else:
        factura = Factura(
            cliente_id=cliente.id,
            cliente_texto=cliente.nombre[:200],
            numero=payload.numero,
            monto=valor,
            fecha_emision=fecha,
            estado="pendiente",
            nota=(payload.nota or "").strip() or None,
        )
        db.add(factura)
        db.flush()
        pedido.factura_id = factura.id
        destino_id = factura.id

    pedido.cerrado_en = datetime.now(timezone.utc)
    pedido.cierre_tipo = payload.tipo
    db.commit()
    db.refresh(pedido)

    logger.info(
        "Pedidos cerrar -> id=%s tipo=%s destino=%s cliente=%s actor=%s",
        pedido_id, payload.tipo, destino_id, cliente.id, actor.id,
    )
    encargado, _, maquina = _nombres_de(db, pedido)
    return _a_out(pedido, encargado, cliente.nombre, maquina)


@router.delete("/{pedido_id}", status_code=204)
def eliminar_pedido(
    pedido_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> None:
    pedido = db.query(Pedido).filter(Pedido.id == pedido_id).first()
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    # Limpieza best-effort de las fotos del bucket (los metadatos caen por
    # el ON DELETE CASCADE). Si Storage falla, el pedido se borra igual y
    # la retención mensual barre los objetos huérfanos.
    rutas = [f.ruta for f in db.query(PedidoFoto).filter(PedidoFoto.pedido_id == pedido_id)]
    for ruta in rutas:
        try:
            eliminar_objeto(ruta)
        except (AlmacenamientoError, requests.RequestException):
            logger.exception("No se pudo borrar del bucket: %s", ruta)

    fijar_actor_auditoria(db, actor)
    db.delete(pedido)
    db.commit()
    logger.info("Pedidos eliminar -> id=%s (fotos=%s)", pedido_id, len(rutas))


# ===========================================================================
#  FOTOS DE PROGRESO (bucket privado de Supabase Storage)
#  - Ve/sube: el empleado ASIGNADO al pedido, RRHH y Admin.
#  - "Borrar" = soft-delete (estado 'oculta'): desaparece de todas las
#    vistas, pero archivo y metadatos quedan resguardados (Ley 21.719).
# ===========================================================================

def _pedido_o_404(db: Session, pedido_id: int) -> Pedido:
    pedido = db.query(Pedido).filter(Pedido.id == pedido_id).first()
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    return pedido


def _assert_puede_ver_fotos(actor: User, pedido: Pedido) -> None:
    if actor.rol in ("admin", "rrhh"):
        return
    if pedido.encargado_id != actor.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo puedes ver las fotos de pedidos asignados a ti.",
        )


def _con_url_firmada(db: Session, foto: PedidoFoto) -> FotoPedidoOut:
    salida = FotoPedidoOut(
        id=foto.id,
        pedido_id=foto.pedido_id,
        subido_por=foto.subido_por,
        nombre_original=foto.nombre_original,
        tamano_bytes=foto.tamano_bytes,
        content_type=foto.content_type,
        subida_en=foto.subida_en,
        url=url_firmada(foto.ruta),
    )
    autor = db.query(User.nombre).filter(User.id == foto.subido_por).scalar()
    salida.subido_por_nombre = autor
    return salida


def _error_storage(e: Exception) -> HTTPException:
    if isinstance(e, AlmacenamientoNoConfigurado):
        return HTTPException(status_code=503, detail=str(e))
    if isinstance(e, AlmacenamientoError):
        return HTTPException(status_code=502, detail=str(e))
    return HTTPException(
        status_code=502,
        detail="No se pudo conectar con el almacenamiento de archivos.",
    )


@router.get("/{pedido_id}/fotos", response_model=List[FotoPedidoOut])
def listar_fotos(
    pedido_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> List[FotoPedidoOut]:
    """Fotos VISIBLES del pedido, con URL firmada temporal para mostrarlas."""
    pedido = _pedido_o_404(db, pedido_id)
    _assert_puede_ver_fotos(actor, pedido)

    fotos = (
        db.query(PedidoFoto)
        .filter(PedidoFoto.pedido_id == pedido_id, PedidoFoto.estado == "visible")
        .order_by(PedidoFoto.subida_en.desc())
        .all()
    )
    try:
        return [_con_url_firmada(db, f) for f in fotos]
    except (AlmacenamientoError, requests.RequestException) as e:
        raise _error_storage(e) from e


@router.post("/{pedido_id}/fotos", response_model=FotoPedidoOut, status_code=201)
async def subir_foto(
    pedido_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> FotoPedidoOut:
    """
    Sube una foto de progreso. Validaciones (defensa en profundidad; el
    bucket repite tamaño y MIME en el servidor de Storage):
      1. Autorización: empleado asignado, RRHH o Admin.
      2. Tamaño <= FOTO_MAX_BYTES (5 MB).
      3. Tipo REAL por magic bytes (JPEG/PNG/WebP); el nombre y Content-Type
         del cliente son solo informativos.
      4. Máximo FOTO_MAX_POR_PEDIDO (10) fotos visibles por pedido.
    """
    pedido = _pedido_o_404(db, pedido_id)
    _assert_puede_ver_fotos(actor, pedido)

    visibles = (
        db.query(PedidoFoto)
        .filter(PedidoFoto.pedido_id == pedido_id, PedidoFoto.estado == "visible")
        .count()
    )
    if visibles >= settings.FOTO_MAX_POR_PEDIDO:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Límite alcanzado: máximo {settings.FOTO_MAX_POR_PEDIDO} fotos "
                   "por pedido. Elimina alguna para subir otra.",
        )

    datos = await archivo.read()
    if len(datos) == 0:
        raise HTTPException(status_code=422, detail="El archivo está vacío.")
    if len(datos) > settings.FOTO_MAX_BYTES:
        mb = settings.FOTO_MAX_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"La imagen supera el máximo de {mb} MB.",
        )

    tipo_real = detectar_tipo_imagen(datos)
    if tipo_real not in TIPOS_PERMITIDOS:
        raise HTTPException(
            status_code=415,
            detail="Formato no permitido: solo imágenes JPG, PNG o WebP.",
        )

    # Ruta generada por el servidor: JAMÁS usamos el nombre del cliente
    # (path traversal / colisiones). El original queda solo como metadato.
    ruta = f"pedido_{pedido_id}/{uuid.uuid4().hex}.{extension_para(tipo_real)}"

    try:
        subir_objeto(ruta, datos, tipo_real)
    except (AlmacenamientoError, requests.RequestException) as e:
        raise _error_storage(e) from e

    foto = PedidoFoto(
        pedido_id=pedido_id,
        subido_por=actor.id,
        ruta=ruta,
        nombre_original=(archivo.filename or "")[:200] or None,
        tamano_bytes=len(datos),
        content_type=tipo_real,
    )
    db.add(foto)
    db.commit()
    db.refresh(foto)
    logger.info(
        "Fotos subir -> pedido=%s foto=%s bytes=%s actor=%s",
        pedido_id, foto.id, len(datos), actor.id,
    )
    try:
        return _con_url_firmada(db, foto)
    except (AlmacenamientoError, requests.RequestException) as e:
        raise _error_storage(e) from e


@router.delete("/{pedido_id}/fotos/{foto_id}", status_code=204)
def ocultar_foto(
    pedido_id: int,
    foto_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> None:
    """
    Soft-delete: la foto desaparece de todas las vistas, pero el archivo y el
    registro quedan resguardados (quién y cuándo la ocultó). Pueden ocultar:
    quien la subió, el empleado asignado al pedido, RRHH y Admin.
    """
    pedido = _pedido_o_404(db, pedido_id)
    foto = (
        db.query(PedidoFoto)
        .filter(
            PedidoFoto.id == foto_id,
            PedidoFoto.pedido_id == pedido_id,
            PedidoFoto.estado == "visible",
        )
        .first()
    )
    if foto is None:
        raise HTTPException(status_code=404, detail="Foto no encontrada")

    if actor.rol not in ("admin", "rrhh") and not (
        foto.subido_por == actor.id or pedido.encargado_id == actor.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo puedes eliminar fotos de tus pedidos.",
        )

    foto.estado = "oculta"
    foto.oculta_en = datetime.now(timezone.utc)
    foto.oculta_por = actor.id
    db.commit()
    logger.info(
        "Fotos ocultar -> pedido=%s foto=%s actor=%s", pedido_id, foto_id, actor.id
    )
