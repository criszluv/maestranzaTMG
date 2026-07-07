# app/schemas/iot.py
"""Esquemas del módulo de sensores IoT (dashboard y reportería)."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# Los sensores mandan números finitos: rechazar inf/nan evita valores basura
# que ensucian promedios y reportería.
_Medicion = Field(allow_inf_nan=False)


class MetricaCrear(BaseModel):
    maquina: str = Field(min_length=1, max_length=80)
    temperatura: float = _Medicion
    humedad: float = _Medicion
    consumo_kw: float = _Medicion


class MetricaRespuesta(BaseModel):
    id: int
    maquina: str
    temperatura: float
    humedad: float
    consumo_kw: float
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class ResumenPorMaquina(BaseModel):
    maquina: str
    temperatura_promedio: float | None = None
    consumo_promedio_kw: float | None = None
    mediciones: int
