# app/schemas/auth.py
"""Esquemas de autenticación (login / sesión)."""

from pydantic import BaseModel, EmailStr

from app.schemas.usuario import UsuarioOut

# El usuario que viaja en las respuestas de auth es el mismo esquema público
# de usuarios (sin password). Alias para dejar clara la intención.
UserOut = UsuarioOut


class LoginPayload(BaseModel):
    email: EmailStr
    # Sin min_length: debe aceptar contraseñas antiguas; la política mínima
    # se aplica al CREAR o CAMBIAR contraseñas (schemas/usuario.py).
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
