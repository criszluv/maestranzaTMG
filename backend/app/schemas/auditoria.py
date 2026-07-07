# app/schemas/auditoria.py
"""Esquema de salida del visor de auditoría (registro de cambios)."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AuditoriaOut(BaseModel):
    id: int
    tabla: str
    operacion: str                     # INSERT | UPDATE | DELETE
    registro_id: str | None = None
    actor_app: str | None = None       # "id|email" del usuario de la app
    actor_bd: str | None = None
    datos_antes: dict[str, Any] | None = None
    datos_despues: dict[str, Any] | None = None
    ocurrido_en: datetime

    model_config = ConfigDict(from_attributes=True)
