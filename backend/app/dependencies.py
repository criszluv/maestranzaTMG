# app/dependencies.py
"""
Dependencias de FastAPI para autenticación y autorización.

  - get_current_user: extrae y valida el JWT del header Authorization,
    carga el usuario desde la BD y verifica que siga activo.
  - require_roles(...): factory de dependencias que exige uno de los roles
    indicados. El rol 'admin' se considera superusuario y pasa siempre.
"""

from typing import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db import get_db
from app.models import User

# auto_error=False -> devolvemos nosotros un 401 uniforme y en español.
bearer_scheme = HTTPBearer(auto_error=False)

_CREDENCIALES_INVALIDAS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="No autenticado o token inválido.",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise _CREDENCIALES_INVALIDAS

    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="La sesión expiró. Vuelve a iniciar sesión.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except jwt.PyJWTError as exc:
        raise _CREDENCIALES_INVALIDAS from exc

    sub = payload.get("sub")
    if sub is None:
        raise _CREDENCIALES_INVALIDAS

    try:
        user_id = int(sub)
    except (TypeError, ValueError) as exc:
        raise _CREDENCIALES_INVALIDAS from exc

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise _CREDENCIALES_INVALIDAS

    if user.estado != "activo":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario deshabilitado. Contacte a RRHH.",
        )

    return user


def require_roles(*roles_permitidos: str) -> Callable[..., User]:
    """
    Devuelve una dependencia que exige que el usuario autenticado tenga uno de
    los roles indicados. 'admin' siempre tiene acceso (superusuario).

    Uso:
        @router.get(..., dependencies=[Depends(require_roles("rrhh"))])
        # o, si necesitas el usuario:
        def endpoint(user: User = Depends(require_roles("rrhh"))): ...
    """
    permitidos = set(roles_permitidos) | {"admin"}

    def _checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.rol not in permitidos:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para realizar esta acción.",
            )
        return current_user

    return _checker
