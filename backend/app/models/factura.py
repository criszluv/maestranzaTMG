# app/models/factura.py
from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Integer, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.cliente import Cliente


class Factura(Base):
    """
    Factura por cobrar (pago pendiente de un cliente).

    Diseño híbrido: `cliente_texto` conserva SIEMPRE el nombre tal como se
    digitó (sin pérdida de información); `cliente_id` es el vínculo opcional
    al cliente real de la cartera — puede quedar NULL si el cliente aún no
    existe o el nombre es ambiguo, y vincularse después desde la app.
    """

    __tablename__ = "facturas"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    cliente_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("clientes.id"), nullable=True, index=True,
    )
    cliente_texto: Mapped[str] = mapped_column(Text, nullable=False)
    numero: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    monto: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # CLP
    fecha_emision: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    # 'pendiente' | 'pagada'
    estado: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'pendiente'"), index=True,
    )
    pagada_en: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    nota: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    actualizado_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    cliente: Mapped[Optional[Cliente]] = relationship()

    def __repr__(self) -> str:
        return f"<Factura id={self.id} numero={self.numero} estado={self.estado!r}>"
