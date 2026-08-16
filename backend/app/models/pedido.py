# app/models/pedido.py
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Pedido(Base):
    """Pedido / orden de trabajo de la maestranza, asignable a un empleado."""

    __tablename__ = "pedido"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)

    pedido: Mapped[str] = mapped_column(Text, nullable=False)
    descripcion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 'pendiente' | 'en proceso' | 'terminado'
    estado: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=text("'pendiente'"),
        index=True,
    )

    valor: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    encargado_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    # 'comercial'      -> se factura a un cliente (flujo original).
    # 'mantenimiento'  -> nace de una anomalía de planta, apunta a una máquina
    #                     y NO se factura: su cierre es 'interno'.
    tipo: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=text("'comercial'"),
        index=True,
    )

    # Cliente al que se factura. NULL en los pedidos históricos y en los de
    # mantenimiento; obligatorio para cerrar un pedido comercial.
    cliente_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("clientes.id"),
        nullable=True,
        index=True,
    )

    # Máquina intervenida (solo en pedidos de mantenimiento).
    maquina_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("maquinas.id", ondelete="SET NULL"),
        nullable=True,
    )

    # --- Cierre comercial (migración 009) -------------------------------
    # Cuando el encargado termina el pedido, RRHH lo deriva al módulo
    # comercial: 'pagado' -> crea un Trabajo realizado; 'pendiente' -> crea
    # una Factura por cobrar. Se guarda cuándo, con qué criterio y a qué
    # registro dio origen (los FK son ON DELETE SET NULL en la BD: si el
    # registro comercial se corrige, el cierre sigue documentado).
    cerrado_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    cierre_tipo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    trabajo_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("trabajos.id", ondelete="SET NULL"),
        nullable=True,
    )
    factura_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("facturas.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Fechas para trazabilidad y RETENCIÓN LEGAL (art. 17 Código Tributario:
    # 6 años para documentación de transacciones). La depuración vive en la
    # BD: fn_depurar_retencion() (backend/db/migrations/001...sql).
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    actualizado_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<Pedido id={self.id} pedido={self.pedido!r} estado={self.estado!r}>"
