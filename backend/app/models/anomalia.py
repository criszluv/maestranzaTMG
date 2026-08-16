# app/models/anomalia.py
"""
Anomalía detectada sobre la telemetría de una máquina.

Es la pieza que conecta el monitoreo con el trabajo real: una anomalía
validada por un técnico genera una ORDEN DE TRABAJO de mantenimiento en el
módulo de pedidos, y al cerrarla el técnico indica si la alerta era real.
Esa realimentación (`era_real`) es la que permite medir falsos positivos y
ajustar el detector: el sistema aprende de su propia operación.

Ciclo:
    detectada ──► validada ──► resuelta      (era_real = true)
        └───────► descartada                 (era_real = false)
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Anomalia(Base):
    __tablename__ = "anomalias"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    maquina_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("maquinas.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # desbalance | rodamiento | sobrecarga | sensor_fallo | silencio
    tipo: Mapped[str] = mapped_column(Text, nullable=False)
    # baja | media | alta | critica
    severidad: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'media'"),
    )
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    detectada_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True,
    )
    ventana_inicio: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    ventana_fin: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    detalle: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # detectada | validada | descartada | resuelta
    estado: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'detectada'"), index=True,
    )
    # Orden de trabajo generada al validar (cierre del ciclo con `pedido`).
    pedido_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("pedido.id", ondelete="SET NULL"), nullable=True,
    )
    validada_por: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=True,
    )
    validada_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    # Realimentación del técnico: alimenta la tasa de falsos positivos.
    era_real: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    actualizado_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    def __repr__(self) -> str:
        return (
            f"<Anomalia id={self.id} maquina_id={self.maquina_id} "
            f"tipo={self.tipo!r} estado={self.estado!r}>"
        )
