# app/routers/auditoria.py
"""
Visor del registro de cambios (auditoría, Ley 21.719).

La tabla la escriben los triggers de la BD; aquí solo se CONSULTA. Acceso
restringido a RRHH y Admin (oversight). Filtrable por tabla.

  GET /api/auditoria?tabla=users&limite=100&offset=0
"""

from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import require_roles
from app.models import Auditoria, User
from app.schemas.auditoria import AuditoriaOut

router = APIRouter(prefix="/auditoria", tags=["Auditoría (Ley 21.719)"])

_TABLAS_VALIDAS = ("users", "rrhh_solicitudes", "pedido")


@router.get("", response_model=List[AuditoriaOut])
def listar_auditoria(
    tabla: str | None = Query(
        default=None,
        description="Filtra por tabla: users | rrhh_solicitudes | pedido.",
    ),
    limite: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _actor: User = Depends(require_roles("rrhh")),
) -> List[AuditoriaOut]:
    """Registro de cambios sobre datos personales, del más reciente al más antiguo."""
    consulta = db.query(Auditoria)
    if tabla in _TABLAS_VALIDAS:
        consulta = consulta.filter(Auditoria.tabla == tabla)
    filas = (
        consulta.order_by(Auditoria.ocurrido_en.desc(), Auditoria.id.desc())
        .offset(offset)
        .limit(limite)
        .all()
    )
    return [AuditoriaOut.model_validate(f) for f in filas]
