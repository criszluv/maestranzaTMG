# app/core/config.py
"""
Configuración central de la aplicación, leída desde variables de entorno
(backend/.env). Centralizar esto evita os.getenv() repartido por todo el
código y da un único lugar donde documentar cada parámetro.
"""

import os
import secrets
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# Cargamos el .env de la carpeta backend (mismo criterio que app/db/session.py)
BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(dotenv_path=BASE_DIR / ".env")


def _get_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _get_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if not raw:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


def _get_first(*names: str) -> str | None:
    """Devuelve el primer valor no vacío entre varias variables (compatibilidad)."""
    for name in names:
        value = os.getenv(name)
        if value:
            return value
    return None


def _workera_base_url() -> str:
    """
    URL base de la API de Workera (sin el nombre del servicio al final).

    Según la documentación oficial, todas las consultas usan:
        https://workera.com/apiClient/v1/{servicio}

    Compatibilidad: si el .env aún trae la variable antigua WORKERIA_API_URL
    apuntando directamente a .../attendanceData, se recorta ese sufijo.
    """
    raw = _get_first("WORKERA_API_BASE_URL", "WORKERIA_API_URL")
    if not raw:
        # Manual API Workera v1.4 CL: "Todas las consultas comienzan con
        # https://api.workera.com/apiClient/v1/{servicio}"
        return "https://api.workera.com/apiClient/v1"

    base = raw.strip().rstrip("/")
    # Si la URL antigua incluía el endpoint, nos quedamos solo con la base.
    for sufijo in ("/attendanceData", "/employee", "/permission"):
        if base.endswith(sufijo):
            base = base[: -len(sufijo)]
            break
    return base


