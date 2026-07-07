# app/routers/pedidos.py
"""
Módulo de pedidos (órdenes de trabajo).

  - RRHH/Admin: CRUD completo y asignación de encargado.
  - Empleado: ve sus pedidos y actualiza el estado de los que le asignaron.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import List

import requests
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.dependencies import get_current_user, require_roles
from app.models import Pedido, PedidoFoto, User
from app.schemas.pedido import (
    FotoPedidoOut,
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


@router.get("", response_model=List[PedidoOut])
def listar_pedidos(
    db: Session = Depends(get_db),
    _actor: User = Depends(require_roles("rrhh")),
) -> List[PedidoOut]:
    """Lista todos los pedidos (vista RRHH/Admin)."""
    rows = (
        db.query(Pedido, User.nombre.label("encargado_nombre"))
        .outerjoin(User, Pedido.encargado_id == User.id)
        .order_by(Pedido.id.desc())
        .all()
    )
    resultado: list[PedidoOut] = []
    for pedido, encargado_nombre in rows:
        out = PedidoOut.model_validate(pedido)
        out.encargado_nombre = encargado_nombre
        resultado.append(out)
    return resultado


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
        db.query(Pedido, User.nombre.label("encargado_nombre"))
        .outerjoin(User, Pedido.encargado_id == User.id)
        .filter(Pedido.encargado_id == user_id)
        .order_by(Pedido.id.desc())
        .all()
    )
    resultado: list[PedidoOut] = []
    for pedido, encargado_nombre in rows:
        out = PedidoOut.model_validate(pedido)
        out.encargado_nombre = encargado_nombre
        resultado.append(out)
    return resultado


@router.post("", response_model=PedidoOut, status_code=201)
def crear_pedido(
    payload: PedidoCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> PedidoOut:
    _validar_encargado(db, payload.encargado_id)
    fijar_actor_auditoria(db, actor)
    nuevo = Pedido(**payload.model_dump())
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    logger.info("Pedidos crear -> id=%s", nuevo.id)
    return PedidoOut.model_validate(nuevo)


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
    fijar_actor_auditoria(db, actor)
    for campo, valor in datos.items():
        setattr(pedido, campo, valor)
    db.commit()
    db.refresh(pedido)
    return PedidoOut.model_validate(pedido)


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
    fijar_actor_auditoria(db, current_user)
    pedido.estado = payload.estado
    db.commit()
    db.refresh(pedido)
    logger.info("Pedidos estado -> id=%s estado=%s", pedido_id, payload.estado)
    return PedidoOut.model_validate(pedido)


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
