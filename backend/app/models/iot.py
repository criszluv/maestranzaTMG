# app/models/iot.py
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

# Nota: el marcaje de asistencia NO vive en este sistema (lo provee la API
# de Workera, ver app/services/workera.py); por eso no hay modelo de
# asistencia en la base de datos propia.


class IotMetrica(Base):
    """Métrica puntual de una máquina de la planta (sensores IoT)."""

    __tablename__ = "iot_metricas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    maquina: Mapped[str] = mapped_column(Text, nullable=False, index=True)

    temperatura: Mapped[float] = mapped_column(Float, nullable=False)
    humedad: Mapped[float] = mapped_column(Float, nullable=False)
    consumo_kw: Mapped[float] = mapped_column(Float, nullable=False)

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
