# app/services/vacaciones.py
"""
Saldo de vacaciones por trabajador.

Regla de negocio (confirmada con la empresa):
  - Cada trabajador tiene settings.VACACIONES_DIAS_ANUALES (15) días por año.
  - Solo las solicitudes de tipo settings.VACACIONES_TIPO ("Vacaciones") y
    en estado 'Aprobada' descuentan del saldo.
  - Los días se cuentan HÁBILES (lunes a viernes) del rango [inicio, fin].
    (No se excluyen feriados; se puede afinar más adelante.)
  - El saldo es por AÑO CALENDARIO, atribuido al año de fecha_inicio.

Es una capa de dominio: `dias_habiles` es pura; `saldo_vacaciones` consulta la
BD (solicitudes aprobadas) pero no sabe nada de HTTP.
"""

from datetime import date, timedelta
from typing import Any

from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import SolicitudRRHH


def dias_habiles(inicio: date, fin: date) -> int:
    """Número de días lunes-viernes en [inicio, fin] (ambos inclusive)."""
    if fin < inicio:
        return 0
    total = 0
    dia = inicio
    while dia <= fin:
        if dia.weekday() < 5:  # 0=lunes ... 4=viernes; 5,6 = fin de semana
            total += 1
        dia += timedelta(days=1)
    return total


def dias_solicitud(solicitud: SolicitudRRHH) -> int:
    """Días hábiles que consume una solicitud (0 si no es de tipo Vacaciones)."""
    if solicitud.tipo != settings.VACACIONES_TIPO:
        return 0
    return dias_habiles(solicitud.fecha_inicio, solicitud.fecha_fin)


def saldo_vacaciones(
    db: Session,
    trabajador_id: int,
    anio: int | None = None,
) -> dict[str, Any]:
    """
    Devuelve el saldo de vacaciones de un trabajador para un año:
      { anio, dias_anuales, dias_usados, dias_disponibles }.
    `dias_usados` = suma de días hábiles de sus solicitudes de Vacaciones
    APROBADAS cuyo fecha_inicio cae en ese año.
    """
    if anio is None:
        anio = date.today().year

    aprobadas = (
        db.query(SolicitudRRHH)
        .filter(
            SolicitudRRHH.trabajador_id == trabajador_id,
            SolicitudRRHH.tipo == settings.VACACIONES_TIPO,
            SolicitudRRHH.estado == "Aprobada",
            extract("year", SolicitudRRHH.fecha_inicio) == anio,
        )
        .all()
    )
    usados = sum(dias_habiles(s.fecha_inicio, s.fecha_fin) for s in aprobadas)
    anuales = settings.VACACIONES_DIAS_ANUALES

    return {
        "anio": anio,
        "dias_anuales": anuales,
        "dias_usados": usados,
        "dias_disponibles": anuales - usados,
    }


def dias_usados_por_trabajador(
    db: Session,
    anio: int | None = None,
) -> dict[int, int]:
    """
    Días hábiles de Vacaciones aprobadas por trabajador para un año, en UNA
    consulta (evita N+1 al listar el saldo de todos). Devuelve {trabajador_id:
    dias_usados}; los trabajadores sin vacaciones no aparecen (0 implícito).
    """
    if anio is None:
        anio = date.today().year

    filas = (
        db.query(SolicitudRRHH)
        .filter(
            SolicitudRRHH.tipo == settings.VACACIONES_TIPO,
            SolicitudRRHH.estado == "Aprobada",
            extract("year", SolicitudRRHH.fecha_inicio) == anio,
        )
        .all()
    )
    usados: dict[int, int] = {}
    for s in filas:
        usados[s.trabajador_id] = usados.get(s.trabajador_id, 0) + dias_habiles(
            s.fecha_inicio, s.fecha_fin
        )
    return usados
