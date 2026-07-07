# app/routers/auth.py
"""
Autenticación basada en JWT.

  POST /api/auth/login  -> valida credenciales (hash bcrypt) y emite un
                           access_token (JWT) + datos del usuario.
  GET  /api/auth/me     -> devuelve el usuario del token (rehidratación de
                           sesión en el frontend).
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import LimitadorIntentos
from app.core.security import create_access_token, enmascarar_email, verify_password
from app.db import get_db
from app.dependencies import get_current_user
from app.models import User
from app.schemas.auth import LoginPayload, TokenResponse, UserOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])

# Limitador por (IP + correo): frena la fuerza bruta contra UNA cuenta.
_limitador = LimitadorIntentos(
    max_intentos=settings.LOGIN_MAX_INTENTOS,
    ventana_segundos=settings.LOGIN_VENTANA_SEGUNDOS,
)
# Limitador por IP: frena el "password spraying" (una clave contra muchas
# cuentas desde la misma IP), que el limitador por correo no vería.
_limitador_ip = LimitadorIntentos(
    max_intentos=settings.LOGIN_MAX_INTENTOS_IP,
    ventana_segundos=settings.LOGIN_VENTANA_SEGUNDOS,
)


def _ip_de(request: Request) -> str:
    return request.client.host if request.client else "desconocida"


def _clave_rate_limit(request: Request, email: str) -> str:
    return f"{_ip_de(request)}|{email.lower()}"


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginPayload,
    request: Request,
    db: Session = Depends(get_db),
) -> TokenResponse:
    ip = _ip_de(request)
    clave = _clave_rate_limit(request, payload.email)

    if _limitador.bloqueado(clave) or _limitador_ip.bloqueado(ip):
        # Evento de seguridad (posible fuerza bruta / password spraying). Email
        # enmascarado: los logs también son tratamiento de datos (Ley 21.719).
        logger.warning(
            "SEGURIDAD login bloqueado por rate-limit ip=%s email=%s",
            ip,
            enmascarar_email(payload.email),
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos fallidos. Espera unos minutos y vuelve a intentar.",
        )

    usuario = db.query(User).filter(User.email == payload.email).first()

    # Mismo mensaje para "no existe" y "password incorrecta": no revelamos qué
    # correos están registrados (evita enumeración de cuentas).
    password_ok = bool(usuario) and verify_password(payload.password, usuario.password)
    if not usuario or not password_ok:
        _limitador.registrar_fallo(clave)
        _limitador_ip.registrar_fallo(ip)
        logger.info(
            "SEGURIDAD login fallido ip=%s email=%s",
            ip,
            enmascarar_email(payload.email),
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
        )

    if usuario.estado != "activo":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario deshabilitado. Contacte a RRHH.",
        )

    _limitador.limpiar(clave)
    _limitador_ip.limpiar(ip)
    token = create_access_token(subject=usuario.id, rol=usuario.rol)
    return TokenResponse(
        access_token=token,
        # "bearer" es el tipo de token OAuth2, no una contraseña (falso positivo).
        token_type="bearer",  # nosec B106
        user=UserOut.model_validate(usuario),
    )


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> UserOut:
    """Devuelve el usuario autenticado."""
    return UserOut.model_validate(current_user)
