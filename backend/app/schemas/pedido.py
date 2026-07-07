# app/schemas/pedido.py
"""Esquemas del módulo de pedidos (órdenes de trabajo)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

EstadoPedido = Literal["pendiente", "en proceso", "terminado"]

# Límites de texto y de valor: evitan cadenas gigantes y montos absurdos
# (defensa en profundidad, además del tope global de tamaño de payload).
_Valor = Field(default=None, ge=0, le=1_000_000_000_000)


class PedidoCreate(BaseModel):
    pedido: str = Field(min_length=1, max_length=200)
    descripcion: str | None = Field(default=None, max_length=2000)
    estado: EstadoPedido = "pendiente"
    valor: int | None = _Valor
    encargado_id: int | None = None


class PedidoUpdate(BaseModel):
    pedido: str | None = Field(default=None, min_length=1, max_length=200)
    descripcion: str | None = Field(default=None, max_length=2000)
    estado: EstadoPedido | None = None
    valor: int | None = _Valor
    encargado_id: int | None = None


class PedidoEstadoUpdate(BaseModel):
    estado: EstadoPedido


class PedidoOut(BaseModel):
    id: int
    pedido: str
    descripcion: str | None = None
    estado: str
    valor: int | None = None
    encargado_id: int | None = None
    encargado_nombre: str | None = None

    model_config = ConfigDict(from_attributes=True)


class FotoPedidoOut(BaseModel):
    """Foto de progreso visible. `url` es una URL firmada TEMPORAL del bucket
    privado (expira; el frontend la usa al momento, no la persiste)."""

    id: int
    pedido_id: int
    subido_por: int
    subido_por_nombre: str | None = None
    nombre_original: str | None = None
    tamano_bytes: int
    content_type: str
    subida_en: datetime
    url: str

    model_config = ConfigDict(from_attributes=True)
