# app/models/solicitud.py
from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, Date, DateTime, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SolicitudRRHH(Base):
    """Solicitud de días libres / permisos / licencias de un trabajador."""

    __tablename__ = "rrhh_solicitudes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    trabajador_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)

    tipo: Mapped[str] = mapped_column(Text, nullable=False)
    motivo: Mapped[str] = mapped_column(Text, nullable=False)

    fecha_inicio: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    fecha_fin: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # 'Pendiente' | 'Aprobada' | 'Rechazada'
    estado: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="Pendiente",
        index=True,
    )

    # Adjunto opcional (1 foto-documento por solicitud). El archivo vive en el
    # bucket privado de Supabase Storage bajo el prefijo solicitud_{id}/; aquí
    # guardamos solo los metadatos. El frontend recibe URLs firmadas temporales.
    adjunto_ruta: Mapped[Optional[str]] = mapped_column(Text, nullable=True, unique=True)
    adjunto_nombre: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    adjunto_content_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    adjunto_tamano: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    def __repr__(self) -> str:
        return (
            f"<SolicitudRRHH id={self.id} trabajador_id={self.trabajador_id} "
            f"estado={self.estado!r}>"
        )
