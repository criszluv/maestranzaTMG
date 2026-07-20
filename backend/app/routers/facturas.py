# app/routers/facturas.py
"""
Módulo de pagos pendientes (facturas por cobrar). Solo RRHH y Admin.

  GET    /facturas             lista con filtros (estado, cliente, texto,
                               solo_sin_vincular) — pendientes primero
  POST   /facturas             registra una factura
  PUT    /facturas/{id}        corrige datos / vincula-desvincula cliente
  POST   /facturas/{id}/pagar    marca pagada (fecha de pago hoy u opcional)
  POST   /facturas/{id}/reabrir  vuelve a pendiente (pago mal marcado)
  DELETE /facturas/{id}        SOLO admin (registro erróneo; queda auditado)

Diseño híbrido: `cliente_texto` conserva el nombre digitado; `cliente_id` es
el vínculo opcional a la cartera. Todo cambio queda en la auditoría con actor.
"""

import logging
from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import require_roles
from app.models import Cliente, Factura, User
from app.schemas.factura import FacturaCreate, FacturaOut, FacturaUpdate
from app.services.privacidad import fijar_actor_auditoria

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/facturas", tags=["Pagos pendientes"])


def _factura_o_404(db: Session, factura_id: int) -> Factura:
    factura = db.query(Factura).filter(Factura.id == factura_id).first()
    if factura is None:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return factura


def _cliente_o_error(db: Session, cliente_id: int) -> Cliente:
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if cliente is None:
        raise HTTPException(status_code=404, detail="El cliente indicado no existe.")
    return cliente


def _a_out(factura: Factura, cliente_nombre: str | None = None) -> FacturaOut:
    out = FacturaOut.model_validate(factura)
    out.cliente_nombre = cliente_nombre
    return out


@router.get("", response_model=List[FacturaOut])
def listar_facturas(
    estado: str | None = Query(default=None, pattern="^(pendiente|pagada)$"),
    cliente_id: int | None = Query(default=None),
    buscar: str | None = Query(default=None, max_length=100),
    solo_sin_vincular: bool = Query(default=False),
    limite: int = Query(default=500, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _actor: User = Depends(require_roles("rrhh")),
) -> List[FacturaOut]:
    """Facturas ordenadas de la más antigua a la más nueva (cobranza primero)."""
    consulta = (
        db.query(Factura, Cliente.nombre.label("cliente_nombre"))
        .outerjoin(Cliente, Factura.cliente_id == Cliente.id)
    )
    if estado:
        consulta = consulta.filter(Factura.estado == estado)
    if cliente_id is not None:
        consulta = consulta.filter(Factura.cliente_id == cliente_id)
    if solo_sin_vincular:
        consulta = consulta.filter(Factura.cliente_id.is_(None))
    if buscar:
        patron = f"%{buscar.strip()}%"
        filtros = [Factura.cliente_texto.ilike(patron), Cliente.nombre.ilike(patron)]
        if buscar.strip().isdigit():
            filtros.append(Factura.numero == int(buscar.strip()))
        consulta = consulta.filter(or_(*filtros))

    filas = (
        consulta.order_by(
            Factura.fecha_emision.asc().nulls_first(), Factura.id.asc()
        )
        .offset(offset)
        .limit(limite)
        .all()
    )
    return [_a_out(f, nombre) for f, nombre in filas]


@router.post("", response_model=FacturaOut, status_code=201)
def crear_factura(
    payload: FacturaCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> FacturaOut:
    cliente_nombre: str | None = None
    if payload.cliente_id is not None:
        cliente_nombre = _cliente_o_error(db, payload.cliente_id).nombre

    fijar_actor_auditoria(db, actor)
    factura = Factura(
        cliente_id=payload.cliente_id,
        # Sin texto explícito, se hereda el nombre real del cliente vinculado.
        cliente_texto=(payload.cliente_texto or "").strip() or (cliente_nombre or ""),
        numero=payload.numero,
        monto=payload.monto,
        fecha_emision=payload.fecha_emision,
        nota=(payload.nota or "").strip() or None,
    )
    db.add(factura)
    db.commit()
    db.refresh(factura)
    logger.info("Facturas crear -> id=%s actor=%s", factura.id, actor.id)
    return _a_out(factura, cliente_nombre)


@router.put("/{factura_id}", response_model=FacturaOut)
def actualizar_factura(
    factura_id: int,
    payload: FacturaUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> FacturaOut:
    factura = _factura_o_404(db, factura_id)
    datos = payload.model_dump(exclude_unset=True)

    if "cliente_id" in datos and datos["cliente_id"] is not None:
        _cliente_o_error(db, datos["cliente_id"])
    if "cliente_texto" in datos and not (datos["cliente_texto"] or "").strip():
        # El texto nunca queda vacío: es el respaldo cuando no hay vínculo.
        datos.pop("cliente_texto")

    fijar_actor_auditoria(db, actor)
    for campo, valor in datos.items():
        setattr(factura, campo, valor)
    db.commit()
    db.refresh(factura)

    nombre = (
        db.query(Cliente.nombre).filter(Cliente.id == factura.cliente_id).scalar()
        if factura.cliente_id
        else None
    )
    logger.info("Facturas actualizar -> id=%s actor=%s", factura_id, actor.id)
    return _a_out(factura, nombre)


@router.post("/{factura_id}/pagar", response_model=FacturaOut)
def pagar_factura(
    factura_id: int,
    fecha_pago: date | None = Query(default=None, description="Defecto: hoy."),
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> FacturaOut:
    """Marca la factura como pagada. Se conserva 6 años desde el pago."""
    factura = _factura_o_404(db, factura_id)
    if factura.estado == "pagada":
        raise HTTPException(status_code=409, detail="La factura ya está pagada.")

    fijar_actor_auditoria(db, actor)
    factura.estado = "pagada"
    factura.pagada_en = fecha_pago or date.today()
    db.commit()
    db.refresh(factura)
    nombre = (
        db.query(Cliente.nombre).filter(Cliente.id == factura.cliente_id).scalar()
        if factura.cliente_id
        else None
    )
    logger.info("Facturas pagar -> id=%s actor=%s", factura_id, actor.id)
    return _a_out(factura, nombre)


@router.post("/{factura_id}/reabrir", response_model=FacturaOut)
def reabrir_factura(
    factura_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("rrhh")),
) -> FacturaOut:
    """Deshace un pago mal marcado: vuelve a pendiente."""
    factura = _factura_o_404(db, factura_id)
    if factura.estado != "pagada":
        raise HTTPException(status_code=409, detail="La factura no está pagada.")

    fijar_actor_auditoria(db, actor)
    factura.estado = "pendiente"
    factura.pagada_en = None
    db.commit()
    db.refresh(factura)
    nombre = (
        db.query(Cliente.nombre).filter(Cliente.id == factura.cliente_id).scalar()
        if factura.cliente_id
        else None
    )
    logger.info("Facturas reabrir -> id=%s actor=%s", factura_id, actor.id)
    return _a_out(factura, nombre)


@router.delete("/{factura_id}", status_code=204)
def eliminar_factura(
    factura_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles()),  # SOLO admin
) -> None:
    """Borra un registro erróneo (doble digitación). Queda auditado con actor."""
    factura = _factura_o_404(db, factura_id)
    fijar_actor_auditoria(db, actor)
    db.delete(factura)
    db.commit()
    logger.warning("Facturas ELIMINAR -> id=%s actor=%s", factura_id, actor.id)
