# app/services/workera.py
"""
Cliente HTTP (solo lectura) de la API oficial de Workera.

Referencia: Manual API Workera v1.4 CL (y help.workera.com/documentacion-de-apis)
  - Base:    https://api.workera.com/apiClient/v1/{servicio}
             (los ejemplos del manual también usan https://workera.com/...;
             por eso, ante un 404 se reintenta con el host alternativo)
  - Autenticación: encabezados HTTP llamados literalmente API_USER y API_KEY
             (se obtienen en Workera -> Perfil -> API Key -> Habilitar).
  - Servicio de marcaje: GET /attendanceData
      Parámetros: start, end (yyyy-MM-dd, obligatorios), page (obligatorio),
                  branchOffice, department, employees, attTypes (opcionales).
      Respuesta:  {page, totalPages, pageResult, totalResult, data: [...]}
      Pagina de a 20 registros; con rangos densos puede tardar (timeout alto).

Si las credenciales fallan, ejecuta desde backend/:
    python scripts/verificar_workera.py

Este módulo es la ÚNICA pieza que habla con Workera (capa de
infraestructura). La transformación de marcas a jornadas vive en
app/services/asistencia.py (capa de dominio) y no sabe nada de HTTP.
"""

import logging
from datetime import date
from typing import Any

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)

_ENDPOINT_MARCAJE = "attendanceData"

# Host de Workera que respondió correctamente (no 404), memorizado a nivel de
# proceso: así solo la PRIMERA consulta paga el reintento entre api.workera.com
# y workera.com; las siguientes van directo al host bueno. Se limpia solo al
# reiniciar el backend (o si ese host empieza a dar 404).
_base_activa_cache: str | None = None


class WorkeraError(RuntimeError):
    """Error genérico al consultar Workera (red, HTTP, formato)."""

    def __init__(self, mensaje: str, status_code: int | None = None) -> None:
        super().__init__(mensaje)
        self.status_code = status_code


class WorkeraNoConfigurado(WorkeraError):
    """Faltan credenciales de Workera en el .env."""


def _credenciales() -> tuple[str, str]:
    user = settings.WORKERA_API_USER
    key = settings.WORKERA_API_KEY
    if not user or not key:
        raise WorkeraNoConfigurado(
            "Falta configurar WORKERA_API_USER y/o WORKERA_API_KEY en backend/.env. "
            "Se obtienen en Workera -> Perfil -> API Key."
        )
    return user, key


def _preparar_sesion() -> requests.Session:
    """Crea la sesión HTTP con la autenticación configurada."""
    user, key = _credenciales()
    sesion = requests.Session()
    sesion.headers["Accept"] = "application/json"

    estilo = settings.WORKERA_AUTH_STYLE
    if estilo == "basic":
        sesion.auth = (user, key)
    elif estilo == "bearer":
        sesion.headers["Authorization"] = f"Bearer {key}"
        sesion.headers[settings.WORKERA_HEADER_USER] = user
    else:  # "headers" (defecto): API_USER / API_KEY según el manual v1.4
        sesion.headers[settings.WORKERA_HEADER_USER] = user
        sesion.headers[settings.WORKERA_HEADER_KEY] = key
    return sesion


def _hosts_candidatos() -> list[str]:
    """
    URL base configurada + su host alternativo. El manual oficial declara
    api.workera.com como base pero sus propios ejemplos usan workera.com,
    así que ante un 404 probamos el otro (GET idempotente, sin riesgo).
    """
    base = settings.WORKERA_API_BASE_URL.rstrip("/")
    candidatos = [base]
    if "//api.workera.com" in base:
        candidatos.append(base.replace("//api.workera.com", "//workera.com"))
    elif "//workera.com" in base:
        candidatos.append(base.replace("//workera.com", "//api.workera.com"))
    return candidatos


