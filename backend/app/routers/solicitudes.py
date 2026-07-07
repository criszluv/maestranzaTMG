# app/routers/solicitudes.py
"""
Solicitudes de días libres / permisos / licencias (módulo RRHH).

Prefijo /rrhh (se mantiene por compatibilidad con el frontend):
  GET   /rrhh/solicitudes               (rrhh/admin)
  GET   /rrhh/mis-solicitudes/{id}      (dueño, rrhh o admin)
  POST  /rrhh/solicitudes               (empleado solo a su nombre)
  PATCH /rrhh/solicitudes/{id}/estado   (rrhh/admin)
"""

import logging
import uuid
from datetime import date
from typing import List

import requests
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.dependencies import get_current_user, require_roles
from app.models import SolicitudRRHH, User
from app.schemas.solicitud import (
    AdjuntoSolicitudOut,
    EstadoSolicitudUpdate,
    SaldoTrabajadorOut,
    SaldoVacacionesOut,
    SolicitudCreate,
    SolicitudOut,
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
from app.services.vacaciones import (
    dias_solicitud,
    dias_usados_por_trabajador,
    saldo_vacaciones,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rrhh", tags=["Solicitudes"])


def _a_out(solicitud: SolicitudRRHH, nombre_trabajador: str | None = None) -> SolicitudOut:
    """SolicitudOut con días hábiles y flag de adjunto calculados."""
    out = SolicitudOut.model_validate(solicitud)
    if nombre_trabajador is not None:
        out.nombre_trabajador = nombre_trabajador
    out.dias_habiles = dias_solicitud(solicitud)
    out.tiene_adjunto = bool(solicitud.adjunto_ruta)
    return out


@router.get("/solicitudes", response_model=List[SolicitudOut])
def listar_solicitudes(
    db: Session = Depends(get_db),
    _actor: User = Depends(require_roles("rrhh")),
) -> List[SolicitudOut]:
    rows = (
        db.query(SolicitudRRHH, User.nombre.label("nombre_trabajador"))
        .outerjoin(User, SolicitudRRHH.trabajador_id == User.id)
        .order_by(SolicitudRRHH.creado_en.desc())
        .all()
    )
    return [_a_out(sol, nombre_trabajador or "Desconocido") for sol, nombre_trabajador in rows]


@router.get("/mis-solicitudes/{user_id}", response_model=List[SolicitudOut])
def mis_solicitudes(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[SolicitudOut]:
    # Empleado solo ve lo suyo; admin/rrhh ven cualquiera.
    if current_user.rol not in ("admin", "rrhh") and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo puedes consultar tus propias solicitudes.",
        )
    solicitudes = (
        db.query(SolicitudRRHH)
        .filter(SolicitudRRHH.trabajador_id == user_id)
        .order_by(SolicitudRRHH.creado_en.desc())
        .all()
    )
    return [_a_out(s) for s in solicitudes]


@router.post("/solicitudes", response_model=SolicitudOut, status_code=201)
def crear_solicitud(
    payload: SolicitudCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SolicitudOut:
    # Un empleado solo crea solicitudes a su propio nombre.
    if (
        current_user.rol not in ("admin", "rrhh")
        and current_user.id != payload.trabajador_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo puedes crear solicitudes para tu propia cuenta.",
        )

    trabajador = db.query(User).filter(User.id == payload.trabajador_id).first()
    if trabajador is None:
        raise HTTPException(status_code=404, detail="El trabajador indicado no existe.")

    fijar_actor_auditoria(db, current_user)
    nueva = SolicitudRRHH(**payload.model_dump(), estado="Pendiente")
    db.add(nueva)
    db.commit()
    db.refresh(nueva)
    logger.info(
        "Solicitudes crear -> id=%s trabajador_id=%s", nueva.id, nueva.trabajador_id
    )
    return _a_out(nueva)


@router.patch("/solicitudes/{id}/estado", response_model=SolicitudOut)
def cambiar_estado(
    id: int,
    payload: EstadoSolicitudUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> SolicitudOut:
    sol = db.query(SolicitudRRHH).filter(SolicitudRRHH.id == id).first()
    if sol is None:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    fijar_actor_auditoria(db, actor)
    sol.estado = payload.estado
    db.commit()
    db.refresh(sol)
    logger.info("Solicitudes estado -> solicitud=%s estado=%s", id, payload.estado)
    return _a_out(sol)


# ===========================================================================
#  SALDO DE VACACIONES (15 días hábiles/año; solo 'Vacaciones' aprobadas restan)
# ===========================================================================

@router.get("/mis-vacaciones", response_model=SaldoVacacionesOut)
def mis_vacaciones(
    anio: int | None = Query(default=None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SaldoVacacionesOut:
    """Saldo de vacaciones del usuario autenticado (todos los roles)."""
    return SaldoVacacionesOut(**saldo_vacaciones(db, current_user.id, anio))


@router.get("/vacaciones", response_model=List[SaldoTrabajadorOut])
def vacaciones_todos(
    anio: int | None = Query(default=None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    _actor: User = Depends(require_roles("rrhh")),
) -> List[SaldoTrabajadorOut]:
    """
    Saldo de vacaciones de TODOS los trabajadores activos, para un año
    (RRHH/Admin). Días restantes = 15 − días hábiles de Vacaciones aprobadas.
    """
    if anio is None:
        anio = date.today().year
    usados = dias_usados_por_trabajador(db, anio)
    anuales = settings.VACACIONES_DIAS_ANUALES
    usuarios = (
        db.query(User).filter(User.estado == "activo").order_by(User.nombre).all()
    )
    return [
        SaldoTrabajadorOut(
            trabajador_id=u.id,
            nombre=u.nombre,
            rol=u.rol,
            anio=anio,
            dias_anuales=anuales,
            dias_usados=usados.get(u.id, 0),
            dias_disponibles=anuales - usados.get(u.id, 0),
        )
        for u in usuarios
    ]


@router.get("/vacaciones/{trabajador_id}", response_model=SaldoVacacionesOut)
def vacaciones_de(
    trabajador_id: int,
    anio: int | None = Query(default=None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    _actor: User = Depends(require_roles("rrhh")),
) -> SaldoVacacionesOut:
    """Saldo de vacaciones de cualquier trabajador (RRHH/Admin)."""
    return SaldoVacacionesOut(**saldo_vacaciones(db, trabajador_id, anio))


# ===========================================================================
#  ADJUNTO (1 foto-documento por solicitud, bucket privado de Supabase)
#  Puede gestionarlo el DUEÑO de la solicitud, RRHH o Admin.
# ===========================================================================

def _solicitud_o_404(db: Session, solicitud_id: int) -> SolicitudRRHH:
    sol = db.query(SolicitudRRHH).filter(SolicitudRRHH.id == solicitud_id).first()
    if sol is None:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    return sol


def _assert_puede_gestionar(actor: User, sol: SolicitudRRHH) -> None:
    if actor.rol in ("admin", "rrhh") or sol.trabajador_id == actor.id:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Solo puedes gestionar el adjunto de tus propias solicitudes.",
    )


def _error_storage(e: Exception) -> HTTPException:
    if isinstance(e, AlmacenamientoNoConfigurado):
        return HTTPException(status_code=503, detail=str(e))
    if isinstance(e, AlmacenamientoError):
        return HTTPException(status_code=502, detail=str(e))
    return HTTPException(
        status_code=502,
        detail="No se pudo conectar con el almacenamiento de archivos.",
    )


@router.get("/solicitudes/{solicitud_id}/adjunto", response_model=AdjuntoSolicitudOut)
def obtener_adjunto(
    solicitud_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> AdjuntoSolicitudOut:
    """URL firmada temporal del adjunto (o 404 si la solicitud no tiene)."""
    sol = _solicitud_o_404(db, solicitud_id)
    _assert_puede_gestionar(actor, sol)
    if not sol.adjunto_ruta:
        raise HTTPException(status_code=404, detail="La solicitud no tiene adjunto.")
    try:
        url = url_firmada(sol.adjunto_ruta)
    except (AlmacenamientoError, requests.RequestException) as e:
        raise _error_storage(e) from e
    return AdjuntoSolicitudOut(
        solicitud_id=sol.id,
        nombre=sol.adjunto_nombre,
        content_type=sol.adjunto_content_type or "application/octet-stream",
        tamano_bytes=sol.adjunto_tamano,
        url=url,
    )


@router.post("/solicitudes/{solicitud_id}/adjunto", response_model=AdjuntoSolicitudOut, status_code=201)
async def subir_adjunto(
    solicitud_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> AdjuntoSolicitudOut:
    """
    Sube (o REEMPLAZA) el único adjunto de la solicitud. Validaciones (defensa
    en profundidad):
      1. Autorización: dueño de la solicitud, RRHH o Admin.
      2. Tamaño <= SOLICITUD_ADJUNTO_MAX_BYTES (5 MB).
      3. Tipo REAL por magic bytes (JPG/PNG/WebP); el Content-Type del cliente
         es solo informativo.
    """
    sol = _solicitud_o_404(db, solicitud_id)
    _assert_puede_gestionar(actor, sol)

    datos = await archivo.read()
    if len(datos) == 0:
        raise HTTPException(status_code=422, detail="El archivo está vacío.")
    if len(datos) > settings.SOLICITUD_ADJUNTO_MAX_BYTES:
        mb = settings.SOLICITUD_ADJUNTO_MAX_BYTES // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"El archivo supera el máximo de {mb} MB.")

    tipo_real = detectar_tipo_imagen(datos)
    if tipo_real not in TIPOS_PERMITIDOS:
        raise HTTPException(
            status_code=415,
            detail="Formato no permitido: sube una foto del documento (JPG, PNG o WebP).",
        )

    # Ruta generada por el servidor (nunca el nombre del cliente).
    ruta = f"solicitud_{solicitud_id}/{uuid.uuid4().hex}.{extension_para(tipo_real)}"
    try:
        subir_objeto(ruta, datos, tipo_real)
    except (AlmacenamientoError, requests.RequestException) as e:
        raise _error_storage(e) from e

    # Si ya había adjunto, borramos el objeto anterior (best-effort).
    ruta_previa = sol.adjunto_ruta
    fijar_actor_auditoria(db, actor)
    sol.adjunto_ruta = ruta
    sol.adjunto_nombre = (archivo.filename or "")[:200] or None
    sol.adjunto_content_type = tipo_real
    sol.adjunto_tamano = len(datos)
    db.commit()
    db.refresh(sol)

    if ruta_previa and ruta_previa != ruta:
        try:
            eliminar_objeto(ruta_previa)
        except (AlmacenamientoError, requests.RequestException):
            logger.exception("No se pudo borrar el adjunto anterior: %s", ruta_previa)

    logger.info(
        "Solicitud adjunto subir -> solicitud=%s bytes=%s actor=%s",
        solicitud_id, len(datos), actor.id,
    )
    try:
        url = url_firmada(ruta)
    except (AlmacenamientoError, requests.RequestException) as e:
        raise _error_storage(e) from e
    return AdjuntoSolicitudOut(
        solicitud_id=sol.id,
        nombre=sol.adjunto_nombre,
        content_type=tipo_real,
        tamano_bytes=sol.adjunto_tamano,
        url=url,
    )


@router.delete("/solicitudes/{solicitud_id}/adjunto", status_code=204)
def eliminar_adjunto(
    solicitud_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> None:
    """Quita el adjunto de la solicitud y borra el archivo del bucket."""
    sol = _solicitud_o_404(db, solicitud_id)
    _assert_puede_gestionar(actor, sol)
    if not sol.adjunto_ruta:
        raise HTTPException(status_code=404, detail="La solicitud no tiene adjunto.")

    ruta = sol.adjunto_ruta
    fijar_actor_auditoria(db, actor)
    sol.adjunto_ruta = None
    sol.adjunto_nombre = None
    sol.adjunto_content_type = None
    sol.adjunto_tamano = None
    db.commit()

    try:
        eliminar_objeto(ruta)
    except (AlmacenamientoError, requests.RequestException):
        logger.exception("No se pudo borrar el adjunto del bucket: %s", ruta)
    logger.info("Solicitud adjunto eliminar -> solicitud=%s actor=%s", solicitud_id, actor.id)
