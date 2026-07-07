# app/models/pedido_foto.py
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PedidoFoto(Base):
    """
    Metadatos de una foto de progreso de un pedido. El archivo vive en el
    bucket privado `pedidos-fotos` de Supabase Storage.

    Soft-delete: `estado='oculta'` la saca de TODAS las vistas, pero archivo
    y registro se conservan (resguardo/auditoría, Ley 21.719) hasta que la
    retención del pedido (6 años) los depure.
    """

    __tablename__ = "pedido_fotos"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    pedido_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("pedido.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    subido_por: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=False,
    )
    ruta: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    nombre_original: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tamano_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    content_type: Mapped[str] = mapped_column(Text, nullable=False)

    # 'visible' | 'oculta'
    estado: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'visible'"), index=True,
    )

    subida_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    oculta_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    oculta_por: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=True,
    )

    def __repr__(self) -> str:
        return f"<PedidoFoto id={self.id} pedido={self.pedido_id} estado={self.estado!r}>"
