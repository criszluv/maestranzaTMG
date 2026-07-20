# app/schemas/factura.py
"""
Esquemas del módulo de pagos pendientes (facturas por cobrar).

Regla del diseño híbrido: una factura necesita al menos UNA identificación
del cliente — el vínculo real (`cliente_id`) o el nombre escrito
(`cliente_texto`). Si solo viene el vínculo, el router completa el texto con
el nombre del cliente.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

EstadoFactura = Literal["pendiente", "pagada"]

# Monto en CLP: 0 permitido; tope defensivo.
_Monto = Field(default=None, ge=0, le=1_000_000_000_000)


class FacturaCreate(BaseModel):
    cliente_id: int | None = None
    cliente_texto: str | None = Field(default=None, max_length=200)
    numero: int | None = Field(default=None, ge=0, le=100_000_000)
    monto: int | None = _Monto
    fecha_emision: date | None = None
    nota: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _cliente_presente(self) -> "FacturaCreate":
        if self.cliente_id is None and not (self.cliente_texto or "").strip():
            raise ValueError(
                "Indica el cliente: selecciónalo de la cartera o escribe su nombre."
            )
        return self


class FacturaUpdate(BaseModel):
    # cliente_id explícito con null = desvincular; por eso se distingue
    # "no enviado" (campo ausente) de "enviado como null" vía exclude_unset.
    cliente_id: int | None = None
    cliente_texto: str | None = Field(default=None, max_length=200)
    numero: int | None = Field(default=None, ge=0, le=100_000_000)
    monto: int | None = _Monto
    fecha_emision: date | None = None
    nota: str | None = Field(default=None, max_length=500)


class FacturaOut(BaseModel):
    id: int
    cliente_id: int | None = None
    cliente_nombre: str | None = None      # nombre real del cliente vinculado
    cliente_texto: str
    numero: int | None = None
    monto: int | None = None
    fecha_emision: date | None = None
    estado: str
    pagada_en: date | None = None
    nota: str | None = None

    model_config = ConfigDict(from_attributes=True)
