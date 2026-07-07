# app/db/session.py
"""
Conexión a la base de datos (Supabase / PostgreSQL) vía SQLAlchemy.

Única pieza del sistema que sabe CÓMO conectarse a la BD: el resto del
código pide sesiones a través de `get_db` (inyección de dependencias de
FastAPI), lo que permite reemplazar la BD en tests (SQLite en memoria)
sin tocar la lógica de negocio.
"""

import os
from pathlib import Path
from typing import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# -------------------------------------------------------------------
#   1) Carga explícita de variables de entorno (.env en carpeta backend)
# -------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = BASE_DIR / ".env"

load_dotenv(dotenv_path=ENV_PATH)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(f"DATABASE_URL no está definido en el .env ({ENV_PATH})")


# -------------------------------------------------------------------
#   2) Configuración del pool (tunable por variables de entorno)
# -------------------------------------------------------------------

def _get_int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


POOL_SIZE = _get_int_env("DB_POOL_SIZE", 5)
MAX_OVERFLOW = _get_int_env("DB_MAX_OVERFLOW", 0)
POOL_TIMEOUT = _get_int_env("DB_POOL_TIMEOUT", 30)
POOL_RECYCLE = _get_int_env("DB_POOL_RECYCLE", 1800)

DB_SSLMODE = os.getenv("DB_SSLMODE")

# Siempre un dict, nunca None
connect_args: dict = {}
if DB_SSLMODE:
    connect_args["sslmode"] = DB_SSLMODE


# -------------------------------------------------------------------
#   3) Engine SQLAlchemy -> conexión a Supabase/Postgres
# -------------------------------------------------------------------

engine = create_engine(
    DATABASE_URL,
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
    pool_timeout=POOL_TIMEOUT,
    pool_recycle=POOL_RECYCLE,
    pool_pre_ping=True,
    future=True,
    connect_args=connect_args,  # dict vacío o con sslmode, pero nunca None
)


# -------------------------------------------------------------------
#   4) Session factory + Base declarativa
# -------------------------------------------------------------------

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """Dependencia de FastAPI: abre una sesión por request y la cierra siempre."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
