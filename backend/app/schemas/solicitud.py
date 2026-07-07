# app/schemas/solicitud.py
"""Esquemas para solicitudes de días libres / permisos (módulo RRHH)."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

EstadoSolicitud = Literal["Pendiente", "Aprobada", "Rechazada"]


class SolicitudCreate(BaseModel):
    trabajador_id: int
    tipo: str = Field(min_length=1, max_length=60)
    motivo: str = Field(min_length=1, max_length=500)
    fecha_inicio: date
    fecha_fin: date

    @model_validator(mode="after")
    def _validar_rango_fechas(self) -> "SolicitudCreate":
        if self.fecha_fin < self.fecha_inicio:
            raise ValueError("La fecha de fin no puede ser anterior a la de inicio.")
        return self


class SolicitudOut(BaseModel):
    id: int
    trabajador_id: int
    nombre_trabajador: str | None = None
    tipo: str
    motivo: str
    fecha_inicio: date
    fecha_fin: date
    estado: str
    # Días hábiles que consume (0 si no es Vacaciones). Lo calcula el router.
    dias_habiles: int = 0
    # Adjunto opcional: True si la solicitud tiene un archivo cargado.
    tiene_adjunto: bool = False

    model_config = ConfigDict(from_attributes=True)


class EstadoSolicitudUpdate(BaseModel):
    estado: EstadoSolicitud


class SaldoVacacionesOut(BaseModel):
    """Saldo de días de vacaciones de un trabajador para un año."""

    anio: int
    dias_anuales: int
    dias_usados: int
    dias_disponibles: int


class SaldoTrabajadorOut(BaseModel):
    """Saldo de vacaciones con identificación del trabajador (vista RRHH/Admin)."""

    trabajador_id: int
    nombre: str
    rol: str
    anio: int
    dias_anuales: int
    dias_usados: int
    dias_disponibles: int


class AdjuntoSolicitudOut(BaseModel):
    """Metadatos + URL firmada temporal del adjunto de una solicitud."""

    solicitud_id: int
    nombre: str | None = None
    content_type: str
    tamano_bytes: int | None = None
    url: str
