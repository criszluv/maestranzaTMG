# app/services/iot_metricas.py
"""
Lógica compartida del módulo de sensores IoT.

HISTORIA DE ESTE ARCHIVO — importante para entender el cambio:

Antes existía `MAX_METRICAS = 30` y cada inserción podaba la tabla para
dejar solo las 30 filas más recientes. Es decir: **la aplicación borraba su
propia historia**. Con 30 filas no hay serie de tiempo, y sin serie de
tiempo no se puede calcular una tendencia, entrenar un detector ni medir un
KPI de proceso. Era el techo real del módulo.

Hoy la telemetría se conserva y la retención la decide UNA sola política, en
la base de datos: `fn_depurar_retencion()` elimina métricas con más de 90
días (migración 001). El borrado deja de ser un efecto colateral de escribir.

`podar_metricas` se conserva solo como herramienta de mantenimiento manual
(endpoint admin) para casos puntuales, no como parte del flujo de ingesta.
"""

import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import IotMetrica

logger = logging.getLogger(__name__)

# Tope de seguridad para la poda MANUAL. No se aplica al insertar.
PODA_MANUAL_POR_DEFECTO = 10_000


def podar_metricas(db: Session, max_registros: int = PODA_MANUAL_POR_DEFECTO) -> int:
    """
    Deja como máximo `max_registros` filas (las más recientes por timestamp)
    y borra el resto. Retorna cuántas filas eliminó.

    Solo se invoca a petición explícita de un admin: la retención normal la
    aplica la base de datos por antigüedad, no por cantidad.
    """
    total: int = db.query(func.count(IotMetrica.id)).scalar() or 0
    if total <= max_registros:
        return 0

    filas_sobrantes = (
        db.query(IotMetrica.id)
        .order_by(IotMetrica.timestamp.desc())
        .offset(max_registros)
        .all()
    )
    ids_sobrantes = [fila.id for fila in filas_sobrantes]
    if not ids_sobrantes:
        return 0

    borradas = (
        db.query(IotMetrica)
        .filter(IotMetrica.id.in_(ids_sobrantes))
        .delete(synchronize_session=False)
    )
    db.commit()
    logger.warning(
        "IoT podar_metricas (MANUAL) -> total=%s borradas=%s max=%s",
        total, borradas, max_registros,
    )
    return borradas
