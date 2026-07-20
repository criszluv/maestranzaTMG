# app/schemas/cliente.py
"""
Esquemas del módulo de clientes.

Entrada validada estricta (programación segura):
  - RUT con dígito verificador (módulo 11), normalizado a "12.345.678-9".
  - Teléfono solo dígitos/espacios/+/- (7 a 15 caracteres).
  - Largos máximos en todo texto libre.
El email del cliente es texto libre (hay clientes con 2+ correos en el campo).
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.rut import normalizar_rut

EstadoCliente = Literal["habilitado", "deshabilitado"]

_TELEFONO_RE = r"^\+?[\d\s-]{7,15}$"


class ContactoIn(BaseModel):
    nombre: str | None = Field(default=None, max_length=120)
    telefono: str | None = Field(default=None, pattern=_TELEFONO_RE)
    nota: str | None = Field(default=None, max_length=60)


class ContactoOut(ContactoIn):
    id: int
    orden: int = 1

    model_config = ConfigDict(from_attributes=True)


class EntidadIn(BaseModel):
    rut: str = Field(max_length=15)
    nombre: str | None = Field(default=None, max_length=120)

    @field_validator("rut")
    @classmethod
    def _rut_valido(cls, v: str) -> str:
        return normalizar_rut(v)  # ValueError -> 422 con mensaje claro


class EntidadOut(BaseModel):
    id: int
    rut: str
    nombre: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ClienteBase(BaseModel):
    nombre: str = Field(min_length=2, max_length=200)
    email: str | None = Field(default=None, max_length=200)
    fecha_ingreso: date | None = None


class ClienteCreate(ClienteBase):
    # Máximos razonables: la planilla histórica llega a 3 contactos y 2 RUT.
    contactos: list[ContactoIn] = Field(default_factory=list, max_length=5)
    entidades: list[EntidadIn] = Field(default_factory=list, max_length=5)


class ClienteUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=200)
    email: str | None = Field(default=None, max_length=200)
    fecha_ingreso: date | None = None
    # None = no tocar; lista = reemplaza el conjunto completo.
    contactos: list[ContactoIn] | None = Field(default=None, max_length=5)
    entidades: list[EntidadIn] | None = Field(default=None, max_length=5)


class ClienteOut(BaseModel):
    id: int
    nombre: str
    email: str | None = None
    fecha_ingreso: date | None = None
    estado: str
    contactos: list[ContactoOut] = []
    entidades: list[EntidadOut] = []

    model_config = ConfigDict(from_attributes=True)


class ClienteResumen(BaseModel):
    """Versión liviana para selectores (módulo de trabajos)."""

    id: int
    nombre: str
    estado: str

    model_config = ConfigDict(from_attributes=True)
