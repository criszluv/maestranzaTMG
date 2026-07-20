# app/models/cliente.py
"""
Módulo de clientes (normalizado a 3NF desde la planilla de la empresa):

  clientes           1 fila por cliente (nombre único, email, fecha ingreso).
  cliente_contactos  1:N personas de contacto — nombre y teléfono son DATOS
                     PERSONALES (Ley 21.719); `nota` guarda el rol informal
                     ("pagos", "jefe servicios"...).
  cliente_entidades  1:N razones sociales / RUT de facturación.

Las tablas hijas caen con el cliente (ON DELETE CASCADE en la BD).
"""

from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, SmallInteger, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    # Texto libre a propósito: hay clientes con 2+ correos en el campo.
    email: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fecha_ingreso: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # 'habilitado' | 'deshabilitado' (baja lógica, igual criterio que usuarios)
    estado: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'habilitado'"), index=True,
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    actualizado_en: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    contactos: Mapped[List["ClienteContacto"]] = relationship(
        back_populates="cliente",
        cascade="all, delete-orphan",
        order_by="ClienteContacto.orden",
    )
    entidades: Mapped[List["ClienteEntidad"]] = relationship(
        back_populates="cliente",
        cascade="all, delete-orphan",
        order_by="ClienteEntidad.id",
    )

    def __repr__(self) -> str:
        return f"<Cliente id={self.id} nombre={self.nombre!r} estado={self.estado!r}>"


class ClienteContacto(Base):
    __tablename__ = "cliente_contactos"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("clientes.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    nombre: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    telefono: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    nota: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    orden: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text("1"))

    cliente: Mapped[Cliente] = relationship(back_populates="contactos")


class ClienteEntidad(Base):
    __tablename__ = "cliente_entidades"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("clientes.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    rut: Mapped[str] = mapped_column(Text, nullable=False)
    nombre: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    cliente: Mapped[Cliente] = relationship(back_populates="entidades")
