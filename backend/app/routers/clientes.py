# app/routers/clientes.py
"""
Módulo de clientes (cartera de la maestranza). Solo RRHH y Admin.

  GET    /clientes            lista con contactos y entidades (buscar, estado)
  GET    /clientes/resumen    versión liviana para selectores
  POST   /clientes            crea (con contactos/entidades anidados)
  PUT    /clientes/{id}       edita; contactos/entidades se reemplazan como set
  POST   /clientes/{id}/deshabilitar | /habilitar   baja/alta lógica

Los contactos son datos personales (Ley 21.719): todo cambio queda en la
auditoría de la BD con el actor real (triggers + fijar_actor_auditoria).
"""

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.dependencies import require_roles
from app.models import Cliente, ClienteContacto, ClienteEntidad, Trabajo, User
from app.schemas.cliente import (
    ClienteCreate,
    ClienteOut,
    ClienteResumen,
    ClienteUpdate,
    ContactoIn,
    EntidadIn,
)
from app.services.privacidad import fijar_actor_auditoria

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clientes", tags=["Clientes"])


def _cliente_o_404(db: Session, cliente_id: int) -> Cliente:
    cliente = (
        db.query(Cliente)
        .options(selectinload(Cliente.contactos), selectinload(Cliente.entidades))
        .filter(Cliente.id == cliente_id)
        .first()
    )
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return cliente


def _assert_nombre_libre(db: Session, nombre: str, excluir_id: int | None = None) -> None:
    """El nombre de cliente es único (sin distinguir mayúsculas)."""
    consulta = db.query(Cliente).filter(func.upper(Cliente.nombre) == nombre.strip().upper())
    if excluir_id is not None:
        consulta = consulta.filter(Cliente.id != excluir_id)
    if consulta.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un cliente con ese nombre.",
        )


def _reemplazar_contactos(cliente: Cliente, nuevos: list[ContactoIn]) -> None:
    """Reemplaza el set de contactos SOLO si cambió (evita ruido en auditoría)."""
    actuales = [(c.nombre, c.telefono, c.nota) for c in cliente.contactos]
    deseados = [(c.nombre, c.telefono, c.nota) for c in nuevos]
    if actuales == deseados:
        return
    cliente.contactos.clear()
    for orden, c in enumerate(nuevos, start=1):
        cliente.contactos.append(
            ClienteContacto(nombre=c.nombre, telefono=c.telefono, nota=c.nota, orden=orden)
        )


def _reemplazar_entidades(cliente: Cliente, nuevas: list[EntidadIn]) -> None:
    actuales = [(e.rut, e.nombre) for e in cliente.entidades]
    deseadas = [(e.rut, e.nombre) for e in nuevas]
    if actuales == deseadas:
        return
    cliente.entidades.clear()
    for e in nuevas:
        cliente.entidades.append(ClienteEntidad(rut=e.rut, nombre=e.nombre))


@router.get("", response_model=List[ClienteOut])
def listar_clientes(
    buscar: str | None = Query(default=None, max_length=100),
    estado: str | None = Query(default=None, pattern="^(habilitado|deshabilitado)$"),
    db: Session = Depends(get_db),
    _actor: User = Depends(require_roles("rrhh")),
) -> List[ClienteOut]:
    """Cartera de clientes. `buscar` filtra por nombre, RUT o contacto."""
    consulta = db.query(Cliente).options(
        selectinload(Cliente.contactos), selectinload(Cliente.entidades)
    )
    if estado:
        consulta = consulta.filter(Cliente.estado == estado)
    if buscar:
        patron = f"%{buscar.strip()}%"
        consulta = (
            consulta.outerjoin(ClienteContacto).outerjoin(ClienteEntidad)
            .filter(or_(
                Cliente.nombre.ilike(patron),
                ClienteEntidad.rut.ilike(patron),
                ClienteContacto.nombre.ilike(patron),
                ClienteContacto.telefono.ilike(patron),
            ))
            .distinct()
        )
    clientes = consulta.order_by(Cliente.nombre).all()
    return [ClienteOut.model_validate(c) for c in clientes]


