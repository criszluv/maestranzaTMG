# app/routers/privacidad.py
"""
Derechos del titular de datos (Ley 21.719) — disponibles para CUALQUIER
usuario autenticado sobre SUS PROPIOS datos:

  GET /privacidad/politica   -> política de tratamiento (transparencia)
  GET /privacidad/mis-datos  -> derecho de acceso + portabilidad (JSON)
"""

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user
from app.models import User
from app.services.privacidad import POLITICA_TRATAMIENTO, datos_personales_de

router = APIRouter(prefix="/privacidad", tags=["Privacidad (Ley 21.719)"])


@router.get("/politica")
def politica_tratamiento(
    _actor: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Política de tratamiento de datos personales del portal."""
    return POLITICA_TRATAMIENTO


@router.get("/mis-datos")
def mis_datos(
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Todos los datos personales del usuario autenticado, en formato portable.
    Cada usuario SOLO puede ver los suyos (el id sale del JWT, no de la URL).
    """
    return datos_personales_de(db, actor)
