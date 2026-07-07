# scripts/verificar_workera.py
"""
Verificador de la integración con Workera.

La documentación pública de Workera exige API_USER + API_KEY pero no publica
el nombre exacto de los headers. Este script prueba las combinaciones
típicas contra el endpoint real /attendanceData (rango: ayer-hoy) y te dice
exactamente qué poner en backend/.env.

Uso (desde la carpeta backend, con el venv activado y el .env configurado):
    python scripts/verificar_workera.py
"""

import _bootstrap  # noqa: F401  (agrega backend/ al sys.path)

from datetime import date, timedelta

import requests

from app.core.config import settings

TIMEOUT = 35  # la doc advierte que puede tardar

# Hosts candidatos: el configurado + los dos que menciona el Manual v1.4 CL
# (declara api.workera.com como base, pero sus ejemplos usan workera.com).
HOSTS = []
for host in (
    settings.WORKERA_API_BASE_URL,
    "https://api.workera.com/apiClient/v1",
    "https://workera.com/apiClient/v1",
):
    if host and host not in HOSTS:
        HOSTS.append(host)

# (etiqueta, estilo, extras) -> cómo declarar cada intento en el .env.
# El primero es el documentado en el Manual API Workera v1.4 CL.
COMBOS: list[tuple[str, str, dict[str, str]]] = [
    ("headers API_USER/API_KEY (manual)", "headers", {"user": "API_USER", "key": "API_KEY"}),
    ("headers user/apiKey",       "headers", {"user": "user", "key": "apiKey"}),
    ("headers apiUser/apiKey",    "headers", {"user": "apiUser", "key": "apiKey"}),
    ("headers X-API-USER/X-API-KEY", "headers", {"user": "X-API-USER", "key": "X-API-KEY"}),
    ("HTTP Basic (user:key)",     "basic",   {}),
    ("Bearer key + header user",  "bearer",  {"user": "user"}),
]


def construir_request(estilo: str, extras: dict[str, str], user: str, key: str):
    headers = {"Accept": "application/json"}
    auth = None
    if estilo == "basic":
        auth = (user, key)
    elif estilo == "bearer":
        headers["Authorization"] = f"Bearer {key}"
        headers[extras.get("user", "user")] = user
    else:
        headers[extras["user"]] = user
        headers[extras["key"]] = key
    return headers, auth


def main() -> int:
    user = settings.WORKERA_API_USER
    key = settings.WORKERA_API_KEY
    if not user or not key:
        print("✗ Falta WORKERA_API_USER y/o WORKERA_API_KEY en backend/.env")
        return 1

    hoy = date.today()
    params = {
        "start": (hoy - timedelta(days=1)).isoformat(),
        "end": hoy.isoformat(),
        "page": 1,
    }

    print(f"Probando credenciales de {user} contra {len(HOSTS)} host(s)...\n")
    exitos: list[tuple[str, str, str, dict[str, str]]] = []

    for host in HOSTS:
        url = f"{host}/attendanceData"
        for etiqueta, estilo, extras in COMBOS:
            headers, auth = construir_request(estilo, extras, user, key)
            try:
                r = requests.get(
                    url, headers=headers, auth=auth, params=params, timeout=TIMEOUT
                )
            except requests.RequestException as e:
                print(f"  [{etiqueta:32s}] {host}  -> ERROR de red: {type(e).__name__}")
                continue

            ok_json = False
            if r.ok:
                try:
                    cuerpo = r.json()
                    ok_json = isinstance(cuerpo, (dict, list))
                except ValueError:
                    ok_json = False

            estado = f"HTTP {r.status_code}" + (" + JSON válido" if ok_json else "")
            print(f"  [{etiqueta:32s}] {host}  -> {estado}")

            if r.ok and ok_json:
                exitos.append((host, etiqueta, estilo, extras))

    print()
    if not exitos:
        print("✗ Ninguna combinación funcionó. Revisa que la API Key esté HABILITADA")
        print("  en Workera (Perfil -> API), que la suscripción esté vigente, y")
        print("  consulta a soporte de Workera (support@workera.com) el esquema exacto.")
        return 1

    host, etiqueta, estilo, extras = exitos[0]
    print(f"✓ Funciona: {etiqueta} contra {host}")
    print("\nDeja estas líneas en backend/.env:\n")
    print(f"  WORKERA_API_BASE_URL={host}")
    print(f"  WORKERA_AUTH_STYLE={estilo}")
    if estilo == "headers":
        print(f"  WORKERA_HEADER_USER={extras['user']}")
        print(f"  WORKERA_HEADER_KEY={extras['key']}")
    elif estilo == "bearer":
        print(f"  WORKERA_HEADER_USER={extras.get('user', 'user')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
