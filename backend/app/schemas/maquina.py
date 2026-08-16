# app/schemas/maquina.py
"""Esquemas del módulo de máquinas de planta (activos monitoreados)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

EstadoMaquina = Literal["operativa", "detenida", "mantenimiento", "baja"]

# Rango defensivo de RPM: cubre desde una prensa lenta hasta un husillo rápido.
_Rpm = Field(default=None, ge=1, le=100_000)


class MaquinaCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    ubicacion: str | None = Field(default=None, max_length=120)
    rpm_nominal: int | None = _Rpm
    estado: EstadoMaquina = "operativa"


class MaquinaUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=120)
    ubicacion: str | None = Field(default=None, max_length=120)
    rpm_nominal: int | None = _Rpm
    estado: EstadoMaquina | None = None


class MaquinaOut(BaseModel):
    id: int
    nombre: str
    ubicacion: str | None = None
    rpm_nominal: int | None = None
    estado: str
    # Última telemetría recibida: si está vacía o muy atrás, la máquina no
    # está reportando (dato clave para el monitoreo).
    ultima_lectura: datetime | None = None
    lecturas: int = 0

    model_config = ConfigDict(from_attributes=True)
