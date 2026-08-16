# app/routers/__init__.py
"""
Registro central de routers. main.py solo incluye `api_router`; agregar un
módulo nuevo = crear su router y sumarlo a la lista de abajo (OCP: se
extiende sin modificar el resto).
"""

from fastapi import APIRouter

from app.routers import (
    asistencia,
    auditoria,
    auth,
    clientes,
    facturas,
    iot,
    maquinas,
    pedidos,
    privacidad,
    solicitudes,
    trabajos,
    usuarios,
)

api_router = APIRouter()

for modulo in (
    auth, usuarios, solicitudes, asistencia, pedidos, iot, privacidad,
    auditoria, clientes, trabajos, facturas, maquinas,
):
    api_router.include_router(modulo.router)

__all__ = ["api_router"]
