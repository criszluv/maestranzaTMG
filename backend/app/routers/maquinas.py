# app/routers/maquinas.py
"""
Máquinas de planta (activos monitoreados).

Ver: admin y empleados (trabajan con ellas).
Crear / editar: solo admin — renombrar una máquina o cambiar sus RPM
afecta la interpretación de toda su telemetría histórica.

  GET    /maquinas        lista con su última lectura y total de telemetría
  POST   /maquinas        registra una máquina
  PUT    /maquinas/{id}   corrige datos (RPM nominal, ubicación, estado)

Por qué existe este módulo: `rpm_nominal` es el dato que hace interpretable
el análisis de vibración (define dónde caen 1x y sus armónicos en el
espectro). Sin un lugar donde mantenerlo, el diagnóstico de una anomalía no
es defendible.

No hay DELETE a propósito: una máquina con historia de telemetría y órdenes
de trabajo no se borra, se da de baja (estado = 'baja').
"""

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import require_roles
from app.models import IotMetrica, Maquina, User
from app.schemas.maquina import MaquinaCreate, MaquinaOut, MaquinaUpdate
from app.services.privacidad import fijar_actor_auditoria

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/maquinas", tags=["Máquinas"])


def _maquina_o_404(db: Session, maquina_id: int) -> Maquina:
    maquina = db.query(Maquina).filter(Maquina.id == maquina_id).first()
    if maquina is None:
        raise HTTPException(status_code=404, detail="Máquina no encontrada")
    return maquina


def _assert_nombre_libre(db: Session, nombre: str, excluir_id: int | None = None) -> None:
    """El nombre identifica la máquina en la telemetría: debe ser único."""
    consulta = db.query(Maquina).filter(
        func.upper(Maquina.nombre) == nombre.strip().upper()
    )
    if excluir_id is not None:
        consulta = consulta.filter(Maquina.id != excluir_id)
    if consulta.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una máquina con ese nombre.",
        )


@router.get("", response_model=List[MaquinaOut])
def listar_maquinas(
    incluir_bajas: bool = Query(default=False),
    db: Session = Depends(get_db),
    _actor: User = Depends(require_roles("empleado")),
) -> List[MaquinaOut]:
    """Máquinas con el resumen de su telemetría (última lectura y volumen)."""
    consulta = db.query(Maquina)
    if not incluir_bajas:
        consulta = consulta.filter(Maquina.estado != "baja")
    maquinas = consulta.order_by(Maquina.nombre).all()

    # Resumen de telemetría por máquina, en una sola consulta.
    resumen = dict(
        (fila.maquina_id, (fila.ultima, fila.total))
        for fila in db.query(
            IotMetrica.maquina_id.label("maquina_id"),
            func.max(IotMetrica.timestamp).label("ultima"),
            func.count(IotMetrica.id).label("total"),
        )
        .filter(IotMetrica.maquina_id.isnot(None))
        .group_by(IotMetrica.maquina_id)
        .all()
    )

    salida: list[MaquinaOut] = []
    for m in maquinas:
        out = MaquinaOut.model_validate(m)
        ultima, total = resumen.get(m.id, (None, 0))
        out.ultima_lectura = ultima
        out.lecturas = total
        salida.append(out)
    return salida


@router.post("", response_model=MaquinaOut, status_code=201)
def crear_maquina(
    payload: MaquinaCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles()),  # solo admin
) -> MaquinaOut:
    _assert_nombre_libre(db, payload.nombre)

    fijar_actor_auditoria(db, actor)
    maquina = Maquina(
        nombre=payload.nombre.strip(),
        ubicacion=(payload.ubicacion or "").strip() or None,
        rpm_nominal=payload.rpm_nominal,
        estado=payload.estado,
    )
    db.add(maquina)
    db.commit()
    db.refresh(maquina)
    logger.info("Maquinas crear -> id=%s actor=%s", maquina.id, actor.id)
    return MaquinaOut.model_validate(maquina)


@router.put("/{maquina_id}", response_model=MaquinaOut)
def actualizar_maquina(
    maquina_id: int,
    payload: MaquinaUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles()),  # solo admin
) -> MaquinaOut:
    maquina = _maquina_o_404(db, maquina_id)
    datos = payload.model_dump(exclude_unset=True)

    if "nombre" in datos and datos["nombre"] is not None:
        _assert_nombre_libre(db, datos["nombre"], excluir_id=maquina_id)
        datos["nombre"] = datos["nombre"].strip()
    if "ubicacion" in datos:
        datos["ubicacion"] = (datos["ubicacion"] or "").strip() or None

    fijar_actor_auditoria(db, actor)
    for campo, valor in datos.items():
        setattr(maquina, campo, valor)
    db.commit()
    db.refresh(maquina)
    logger.info("Maquinas actualizar -> id=%s actor=%s", maquina_id, actor.id)
    return MaquinaOut.model_validate(maquina)
