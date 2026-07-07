# app/schemas/asistencia.py
"""
Esquemas del módulo de asistencia (marcaje vía API de Workera).

`JornadaOut` es el contrato con el frontend: una fila por trabajador y día,
con su primera entrada, última salida y el total de horas. Se construye en
app/services/asistencia.py a partir de las marcas crudas de Workera.
"""

from pydantic import BaseModel, ConfigDict


class JornadaOut(BaseModel):
    trabajador_id: int | str | None = None       # código de ficha en Workera
    nombre_trabajador: str | None = None
    identificacion: str | None = None            # RUT / pasaporte
    sucursal: str | None = None
    departamento: str | None = None
    fecha: str | None = None                     # YYYY-MM-DD
    hora_entrada: str | None = None              # ISO datetime de la 1ª entrada
    hora_salida: str | None = None               # ISO datetime de la última salida
    horas_brutas: float | None = None            # salida - entrada (sin descontar colación)
    horas_trabajadas: float | None = None        # NETO (bruto - colación); None = jornada en curso
    marcas: int = 0                              # nº de marcas consideradas ese día

    model_config = ConfigDict(extra="ignore")


class ReporteMensualOut(BaseModel):
    """Resumen mensual por trabajador (reportería de RRHH)."""

    trabajador_id: int | str | None = None
    nombre_trabajador: str | None = None
    identificacion: str | None = None
    sucursal: str | None = None
    departamento: str | None = None
    dias_asistidos: int = 0
    jornadas_completas: int = 0
    jornadas_incompletas: int = 0          # días sin marcar entrada o salida
    horas_trabajadas: float = 0.0          # total NETO del período
    horas_promedio: float | None = None    # por jornada completa

    model_config = ConfigDict(extra="ignore")
