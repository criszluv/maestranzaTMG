# app/main.py
"""
Punto de entrada del backend (FastAPI).

Arquitectura por capas (Clean Architecture pragmática):

    routers/    -> interfaz HTTP: valida entrada (schemas/) y códigos de error
    services/   -> lógica de dominio e integraciones (Workera, poda IoT)
    models/     -> ORM (SQLAlchemy) por módulo de negocio
    schemas/    -> contratos Pydantic de entrada/salida
    db/         -> conexión a Supabase/Postgres (única puerta a la BD)
    core/       -> configuración, seguridad (bcrypt/JWT), rate limiting

Ejecutar en desarrollo (desde la raíz del repo):
    npm run dev            # backend + frontend juntos
    # o solo backend, desde backend/:
    uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.routers import api_router

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Aviso de seguridad: sin SECRET_KEY fija, los JWT se invalidan en cada
    # reinicio (clave efímera). Aceptable en dev, peligroso en prod.
    if not settings.SECRET_KEY_FROM_ENV:
        logger.warning(
            "SECRET_KEY no está definido en el .env: se usará una clave efímera. "
            "Define SECRET_KEY en backend/.env para sesiones estables."
        )
    if not settings.WORKERA_API_USER or not settings.WORKERA_API_KEY:
        logger.warning(
            "Workera sin configurar (WORKERA_API_USER / WORKERA_API_KEY): "
            "el historial de marcaje responderá 503 hasta completarlos."
        )

    # Creación de tablas opcional (útil al levantar contra una BD vacía).
    # Por defecto OFF para no forzar conexión a la BD al arrancar.
    if os.getenv("AUTO_CREATE_TABLES", "false").lower() in ("1", "true", "yes"):
        from app import models  # noqa: F401  (registra los modelos en Base.metadata)
        from app.db import Base, engine

        logger.info("AUTO_CREATE_TABLES=on -> creando tablas que falten...")
        Base.metadata.create_all(bind=engine)

    yield


app = FastAPI(
    title="Portal MaestranzaTMG - Backend",
    version="0.4.0",
    lifespan=lifespan,
)

# Anti host-header attack: solo atendemos peticiones para hosts esperados.
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.ALLOWED_HOSTS)

# CORS: orígenes desde .env; métodos y headers explícitos (mínimo necesario).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def limitar_tamano_cuerpo(request: Request, call_next):
    """Rechaza cuerpos gigantes (mitiga DoS). JSON: 1 MB. Subida de fotos
    (multipart a .../fotos): tamaño máximo de imagen + margen del multipart."""
    limite = settings.MAX_BODY_BYTES
    if request.method == "POST" and request.url.path.endswith("/fotos"):
        limite = settings.FOTO_MAX_BYTES + 1_000_000
    contenido = request.headers.get("content-length")
    if contenido and contenido.isdigit() and int(contenido) > limite:
        return JSONResponse(
            status_code=413,
            content={"detail": "El cuerpo de la petición excede el tamaño permitido."},
        )
    return await call_next(request)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Headers defensivos estándar en todas las respuestas."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    # Desactiva APIs potentes del navegador que esta app no usa.
    response.headers.setdefault(
        "Permissions-Policy",
        "geolocation=(), microphone=(), camera=(), payment=(), usb=(), "
        "interest-cohort=()",
    )
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    response.headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")
    # HSTS: fuerza HTTPS. Los navegadores la ignoran sobre HTTP, así que es
    # inofensiva en dev y protege en producción tras TLS.
    if settings.HSTS_MAX_AGE > 0:
        response.headers.setdefault(
            "Strict-Transport-Security",
            f"max-age={settings.HSTS_MAX_AGE}; includeSubDomains",
        )
    # La API solo devuelve JSON: una CSP restrictiva evita que un cliente
    # renderice contenido activo a partir de una respuesta, y prohíbe enmarcarla.
    if request.url.path.startswith("/api"):
        response.headers.setdefault("Cache-Control", "no-store")
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        )
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Red de seguridad ante errores no controlados: registra el detalle en el
    servidor pero devuelve un mensaje genérico. Así no se filtran trazas ni
    detalles internos al cliente (fuga de información). Las HTTPException tienen
    su propio manejador de FastAPI y no pasan por aquí.
    """
    logger.exception("Error no controlado en %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Ocurrió un error interno. Inténtalo nuevamente."},
    )


# Todas las rutas de negocio cuelgan de /api (ver app/routers/__init__.py).
app.include_router(api_router, prefix="/api")


@app.get("/")
def read_root():
    """Healthcheck básico."""
    return {"message": "Backend MaestranzaTMG funcionando", "version": app.version}
