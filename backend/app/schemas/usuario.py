# app/schemas/usuario.py
"""Esquemas de entrada/salida para cuentas de usuario."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.core.config import settings
from app.core.passwords import validar_fortaleza_password

# Pydantic rechaza (422) cualquier valor fuera del set.
RolUsuario = Literal["admin", "rrhh", "empleado"]
EstadoUsuario = Literal["activo", "inactivo"]

# Longitud máxima de nombre: evita cadenas gigantes (defensa en profundidad,
# además del límite global de tamaño de payload).
_NombreField = Field(min_length=1, max_length=120)

# Política mínima de contraseñas (aplica al crear y al cambiar). La longitud
# mínima la valida el Field; la fortaleza (clases de caracteres, blocklist,
# secuencias, correo) la valida app.core.passwords en el model_validator.
_PasswordField = Field(
    min_length=settings.PASSWORD_MIN_LARGO,
    description=f"Mínimo {settings.PASSWORD_MIN_LARGO} caracteres; debe combinar "
    "al menos 3 de: mayúsculas, minúsculas, números y símbolos.",
)


class UsuarioBase(BaseModel):
    email: EmailStr
    nombre: str = _NombreField
    rol: RolUsuario
    estado: EstadoUsuario = "activo"


class UsuarioCreate(UsuarioBase):
    password: str = _PasswordField

    @model_validator(mode="after")
    def _password_fuerte(self) -> "UsuarioCreate":
        validar_fortaleza_password(self.password, email=self.email)
        return self


class UsuarioUpdate(BaseModel):
    email: EmailStr | None = None
    nombre: str | None = Field(default=None, min_length=1, max_length=120)
    rol: RolUsuario | None = None
    estado: EstadoUsuario | None = None
    password: str | None = Field(
        default=None,
        min_length=settings.PASSWORD_MIN_LARGO,
    )

    @model_validator(mode="after")
    def _password_fuerte(self) -> "UsuarioUpdate":
        if self.password is not None:
            validar_fortaleza_password(self.password, email=self.email)
        return self


class UsuarioOut(BaseModel):
    id: int
    email: str
    nombre: str
    rol: str
    estado: str

    model_config = ConfigDict(from_attributes=True)
