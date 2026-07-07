# app/routers/asistencia.py
"""
Módulo de asistencia (marcaje): consulta el historial en la API de Workera.

  GET /rrhh/asistencia/historial?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&empleados=cod1,cod2

Solo RRHH y Admin (decisión de producto). La API key de Workera vive solo
en el backend: el navegador jamás la ve; este endpoint actúa de proxy con
control de acceso propio (JWT + rol).
"""

import calendar
import logging
from datetime import date, timedelta
from typing import List

import requests
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.config import settings
from app.dependencies import require_roles
from app.models import User
from app.schemas.asistencia import JornadaOut, ReporteMensualOut
from app.services.asistencia import agrupar_jornadas, resumen_mensual
from app.services.workera import WorkeraError, WorkeraNoConfigurado, obtener_marcas

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rrhh/asistencia", tags=["Asistencia (Workera)"])


@router.get("/historial", response_model=List[JornadaOut])
def historial_marcaje(
    desde: date | None = Query(
        default=None,
        description="Fecha inicial (YYYY-MM-DD). Defecto: hace "
        f"{settings.ASISTENCIA_DIAS_DEFECTO} días.",
    ),
    hasta: date | None = Query(
        default=None,
        description="Fecha final (YYYY-MM-DD). Defecto: hoy.",
    ),
    empleados: str | None = Query(
        default=None,
        max_length=200,
        # Solo códigos alfanuméricos separados por coma: lo que viaje a la API
        # de Workera no puede contener otros caracteres (anti-injection).
        pattern=r"^[A-Za-z0-9]+(,[A-Za-z0-9]+)*$",
        description="Códigos de ficha Workera separados por coma (opcional).",
    ),
    _actor: User = Depends(require_roles("rrhh")),
) -> List[JornadaOut]:
    """Jornadas diarias (entrada / salida / horas) calculadas desde Workera."""
    hoy = date.today()
    hasta = hasta or hoy
    desde = desde or hasta - timedelta(days=settings.ASISTENCIA_DIAS_DEFECTO)

    if desde > hasta:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="'desde' no puede ser posterior a 'hasta'.",
        )
    if (hasta - desde).days > settings.ASISTENCIA_RANGO_MAX_DIAS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Rango demasiado amplio: máximo "
                f"{settings.ASISTENCIA_RANGO_MAX_DIAS} días por consulta "
                "(la API de Workera se degrada con rangos densos)."
            ),
        )

    marcas = _consultar_marcas(desde=desde, hasta=hasta, empleados=empleados)
    jornadas = agrupar_jornadas(marcas)
    return [JornadaOut.model_validate(j) for j in jornadas]


def _consultar_marcas(
    *,
    desde: date,
    hasta: date,
    empleados: str | None = None,
    max_paginas: int | None = None,
) -> list[dict]:
    """Llama a Workera y traduce sus errores a HTTPException uniformes."""
    try:
        return obtener_marcas(
            desde=desde, hasta=hasta, empleados=empleados, max_paginas=max_paginas
        )
    except WorkeraNoConfigurado as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except WorkeraError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except requests.RequestException as e:
        logger.exception("Fallo de red consultando Workera")
        raise HTTPException(
            status_code=502,
            detail="No se pudo conectar con Workera. Verifica la conexión a internet del servidor.",
        ) from e


@router.get("/reporte", response_model=List[ReporteMensualOut])
def reporte_mensual(
    anio: int = Query(..., ge=2000, le=2100, description="Año del reporte (YYYY)."),
    mes: int = Query(..., ge=1, le=12, description="Mes del reporte (1-12)."),
    _actor: User = Depends(require_roles("rrhh")),
) -> List[ReporteMensualOut]:
    """
    Reporte de asistencia de un MES: una fila por trabajador con días
    asistidos, jornadas completas/incompletas y horas netas trabajadas.
    Solo RRHH y Admin.
    """
    primer_dia = date(anio, mes, 1)
    ultimo_dia = date(anio, mes, calendar.monthrange(anio, mes)[1])

    hoy = date.today()
    if primer_dia > hoy:
        return []  # mes futuro: aún no hay marcas
    # No consultamos fechas futuras (mes en curso -> hasta hoy).
    hasta = min(ultimo_dia, hoy)

    marcas = _consultar_marcas(
        desde=primer_dia,
        hasta=hasta,
        max_paginas=settings.WORKERA_MAX_PAGINAS_REPORTE,
    )
    resumen = resumen_mensual(marcas)
    return [ReporteMensualOut.model_validate(r) for r in resumen]
