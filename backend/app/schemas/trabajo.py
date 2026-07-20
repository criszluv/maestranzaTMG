# app/schemas/trabajo.py
"""Esquemas del módulo de trabajos realizados a clientes."""

from datetime import date, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

EstadoTrabajo = Literal["Pendiente", "En proceso", "Finalizado"]

# Valor en CLP: 0 permitido (garantías/sin cargo); tope defensivo.
_Valor = Field(default=None, ge=0, le=1_000_000_000_000)


class TrabajoCreate(BaseModel):
    cliente_id: int
    fecha: date
    hora: time | None = None
    estado: EstadoTrabajo = "Finalizado"
    valor: int | None = _Valor
    detalle: str = Field(min_length=1, max_length=2000)


class TrabajoUpdate(BaseModel):
    cliente_id: int | None = None
    fecha: date | None = None
    hora: time | None = None
    estado: EstadoTrabajo | None = None
    valor: int | None = _Valor
    detalle: str | None = Field(default=None, min_length=1, max_length=2000)


class TrabajoOut(BaseModel):
    id: int
    cliente_id: int
    cliente_nombre: str | None = None
    fecha: date
    hora: time | None = None
    estado: str
    valor: int | None = None
    detalle: str

    model_config = ConfigDict(from_attributes=True)
