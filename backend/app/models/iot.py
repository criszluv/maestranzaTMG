# app/models/iot.py
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, BigInteger, DateTime, Float, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

# Nota: el marcaje de asistencia NO vive en este sistema (lo provee la API
# de Workera, ver app/services/workera.py); por eso no hay modelo de
# asistencia en la base de datos propia.


class IotMetrica(Base):
    """
    Telemetría de una máquina de la planta.

    Implementa el CONTRATO DE MENSAJES del dispositivo de campo. La decisión
    de diseño importante: el dispositivo envía CARACTERÍSTICAS de la vibración
    (RMS, kurtosis, factor de cresta, picos del espectro), no la señal cruda.
    Eso reduce ancho de banda y almacenamiento en varios órdenes de magnitud,
    y permite mover la inferencia al propio dispositivo más adelante.

    El contrato se respeta igual si el productor es el banco de pruebas por
    software o un ESP32 real: cambiar uno por otro no toca nada aguas abajo.
    """

    __tablename__ = "iot_metricas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Nombre de la máquina tal como llegó. Se conserva por compatibilidad
    # histórica; la relación real es `maquina_id`.
    maquina: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    maquina_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("maquinas.id"), nullable=True, index=True,
    )
    dispositivo_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("dispositivos.id", ondelete="SET NULL"), nullable=True,
    )

    # --- Magnitudes de proceso ---
    temperatura: Mapped[float] = mapped_column(Float, nullable=False)
    humedad: Mapped[float] = mapped_column(Float, nullable=False)
    consumo_kw: Mapped[float] = mapped_column(Float, nullable=False)
    corriente_a: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # --- Características de vibración (calculadas en el dispositivo) ---
    # Ancho de la ventana de muestreo con la que se calcularon.
    ventana_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    vib_rms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vib_kurtosis: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vib_factor_cresta: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Picos del espectro: [[hz, amplitud], ...]
    # jsonb en Postgres; JSON genérico cruza a SQLite en los tests.
    vib_picos: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)

    # 'ok' | 'degradada' | 'sensor_fallo' — un dato malo no debe alimentar
    # al detector como si fuera bueno.
    calidad: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    def __repr__(self) -> str:
        return (
            f"<IotMetrica id={self.id} maquina={self.maquina!r} "
            f"temp={self.temperatura} ts={self.timestamp}>"
        )
