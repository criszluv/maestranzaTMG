# app/services/iot_metricas.py
"""
Lógica compartida del módulo de sensores IoT.

`podar_metricas` se usa desde el router (al crear métricas y en el endpoint
manual) y desde scripts/simulador_iot.py: una sola implementación (DRY).
"""

import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import IotMetrica

logger = logging.getLogger(__name__)

# Máximo de filas que mantenemos en la tabla (dashboard "en tiempo real").
MAX_METRICAS = 30


def podar_metricas(db: Session, max_registros: int = MAX_METRICAS) -> int:
    """
    Deja como máximo `max_registros` filas (las más recientes por timestamp)
    y borra el resto. Retorna cuántas filas eliminó.
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
        "IoT podar_metricas -> total=%s borradas=%s max=%s",
        total, borradas, max_registros,
    )
    return borradas
