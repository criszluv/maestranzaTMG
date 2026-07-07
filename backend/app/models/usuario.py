# app/models/usuario.py
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    """Cuenta del portal. Roles: 'admin', 'rrhh', 'empleado'."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    # Almacena el HASH bcrypt de la contraseña (ver app/core/security.py).
    # Nunca se guarda ni se devuelve la contraseña en texto plano.
    password: Mapped[str] = mapped_column(Text, nullable=False)
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    rol: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    estado: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=text("'activo'"),
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    # Lo mantiene el trigger trg_touch_users en la BD (auditoría Ley 21.719).
    actualizado_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r} rol={self.rol!r}>"
