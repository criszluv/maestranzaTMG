# app/routers/usuarios.py
"""
Gestión de cuentas de usuario (módulo trabajadores / RRHH / admin).

Prefijo /rrhh/usuarios (se mantiene por compatibilidad con el frontend).
Reglas de autorización fina:
  - admin: gestiona a cualquiera.
  - rrhh: crea empleados/rrhh (nunca admin) y solo gestiona empleados.
"""

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import enmascarar_email, hash_password
from app.db import get_db
from app.dependencies import require_roles
from app.models import User
from app.schemas.usuario import UsuarioCreate, UsuarioOut, UsuarioUpdate
from app.services.privacidad import anonimizar_usuario, fijar_actor_auditoria

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rrhh", tags=["Usuarios"])


# ---------- Helpers de autorización fina sobre usuarios ----------

def _assert_rrhh_no_crea_admin(actor: User, rol_objetivo: str) -> None:
    """RRHH no puede crear ni promover a admin (escalada de privilegios)."""
    if actor.rol != "admin" and rol_objetivo == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="RRHH no puede crear ni asignar el rol admin.",
        )


def _assert_puede_gestionar_objetivo(actor: User, objetivo: User) -> None:
    """
    Reglas para editar / habilitar / deshabilitar a otro usuario:
      - admin: puede gestionar a cualquiera.
      - rrhh: solo empleados, nunca admins, otros rrhh, ni a sí mismo.
    """
    if actor.rol == "admin":
        return
    if objetivo.rol != "empleado":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="RRHH solo puede gestionar cuentas de empleados.",
        )
    if objetivo.id == actor.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No puedes gestionar tu propia cuenta desde aquí.",
        )


# ---------------------------- Endpoints ----------------------------

@router.get("/usuarios", response_model=List[UsuarioOut])
def listar_usuarios(
    solo_activos: bool | None = None,
    db: Session = Depends(get_db),
    _actor: User = Depends(require_roles("rrhh")),
) -> List[UsuarioOut]:
    """Lista usuarios. Filtrable por activos / inactivos. (admin/rrhh)"""
    query = db.query(User)
    if solo_activos is True:
        query = query.filter(User.estado == "activo")
    elif solo_activos is False:
        query = query.filter(User.estado == "inactivo")
    usuarios = query.order_by(User.id).all()
    return [UsuarioOut.model_validate(u) for u in usuarios]


@router.post("/usuarios", response_model=UsuarioOut, status_code=201)
def crear_usuario(
    payload: UsuarioCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> UsuarioOut:
    """Crea un usuario. RRHH puede crear empleado/rrhh; admin cualquier rol."""
    _assert_rrhh_no_crea_admin(actor, payload.rol)

    existente = db.query(User).filter(User.email == payload.email).first()
    if existente:
        raise HTTPException(status_code=400, detail="El correo ya está registrado")

    fijar_actor_auditoria(db, actor)
    usuario = User(
        email=payload.email,
        password=hash_password(payload.password),  # nunca en texto plano
        nombre=payload.nombre,
        rol=payload.rol,
        estado=payload.estado,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    logger.info(
        "Usuarios crear -> id=%s rol=%s actor=%s", usuario.id, usuario.rol, actor.id
    )
    return UsuarioOut.model_validate(usuario)


@router.put("/usuarios/{usuario_id}", response_model=UsuarioOut)
def actualizar_usuario(
    usuario_id: int,
    payload: UsuarioUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> UsuarioOut:
    """Actualiza datos de un usuario (correo, nombre, rol, estado, password)."""
    usuario = db.query(User).filter(User.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    _assert_puede_gestionar_objetivo(actor, usuario)
    if payload.rol is not None:
        _assert_rrhh_no_crea_admin(actor, payload.rol)

    if payload.email is not None:
        existe_correo = (
            db.query(User)
            .filter(User.email == payload.email, User.id != usuario_id)
            .first()
        )
        if existe_correo:
            raise HTTPException(status_code=400, detail="Ese correo ya está en uso")
        usuario.email = payload.email

    if payload.nombre is not None:
        usuario.nombre = payload.nombre
    if payload.rol is not None:
        usuario.rol = payload.rol
    if payload.estado is not None:
        usuario.estado = payload.estado
    if payload.password:
        usuario.password = hash_password(payload.password)

    fijar_actor_auditoria(db, actor)
    db.commit()
    db.refresh(usuario)
    return UsuarioOut.model_validate(usuario)


@router.post("/usuarios/{usuario_id}/deshabilitar", response_model=UsuarioOut)
def deshabilitar_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> UsuarioOut:
    """Marca un usuario como inactivo (no podrá iniciar sesión)."""
    usuario = db.query(User).filter(User.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if usuario.id == actor.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes deshabilitar tu propia cuenta.",
        )
    _assert_puede_gestionar_objetivo(actor, usuario)

    fijar_actor_auditoria(db, actor)
    usuario.estado = "inactivo"
    db.commit()
    db.refresh(usuario)
    return UsuarioOut.model_validate(usuario)


@router.post("/usuarios/{usuario_id}/habilitar", response_model=UsuarioOut)
def habilitar_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> UsuarioOut:
    """Marca un usuario como activo."""
    usuario = db.query(User).filter(User.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    _assert_puede_gestionar_objetivo(actor, usuario)

    fijar_actor_auditoria(db, actor)
    usuario.estado = "activo"
    db.commit()
    db.refresh(usuario)
    return UsuarioOut.model_validate(usuario)


@router.post("/usuarios/{usuario_id}/anonimizar", response_model=UsuarioOut)
def anonimizar_usuario_endpoint(
    usuario_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles()),  # SOLO admin (irreversible)
) -> UsuarioOut:
    """
    Derecho de supresión (Ley 21.719) compatible con la retención legal:
    reemplaza nombre/correo por seudónimos, invalida la contraseña y
    desactiva la cuenta. Los registros con plazo legal vigente (solicitudes,
    pedidos) se conservan disociados de la identidad. IRREVERSIBLE.
    """
    usuario = db.query(User).filter(User.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if usuario.id == actor.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes anonimizar tu propia cuenta.",
        )
    if usuario.rol == "admin":
        otros_admin = (
            db.query(User)
            .filter(User.rol == "admin", User.estado == "activo", User.id != usuario.id)
            .count()
        )
        if otros_admin == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No puedes anonimizar al único administrador activo.",
            )

    email_previo = enmascarar_email(usuario.email)
    fijar_actor_auditoria(db, actor)
    usuario = anonimizar_usuario(db, usuario)
    logger.warning(
        "Privacidad: usuario id=%s (%s) anonimizado por admin id=%s",
        usuario.id, email_previo, actor.id,
    )
    return UsuarioOut.model_validate(usuario)
