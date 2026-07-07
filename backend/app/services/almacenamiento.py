# app/services/almacenamiento.py
"""
Cliente de Supabase Storage (capa de infraestructura).

Única pieza que habla con el Storage. Usa la SERVICE_ROLE key vía REST:
vive SOLO en el servidor; el navegador nunca la ve. Como el bucket es
privado, el frontend recibe URLs FIRMADAS temporales generadas aquí.

API REST de Storage (https://supabase.com/docs/guides/storage):
  POST   {url}/storage/v1/object/{bucket}/{ruta}        -> subir
  POST   {url}/storage/v1/object/sign/{bucket}/{ruta}   -> URL firmada
  DELETE {url}/storage/v1/object/{bucket}/{ruta}        -> eliminar (solo
         retención/depuración; el "borrar" del usuario es lógico en la BD)
"""

import logging

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)


class AlmacenamientoError(RuntimeError):
    """Error al operar con Supabase Storage."""

    def __init__(self, mensaje: str, status_code: int | None = None) -> None:
        super().__init__(mensaje)
        self.status_code = status_code


class AlmacenamientoNoConfigurado(AlmacenamientoError):
    """Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el .env."""


def _base_y_headers() -> tuple[str, dict[str, str]]:
    url = settings.SUPABASE_URL
    key = settings.SUPABASE_SERVICE_ROLE_KEY
    if not url or not key:
        raise AlmacenamientoNoConfigurado(
            "Falta configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en "
            "backend/.env (Supabase -> Settings -> API)."
        )
    base = f"{url.rstrip('/')}/storage/v1"
    headers = {"Authorization": f"Bearer {key}", "apikey": key}
    return base, headers


def subir_objeto(ruta: str, contenido: bytes, content_type: str) -> None:
    """Sube un objeto al bucket privado. `ruta` la genera el backend (uuid)."""
    base, headers = _base_y_headers()
    headers["Content-Type"] = content_type
    headers["x-upsert"] = "false"  # nunca sobreescribir: rutas únicas

    r = requests.post(
        f"{base}/object/{settings.FOTOS_BUCKET}/{ruta}",
        data=contenido,
        headers=headers,
        timeout=settings.STORAGE_TIMEOUT_SEGUNDOS,
    )
    if not r.ok:
        logger.error("Storage subir fallo %s: %s", r.status_code, r.text[:200])
        raise AlmacenamientoError(
            f"Supabase Storage rechazó la subida (HTTP {r.status_code}).",
            status_code=r.status_code,
        )


def url_firmada(ruta: str, expira_segundos: int | None = None) -> str:
    """URL temporal de solo lectura para un objeto del bucket privado."""
    base, headers = _base_y_headers()
    r = requests.post(
        f"{base}/object/sign/{settings.FOTOS_BUCKET}/{ruta}",
        json={"expiresIn": expira_segundos or settings.FOTO_URL_EXPIRA_SEGUNDOS},
        headers=headers,
        timeout=settings.STORAGE_TIMEOUT_SEGUNDOS,
    )
    if not r.ok:
        logger.error("Storage firmar fallo %s: %s", r.status_code, r.text[:200])
        raise AlmacenamientoError(
            f"No se pudo generar la URL firmada (HTTP {r.status_code}).",
            status_code=r.status_code,
        )
    firmada = (r.json() or {}).get("signedURL", "")
    if not firmada:
        raise AlmacenamientoError("Storage no devolvió una URL firmada.")
    return f"{base}{firmada}"


def eliminar_objeto(ruta: str) -> None:
    """
    Borrado FÍSICO. Solo para depuración/retención (ej. al eliminar un
    pedido completo). El "borrar" del usuario NUNCA llega aquí: es lógico.
    """
    base, headers = _base_y_headers()
    r = requests.delete(
        f"{base}/object/{settings.FOTOS_BUCKET}/{ruta}",
        headers=headers,
        timeout=settings.STORAGE_TIMEOUT_SEGUNDOS,
    )
    # 404 = ya no existe: idempotente, no es error.
    if not r.ok and r.status_code != 404:
        logger.error("Storage eliminar fallo %s: %s", r.status_code, r.text[:200])
        raise AlmacenamientoError(
            f"No se pudo eliminar el objeto (HTTP {r.status_code}).",
            status_code=r.status_code,
        )
