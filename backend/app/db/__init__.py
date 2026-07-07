# app/db/__init__.py
"""Acceso a datos: engine, sesiones y Base declarativa."""

from app.db.session import Base, SessionLocal, engine, get_db

__all__ = ["Base", "SessionLocal", "engine", "get_db"]
