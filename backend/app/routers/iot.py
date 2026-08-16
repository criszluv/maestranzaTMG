# app/routers/iot.py
"""
Módulo de sensores IoT (dashboard de máquinas + reportería CSV).

Lecturas: admin y empleados (operación de planta). RRHH queda fuera:
gestiona personas, no máquinas.
Escrituras (crear / podar métricas): solo admin.
"""

import csv
import io
import logging
from typing import List

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import require_roles
from app.models import IotMetrica, Maquina
from app.schemas.iot import MetricaCrear, MetricaRespuesta, ResumenPorMaquina
from app.services.iot_metricas import PODA_MANUAL_POR_DEFECTO, podar_metricas

# El monitoreo de planta es asunto de operaciones: lo ven admin y empleados.
# RRHH gestiona personas, no máquinas, así que queda fuera (require_roles
# siempre incluye a admin como superusuario).
router = APIRouter(
    prefix="/iot",
    tags=["IoT"],
    dependencies=[Depends(require_roles("empleado"))],
)

logger = logging.getLogger(__name__)

# Caracteres que, al inicio de una celda, Excel/LibreOffice interpretan como
# fórmula (CSV / formula injection, CWE-1236). Antepondemos un apóstrofo para
# neutralizarlos sin perder el valor mostrado.
_CSV_PELIGROSOS = ("=", "+", "-", "@", "\t", "\r")


def _csv_seguro(valor: object) -> str:
    """Neutraliza celdas que empezarían por un carácter de fórmula."""
    texto = "" if valor is None else str(valor)
    if texto and texto[0] in _CSV_PELIGROSOS:
        return "'" + texto
    return texto


@router.post(
    "/metricas",
    response_model=MetricaRespuesta,
    status_code=201,
    dependencies=[Depends(require_roles())],  # solo admin
)
def crear_metrica(
    payload: MetricaCrear,
    db: Session = Depends(get_db),
) -> MetricaRespuesta:
    """
    Registra una lectura de telemetría. La fila se CONSERVA: la retención la
    aplica la base de datos por antigüedad (90 días), no borrando en cada
    inserción como antes. Sin historia no hay serie de tiempo ni detección.

    Si el nombre de la máquina coincide con una máquina registrada, la lectura
    queda vinculada a ella (`maquina_id`), que es lo que permite relacionar
    telemetría, anomalías y órdenes de trabajo.
    """
    maquina = db.query(Maquina).filter(Maquina.nombre == payload.maquina).first()

    registro = IotMetrica(
        maquina=payload.maquina,
        maquina_id=maquina.id if maquina else None,
        temperatura=payload.temperatura,
        humedad=payload.humedad,
        consumo_kw=payload.consumo_kw,
    )
    db.add(registro)
    db.commit()
    db.refresh(registro)
    return MetricaRespuesta.model_validate(registro)


@router.post("/metricas/podar", dependencies=[Depends(require_roles())])  # solo admin
def podar_metricas_endpoint(
    max_registros: int = Query(PODA_MANUAL_POR_DEFECTO, ge=1),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    """
    Poda MANUAL de la tabla (mantenimiento excepcional). La retención normal
    la hace fn_depurar_retencion() por antigüedad.
    """
    borradas = podar_metricas(db, max_registros)
    return {"eliminadas": borradas}


@router.get("/metricas", response_model=List[MetricaRespuesta])
def obtener_metricas_recientes(
    limite: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
) -> List[MetricaRespuesta]:
    """Últimas N métricas para el dashboard en tiempo real."""
    registros = (
        db.query(IotMetrica)
        .order_by(IotMetrica.timestamp.desc())
        .limit(limite)
        .all()
    )
    return [MetricaRespuesta.model_validate(r) for r in registros]


@router.get("/exportar_csv")
def exportar_metricas_csv(db: Session = Depends(get_db)) -> StreamingResponse:
    """Reportería: descarga un CSV con el histórico de métricas."""
    registros = db.query(IotMetrica).order_by(IotMetrica.timestamp.desc()).all()

    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(
        ["ID", "Máquina", "Temperatura (°C)", "Humedad (%)", "Consumo (kW)", "Fecha/Hora"]
    )
    for reg in registros:
        # `maquina` es texto libre: se sanea contra inyección de fórmulas.
        # El resto son numéricos/fecha generados por el sistema (sin riesgo).
        writer.writerow(
            [
                reg.id,
                _csv_seguro(reg.maquina),
                reg.temperatura,
                reg.humedad,
                reg.consumo_kw,
                reg.timestamp,
            ]
        )

    stream.seek(0)
    csv_bytes = stream.getvalue().encode("utf-8-sig")

    response = StreamingResponse(iter([csv_bytes]), media_type="text/csv; charset=utf-8")
    response.headers["Content-Disposition"] = 'attachment; filename="reporte_iot_completo.csv"'
    logger.info("IoT /exportar_csv -> %s registros", len(registros))
    return response


@router.get("/metricas/count")
def contar_metricas(db: Session = Depends(get_db)) -> dict[str, int]:
    """Número total de filas en la tabla de métricas IoT."""
    total = db.query(IotMetrica).count()
    return {"total": total}


@router.get("/metricas/resumen", response_model=List[ResumenPorMaquina])
def resumen_por_maquina(
    dias: int = Query(1, ge=1),
    db: Session = Depends(get_db),
) -> List[ResumenPorMaquina]:
    """Resumen por máquina en los últimos N días: promedios y nº de mediciones."""
    limite_tiempo = func.now() - func.make_interval(0, 0, 0, dias)

    rows = (
        db.query(
            IotMetrica.maquina,
            func.avg(IotMetrica.temperatura).label("temperatura_promedio"),
            func.avg(IotMetrica.consumo_kw).label("consumo_promedio_kw"),
            func.count().label("mediciones"),
        )
        .filter(IotMetrica.timestamp >= limite_tiempo)
        .group_by(IotMetrica.maquina)
        .all()
    )

    return [
        ResumenPorMaquina(
            maquina=row.maquina,
            temperatura_promedio=float(row.temperatura_promedio)
            if row.temperatura_promedio is not None
            else None,
            consumo_promedio_kw=float(row.consumo_promedio_kw)
            if row.consumo_promedio_kw is not None
            else None,
            mediciones=row.mediciones,
        )
        for row in rows
    ]