class Settings:
    """Settings simples (sin pydantic-settings para no sumar dependencias)."""

    # --- JWT ---
    # SECRET_KEY DEBE venir del .env en producción. Si falta, generamos una
    # efímera: el servidor arranca, pero los tokens se invalidan al reiniciar
    # (útil en dev, inseguro en prod -> por eso el aviso en main.py).
    SECRET_KEY: str = os.getenv("SECRET_KEY") or secrets.token_urlsafe(48)
    SECRET_KEY_FROM_ENV: bool = bool(os.getenv("SECRET_KEY"))
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = _get_int("ACCESS_TOKEN_EXPIRE_MINUTES", 480)  # 8 h

    # --- CORS ---
    # Lista separada por comas en el .env (CORS_ORIGINS). Default: puertos
    # típicos de Vite/CRA en local.
    CORS_ORIGINS: list[str] = _get_list(
        "CORS_ORIGINS",
        ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    )

    # --- Roles válidos del sistema (única fuente de verdad) ---
    ROLES: tuple[str, ...] = ("admin", "rrhh", "empleado")
    ESTADOS_USUARIO: tuple[str, ...] = ("activo", "inactivo")

    # --- Vacaciones (saldo de días libres) ---
    # Días de vacaciones por año para cada trabajador (Chile: 15 días hábiles).
    VACACIONES_DIAS_ANUALES: int = _get_int("VACACIONES_DIAS_ANUALES", 15)
    # Solo las solicitudes de este tipo (aprobadas) descuentan del saldo.
    VACACIONES_TIPO: str = os.getenv("VACACIONES_TIPO", "Vacaciones")

    # --- Adjunto de solicitudes (1 foto-documento por solicitud) ---
    # Mismo bucket y mismo criterio que las fotos de pedidos (ver FOTO_MAX_BYTES).
    SOLICITUD_ADJUNTO_MAX_BYTES: int = _get_int(
        "SOLICITUD_ADJUNTO_MAX_BYTES", 50 * 1024 * 1024
    )  # 50 MB

    # --- Seguridad de cuentas ---
    PASSWORD_MIN_LARGO: int = _get_int("PASSWORD_MIN_LARGO", 8)
    # Rate limit de login por (IP+correo): frena fuerza bruta contra UNA cuenta.
    LOGIN_MAX_INTENTOS: int = _get_int("LOGIN_MAX_INTENTOS", 5)
    LOGIN_VENTANA_SEGUNDOS: int = _get_int("LOGIN_VENTANA_SEGUNDOS", 300)
    # Rate limit de login por IP (independiente del correo): frena el
    # "password spraying" (una clave probada contra muchas cuentas desde una IP).
    LOGIN_MAX_INTENTOS_IP: int = _get_int("LOGIN_MAX_INTENTOS_IP", 20)

    # --- Workera (control de asistencia / marcaje) ---
    # El marcaje NO se gestiona en este sistema: se CONSULTA (solo lectura)
    # desde la API oficial de Workera. Las credenciales se obtienen en
    # Workera -> Editar perfil -> API (API User + API Key).
    WORKERA_API_BASE_URL: str = _workera_base_url()
    WORKERA_API_USER: str | None = _get_first("WORKERA_API_USER", "WORKERIA_API_USER")
    WORKERA_API_KEY: str | None = _get_first("WORKERA_API_KEY", "WORKERIA_API_KEY")
    # Cómo se envían las credenciales: "headers" (defecto), "basic" o "bearer".
    # Manual API Workera v1.4 CL: los valores van como encabezados llamados
    # literalmente API_USER y API_KEY. Configurables por si el proveedor cambia.
    WORKERA_AUTH_STYLE: str = os.getenv("WORKERA_AUTH_STYLE", "headers").lower()
    WORKERA_HEADER_USER: str = os.getenv("WORKERA_HEADER_USER", "API_USER")
    WORKERA_HEADER_KEY: str = os.getenv("WORKERA_HEADER_KEY", "API_KEY")
    # La doc advierte que rangos densos pueden tardar: timeout generoso.
    WORKERA_TIMEOUT_SEGUNDOS: int = _get_int("WORKERA_TIMEOUT_SEGUNDOS", 30)
    # Tope de páginas a recorrer por consulta (20 registros por página).
    WORKERA_MAX_PAGINAS: int = _get_int("WORKERA_MAX_PAGINAS", 20)
    # Tope mayor para la reportería mensual (un mes de todos los trabajadores
    # puede tener muchos más registros que la vista interactiva).
    WORKERA_MAX_PAGINAS_REPORTE: int = _get_int("WORKERA_MAX_PAGINAS_REPORTE", 200)

    # --- Asistencia (vista de marcaje) ---
    # Rango por defecto del historial: 1 = ayer + hoy (consulta rápida a Workera).
    ASISTENCIA_DIAS_DEFECTO: int = _get_int("ASISTENCIA_DIAS_DEFECTO", 1)
    ASISTENCIA_RANGO_MAX_DIAS: int = _get_int("ASISTENCIA_RANGO_MAX_DIAS", 62)
    # Colación (almuerzo) que se descuenta de la jornada bruta. Regla de la
    # empresa: todos los trabajadores tienen 2 h de colación, así que las horas
    # trabajadas y las alertas (normal/extra/excede) se calculan sobre el neto.
    COLACION_HORAS: float = float(os.getenv("COLACION_HORAS", "2") or 2)

    # --- Hardening HTTP ---
    # Claim iss del JWT: un token emitido por otro sistema con la misma
    # SECRET_KEY (improbable, pero defensa en profundidad) no valida aquí.
    JWT_ISSUER: str = os.getenv("JWT_ISSUER", "portal-maestranzatmg")
    # Anti host-header attack. "testserver" es el host que usa el TestClient.
    ALLOWED_HOSTS: list[str] = _get_list(
        "ALLOWED_HOSTS",
        ["localhost", "127.0.0.1", "testserver"],
    )
    # Payloads > 1 MB se rechazan con 413 (mitiga DoS por cuerpo gigante;
    # esta API solo mueve JSON pequeños).
    MAX_BODY_BYTES: int = _get_int("MAX_BODY_BYTES", 1_000_000)
    # HSTS: fuerza HTTPS en el navegador. Solo tiene efecto sobre TLS (los
    # navegadores ignoran la cabecera recibida por HTTP), así que es seguro
    # dejarlo activo; ponlo en 0 solo si un proxy ya la inyecta.
    HSTS_MAX_AGE: int = _get_int("HSTS_MAX_AGE", 63_072_000)  # 2 años

    # --- Supabase Storage (fotos de progreso de pedidos) ---
    # El backend habla con Storage vía REST usando la SERVICE_ROLE key
    # (solo servidor, jamás llega al navegador). Bucket PRIVADO: el frontend
    # recibe URLs firmadas temporales.
    SUPABASE_URL: str | None = os.getenv("SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY: str | None = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    FOTOS_BUCKET: str = os.getenv("FOTOS_BUCKET", "pedidos-fotos")
    # Tamaño máximo por imagen. DEBE ir alineado con el límite del bucket en
    # Supabase (hoy 50 MB): el backend es la primera barrera, así que si aquí
    # queda más bajo, subir el bucket no tiene ningún efecto.
    # Las apps cliente reducen la foto antes de subirla, así que en la
    # práctica se transfieren cientos de KB, no 50 MB.
    FOTO_MAX_BYTES: int = _get_int("FOTO_MAX_BYTES", 50 * 1024 * 1024)     # 50 MB
    FOTO_MAX_POR_PEDIDO: int = _get_int("FOTO_MAX_POR_PEDIDO", 10)
    FOTO_URL_EXPIRA_SEGUNDOS: int = _get_int("FOTO_URL_EXPIRA_SEGUNDOS", 3600)
    STORAGE_TIMEOUT_SEGUNDOS: int = _get_int("STORAGE_TIMEOUT_SEGUNDOS", 30)

    # --- Identidad del responsable (Ley 21.719, deber de información) ---
    RESPONSABLE_NOMBRE: str = os.getenv("RESPONSABLE_NOMBRE", "Maestranza TMG")
    RESPONSABLE_CONTACTO: str = os.getenv(
        "RESPONSABLE_CONTACTO", "rrhh@maestranzatmg.cl"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
