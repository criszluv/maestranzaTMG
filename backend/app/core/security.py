# app/core/security.py
"""
Utilidades de seguridad: hashing de contraseñas (bcrypt) y emisión/validación
de JSON Web Tokens (JWT).

Se usa la librería `bcrypt` directamente (en vez de passlib) para evitar los
warnings de compatibilidad entre passlib 1.7.x y bcrypt 4.x.
"""

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import settings

# bcrypt solo considera los primeros 72 bytes de la contraseña; las versiones
# nuevas lanzan ValueError si se excede. Truncamos de forma explícita.
_BCRYPT_MAX_BYTES = 72


# ---------------------------------------------------------------------------
#  CONTRASEÑAS
# ---------------------------------------------------------------------------

def _to_bcrypt_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(plain_password: str) -> str:
    """Devuelve el hash bcrypt (string) listo para guardar en la BD."""
    hashed = bcrypt.hashpw(_to_bcrypt_bytes(plain_password), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Compara una contraseña en claro contra su hash bcrypt."""
    if not hashed_password:
        return False
    try:
        return bcrypt.checkpw(
            _to_bcrypt_bytes(plain_password),
            hashed_password.encode("utf-8"),
        )
    except (ValueError, TypeError):
        # hashed_password no es un hash bcrypt válido (ej. dato corrupto)
        return False


def is_bcrypt_hash(value: str | None) -> bool:
    """Heurística para saber si un valor ya está hasheado con bcrypt."""
    return bool(value) and value.startswith(("$2a$", "$2b$", "$2y$"))


# ---------------------------------------------------------------------------
#  JWT
# ---------------------------------------------------------------------------

def create_access_token(
    subject: str | int,
    *,
    rol: str,
    extra: dict[str, Any] | None = None,
    expires_minutes: int | None = None,
) -> str:
    """
    Crea un JWT firmado. `subject` (sub) es el id de usuario; incluimos el rol
    como claim para no tener que ir a la BD en validaciones simples.
    """
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload: dict[str, Any] = {
        "sub": str(subject),
        "rol": rol,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "iss": settings.JWT_ISSUER,
    }
    if extra:
        payload.update(extra)

    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decodifica y valida un JWT. Lanza jwt.PyJWTError (o subclases como
    ExpiredSignatureError) si el token es inválido o expiró.
    """
    return jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
        issuer=settings.JWT_ISSUER,
    )


# ---------------------------------------------------------------------------
#  MINIMIZACIÓN EN LOGS (Ley 21.719: los logs también son tratamiento)
# ---------------------------------------------------------------------------

def enmascarar_email(email: str) -> str:
    """'cristobal@dominio.cl' -> 'c*******l@dominio.cl' (logs de seguridad)."""
    if not email or "@" not in email:
        return "***"
    local, _, dominio = email.partition("@")
    if len(local) <= 2:
        visible = local[:1] + "*"
    else:
        visible = f"{local[0]}{'*' * (len(local) - 2)}{local[-1]}"
    return f"{visible}@{dominio}"