def obtener_marcas(
    desde: date,
    hasta: date,
    empleados: str | None = None,
    max_paginas: int | None = None,
) -> list[dict[str, Any]]:
    """
    Descarga las marcas de asistencia entre `desde` y `hasta` (inclusive),
    recorriendo la paginación de Workera. Devuelve la lista cruda de
    AttendanceData (dicts) tal como la entrega la API.

    Lanza:
      - WorkeraNoConfigurado si faltan credenciales.
      - WorkeraError ante errores HTTP o respuestas con formato inesperado.
      - requests.RequestException ante fallas de red (timeout, DNS, etc.).
    """
    global _base_activa_cache

    sesion = _preparar_sesion()
    candidatos = _hosts_candidatos()
    # Reutiliza el host que ya funcionó en una consulta previa (si sigue en la
    # lista de candidatos válidos para la configuración actual).
    base_activa: str | None = (
        _base_activa_cache if _base_activa_cache in candidatos else None
    )
    tope = max_paginas or settings.WORKERA_MAX_PAGINAS

    marcas: list[dict[str, Any]] = []
    pagina = 1
    total_paginas = 1

    while pagina <= total_paginas and pagina <= tope:
        params: dict[str, str | int] = {
            "start": desde.isoformat(),
            "end": hasta.isoformat(),
            "page": pagina,
        }
        if empleados:
            params["employees"] = empleados

        if base_activa is not None:
            respuesta = sesion.get(
                f"{base_activa}/{_ENDPOINT_MARCAJE}",
                params=params,
                timeout=settings.WORKERA_TIMEOUT_SEGUNDOS,
            )
        else:
            # Primera petición: resolvemos qué host responde la ruta.
            respuesta = None
            for candidata in candidatos:
                respuesta = sesion.get(
                    f"{candidata}/{_ENDPOINT_MARCAJE}",
                    params=params,
                    timeout=settings.WORKERA_TIMEOUT_SEGUNDOS,
                )
                if respuesta.status_code != 404:
                    base_activa = candidata
                    _base_activa_cache = candidata  # memoriza para próximas consultas
                    if candidata != candidatos[0]:
                        logger.warning(
                            "Workera: %s devolvió 404; usando %s. Fija "
                            "WORKERA_API_BASE_URL=%s en backend/.env para "
                            "evitar el reintento.",
                            candidatos[0], candidata, candidata,
                        )
                    break
            if base_activa is None:
                raise WorkeraError(
                    "Workera respondió HTTP 404 (ruta no encontrada) en "
                    f"{' y '.join(candidatos)}. Revisa WORKERA_API_BASE_URL "
                    "en backend/.env o ejecuta scripts/verificar_workera.py.",
                    status_code=404,
                )
            if respuesta is None:  # defensa explícita (no assert: -O lo elimina)
                raise WorkeraError('Sin respuesta de Workera al resolver el host.')

        if respuesta.status_code in (401, 403):
            raise WorkeraError(
                "Workera rechazó las credenciales (HTTP "
                f"{respuesta.status_code}). Revisa WORKERA_API_USER / "
                "WORKERA_API_KEY (deben ir como headers API_USER y API_KEY) "
                "o ejecuta scripts/verificar_workera.py.",
                status_code=respuesta.status_code,
            )
        if not respuesta.ok:
            raise WorkeraError(
                f"Workera respondió HTTP {respuesta.status_code} al consultar "
                f"el historial de marcaje.",
                status_code=respuesta.status_code,
            )

        try:
            cuerpo = respuesta.json()
        except ValueError as exc:
            raise WorkeraError(
                "Workera devolvió una respuesta que no es JSON válido."
            ) from exc

        # Formato documentado: {"page", "totalPages", "data": [...]}
        if isinstance(cuerpo, dict):
            datos = cuerpo.get("data") or []
            total_paginas = int(cuerpo.get("totalPages") or 1)
        elif isinstance(cuerpo, list):
            # Tolerancia: algunos endpoints podrían devolver la lista directa.
            datos = cuerpo
            total_paginas = 1
        else:
            raise WorkeraError("Formato de respuesta de Workera no reconocido.")

        if not isinstance(datos, list):
            raise WorkeraError("El campo 'data' de Workera no es una lista.")

        marcas.extend(d for d in datos if isinstance(d, dict))
        pagina += 1

    if total_paginas > tope:
        logger.warning(
            "Workera: el rango %s..%s tiene %s páginas; se leyeron solo %s. "
            "Acorta el rango de fechas o sube WORKERA_MAX_PAGINAS.",
            desde, hasta, total_paginas, tope,
        )

    logger.info(
        "Workera: %s marcas descargadas para %s..%s", len(marcas), desde, hasta
    )
    return marcas
