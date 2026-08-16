# app/models/maquina.py
"""
Activos de planta monitoreados y los dispositivos que los reportan.

Antes la máquina era un `text` suelto dentro de cada métrica: no se podía
relacionar nada con ella (ni anomalías, ni órdenes de trabajo, ni KPIs).
Aquí pasa a ser una entidad de primera clase.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Maquina(Base):
    __tablename__ = "maquinas"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    ubicacion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Frecuencia de giro nominal (RPM). Define dónde caen 1x y sus armónicos
    # en el espectro: sin este dato el análisis de vibración no es interpretable.
    rpm_nominal: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # 'operativa' | 'detenida' | 'mantenimiento' | 'baja'
    estado: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'operativa'"), index=True,
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    actualizado_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    def __repr__(self) -> str:
        return f"<Maquina id={self.id} nombre={self.nombre!r} estado={self.estado!r}>"


class Dispositivo(Base):
    """
    Dispositivo de campo (ESP32) o banco de pruebas por software que publica
    telemetría de una máquina.

    `ultima_telemetria` es la marca de vida: si se queda atrás, el sensor dejó
    de reportar y ESO TAMBIÉN es un evento (silencio de sensor). Sin este
    registro, la app no se enteraría de que un sensor murió.
    """

    __tablename__ = "dispositivos"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    device_id: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    maquina_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("maquinas.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    fw: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ultima_telemetria: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    # 'activo' | 'inactivo'
    estado: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'activo'"),
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    actualizado_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    def __repr__(self) -> str:
        return f"<Dispositivo id={self.id} device_id={self.device_id!r}>"
