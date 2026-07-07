# app/models/auditoria.py
"""
Modelo (solo lectura) de la auditoría de datos personales.

La tabla public.auditoria_datos la ESCRIBEN los triggers de la BD
(fn_auditar_users / fn_auditar_generico), nunca la aplicación. Este modelo
existe únicamente para LEERLA desde el visor de RRHH/Admin.
"""

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, BigInteger, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Auditoria(Base):
    __tablename__ = "auditoria_datos"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tabla: Mapped[str] = mapped_column(Text, nullable=False)
    operacion: Mapped[str] = mapped_column(Text, nullable=False)  # INSERT|UPDATE|DELETE
    registro_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    actor_bd: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # jsonb en Postgres; JSON cruza a SQLite en tests. Solo lectura.
    datos_antes: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    datos_despues: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    ocurrido_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Usuario de la aplicación (id|email) que hizo el cambio; NULL = cambio directo en BD.
    actor_app: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<Auditoria id={self.id} tabla={self.tabla!r} op={self.operacion!r}>"
