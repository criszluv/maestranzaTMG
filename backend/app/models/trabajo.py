# app/models/trabajo.py
from datetime import date, datetime, time
from typing import Optional

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Integer, Text, Time, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.cliente import Cliente


class Trabajo(Base):
    """
    Trabajo realizado a un cliente (registro comercial de la maestranza).
    Distinto de `pedido` (orden de trabajo interna asignada a un empleado):
    aquí queda el historial facturable por cliente, con valor y detalle.
    Conservación: 6 años (art. 17 Código Tributario), depuración automática.
    """

    __tablename__ = "trabajos"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("clientes.id"), nullable=False, index=True,
    )
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    hora: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    # 'Pendiente' | 'En proceso' | 'Finalizado'
    estado: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'Finalizado'"),
    )
    valor: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # CLP
    detalle: Mapped[str] = mapped_column(Text, nullable=False)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    actualizado_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    cliente: Mapped[Cliente] = relationship()

    def __repr__(self) -> str:
        return f"<Trabajo id={self.id} cliente_id={self.cliente_id} fecha={self.fecha}>"