@router.get("/resumen", response_model=List[ClienteResumen])
def clientes_resumen(
    db: Session = Depends(get_db),
    _actor: User = Depends(require_roles("rrhh")),
) -> List[ClienteResumen]:
    """Lista liviana (id + nombre) para el selector del módulo de trabajos."""
    clientes = (
        db.query(Cliente)
        .filter(Cliente.estado == "habilitado")
        .order_by(Cliente.nombre)
        .all()
    )
    return [ClienteResumen.model_validate(c) for c in clientes]


@router.post("", response_model=ClienteOut, status_code=201)
def crear_cliente(
    payload: ClienteCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> ClienteOut:
    _assert_nombre_libre(db, payload.nombre)

    fijar_actor_auditoria(db, actor)
    cliente = Cliente(
        nombre=payload.nombre.strip(),
        email=(payload.email or "").strip() or None,
        fecha_ingreso=payload.fecha_ingreso,
    )
    _reemplazar_contactos(cliente, payload.contactos)
    _reemplazar_entidades(cliente, payload.entidades)
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    logger.info("Clientes crear -> id=%s actor=%s", cliente.id, actor.id)
    return ClienteOut.model_validate(cliente)


@router.put("/{cliente_id}", response_model=ClienteOut)
def actualizar_cliente(
    cliente_id: int,
    payload: ClienteUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> ClienteOut:
    cliente = _cliente_o_404(db, cliente_id)
    if payload.nombre is not None:
        _assert_nombre_libre(db, payload.nombre, excluir_id=cliente_id)

    fijar_actor_auditoria(db, actor)
    if payload.nombre is not None:
        cliente.nombre = payload.nombre.strip()
    if payload.email is not None:
        cliente.email = payload.email.strip() or None
    if payload.fecha_ingreso is not None:
        cliente.fecha_ingreso = payload.fecha_ingreso
    if payload.contactos is not None:
        _reemplazar_contactos(cliente, payload.contactos)
    if payload.entidades is not None:
        _reemplazar_entidades(cliente, payload.entidades)

    db.commit()
    db.refresh(cliente)
    logger.info("Clientes actualizar -> id=%s actor=%s", cliente_id, actor.id)
    return ClienteOut.model_validate(cliente)


@router.post("/{cliente_id}/deshabilitar", response_model=ClienteOut)
def deshabilitar_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> ClienteOut:
    """Baja LÓGICA: el cliente deja de aparecer en selectores, pero su
    historial de trabajos se conserva (retención tributaria)."""
    cliente = _cliente_o_404(db, cliente_id)
    fijar_actor_auditoria(db, actor)
    cliente.estado = "deshabilitado"
    db.commit()
    db.refresh(cliente)
    return ClienteOut.model_validate(cliente)


@router.post("/{cliente_id}/habilitar", response_model=ClienteOut)
def habilitar_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> ClienteOut:
    cliente = _cliente_o_404(db, cliente_id)
    fijar_actor_auditoria(db, actor)
    cliente.estado = "habilitado"
    db.commit()
    db.refresh(cliente)
    return ClienteOut.model_validate(cliente)


@router.get("/{cliente_id}", response_model=ClienteOut)
def obtener_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    _actor: User = Depends(require_roles("rrhh")),
) -> ClienteOut:
    return ClienteOut.model_validate(_cliente_o_404(db, cliente_id))


@router.get("/{cliente_id}/trabajos/total")
def total_trabajos_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    _actor: User = Depends(require_roles("rrhh")),
) -> dict[str, int]:
    """Nº de trabajos registrados del cliente (para la ficha)."""
    _cliente_o_404(db, cliente_id)
    total = db.query(Trabajo).filter(Trabajo.cliente_id == cliente_id).count()
    return {"total": total}
