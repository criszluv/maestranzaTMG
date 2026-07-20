# app/routers/trabajos.py
"""
Módulo de trabajos realizados a clientes. Solo RRHH y Admin.

  GET    /trabajos          lista con filtros (cliente, texto, rango de fechas)
  POST   /trabajos          registra un trabajo
  PUT    /trabajos/{id}     corrige un trabajo
  DELETE /trabajos/{id}     SOLO admin (borrar un registro comercial es
                            excepcional: queda en la auditoría con actor)

Registro comercial: conservación 6 años (art. 17 C. Tributario), la
depuración automática la hace la BD (fn_depurar_retencion).
"""

import logging
from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import require_roles
from app.models import Cliente, Trabajo, User
from app.schemas.trabajo import TrabajoCreate, TrabajoOut, TrabajoUpdate
from app.services.privacidad import fijar_actor_auditoria

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/trabajos", tags=["Trabajos"])


def _trabajo_o_404(db: Session, trabajo_id: int) -> Trabajo:
    trabajo = db.query(Trabajo).filter(Trabajo.id == trabajo_id).first()
    if trabajo is None:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    return trabajo


def _cliente_valido_o_error(db: Session, cliente_id: int) -> Cliente:
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if cliente is None:
        raise HTTPException(status_code=404, detail="El cliente indicado no existe.")
    return cliente


def _a_out(trabajo: Trabajo, cliente_nombre: str | None = None) -> TrabajoOut:
    out = TrabajoOut.model_validate(trabajo)
    out.cliente_nombre = cliente_nombre
    return out


@router.get("", response_model=List[TrabajoOut])
def listar_trabajos(
    cliente_id: int | None = Query(default=None),
    buscar: str | None = Query(default=None, max_length=100),
    desde: date | None = Query(default=None),
    hasta: date | None = Query(default=None),
    limite: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _actor: User = Depends(require_roles("rrhh")),
) -> List[TrabajoOut]:
    """Historial de trabajos, del más reciente al más antiguo."""
    consulta = (
        db.query(Trabajo, Cliente.nombre.label("cliente_nombre"))
        .join(Cliente, Trabajo.cliente_id == Cliente.id)
    )
    if cliente_id is not None:
        consulta = consulta.filter(Trabajo.cliente_id == cliente_id)
    if buscar:
        patron = f"%{buscar.strip()}%"
        consulta = consulta.filter(
            Trabajo.detalle.ilike(patron) | Cliente.nombre.ilike(patron)
        )
    if desde:
        consulta = consulta.filter(Trabajo.fecha >= desde)
    if hasta:
        consulta = consulta.filter(Trabajo.fecha <= hasta)

    filas = (
        consulta.order_by(Trabajo.fecha.desc(), Trabajo.hora.desc().nulls_last(), Trabajo.id.desc())
        .offset(offset)
        .limit(limite)
        .all()
    )
    return [_a_out(t, nombre) for t, nombre in filas]


@router.post("", response_model=TrabajoOut, status_code=201)
def crear_trabajo(
    payload: TrabajoCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> TrabajoOut:
    cliente = _cliente_valido_o_error(db, payload.cliente_id)

    fijar_actor_auditoria(db, actor)
    trabajo = Trabajo(**payload.model_dump())
    db.add(trabajo)
    db.commit()
    db.refresh(trabajo)
    logger.info("Trabajos crear -> id=%s cliente=%s actor=%s", trabajo.id, cliente.id, actor.id)
    return _a_out(trabajo, cliente.nombre)


@router.put("/{trabajo_id}", response_model=TrabajoOut)
def actualizar_trabajo(
    trabajo_id: int,
    payload: TrabajoUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> TrabajoOut:
    trabajo = _trabajo_o_404(db, trabajo_id)
    datos = payload.model_dump(exclude_unset=True)
    if "cliente_id" in datos and datos["cliente_id"] is not None:
        _cliente_valido_o_error(db, datos["cliente_id"])

    fijar_actor_auditoria(db, actor)
    for campo, valor in datos.items():
        setattr(trabajo, campo, valor)
    db.commit()
    db.refresh(trabajo)

    nombre = db.query(Cliente.nombre).filter(Cliente.id == trabajo.cliente_id).scalar()
    logger.info("Trabajos actualizar -> id=%s actor=%s", trabajo_id, actor.id)
    return _a_out(trabajo, nombre)


@router.delete("/{trabajo_id}", status_code=204)
def eliminar_trabajo(
    trabajo_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles()),  # SOLO admin
) -> None:
    """Borra un registro erróneo (doble digitación). Queda auditado con actor."""
    trabajo = _trabajo_o_404(db, trabajo_id)
    fijar_actor_auditoria(db, actor)
    db.delete(trabajo)
    db.commit()
    logger.warning("Trabajos ELIMINAR -> id=%s actor=%s", trabajo_id, actor.id)
