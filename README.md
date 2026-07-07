# Portal MaestranzaTMG

Intranet para la maestranza TMG con tres roles (**admin**, **rrhh**, **empleado**) y módulos de usuarios/trabajadores, solicitudes de días libres, asistencia (marcaje vía **Workera**), pedidos, sensores IoT y reportería.

**Stack:** FastAPI + SQLAlchemy 2.0 sobre **Supabase (PostgreSQL)** · React 19 + TypeScript + Vite.

---

## Arquitectura

```
PrototipoTMG/
├── backend/
│   ├── app/
│   │   ├── main.py            # App FastAPI: CORS, headers de seguridad, registro de routers
│   │   ├── dependencies.py    # get_current_user (JWT) y require_roles (autorización)
│   │   ├── core/              # config.py (settings desde .env), security.py (bcrypt+JWT), rate_limit.py
│   │   ├── db/                # session.py: ÚNICA conexión a Supabase/Postgres (engine, get_db)
│   │   ├── models/            # ORM por módulo: usuario, solicitud, pedido, iot
│   │   ├── schemas/           # Contratos Pydantic por módulo (validación entrada/salida)
│   │   ├── services/          # Lógica de dominio: workera.py (cliente API), asistencia.py, iot_metricas.py
│   │   └── routers/           # HTTP por módulo: auth, usuarios, solicitudes, asistencia, pedidos, iot
│   ├── scripts/               # seed, migrate_passwords, simulador_iot, verificar_workera
│   ├── tests/                 # test_api.py (e2e, 39 checks) + test_asistencia.py (unitarios, 15 checks)
│   ├── requirements.txt       # dependencias directas · requirements-dev.txt para tests
│   └── .env                   # secretos locales (plantilla: .env.example)
└── frontend/
    └── src/
        ├── services/http.ts   # núcleo HTTP: URL base, token JWT, helper request()
        ├── features/          # UN directorio POR MÓDULO de negocio:
        │   ├── auth/          #   login + contexto de sesión + api.ts
        │   ├── usuarios/      #   gestión de cuentas (vistas RRHH y Admin) + api.ts
        │   ├── solicitudes/   #   días libres: empleado, RRHH y Admin + api.ts
        │   ├── asistencia/    #   marcaje vía Workera (vista compartida RRHH/Admin) + api.ts
        │   ├── pedidos/       #   órdenes de trabajo + api.ts
        │   └── sensores/      #   dashboard IoT + reporte CSV + api.ts
        └── components/        # UI compartida (Navbar, Toast, ConfirmDialog, EmptyState)
```

**Regla de capas (backend):** `routers → services → models/db`. Los routers solo validan entrada (schemas) y traducen errores a HTTP; la lógica vive en services; la BD solo se toca vía `app/db`. Agregar un módulo nuevo = crear su model/schema/service/router y sumarlo a `app/routers/__init__.py`.

**Regla de módulos (frontend):** cada feature tiene su `api.ts` (fetch tipado contra el backend) y sus vistas. Nada importa de otra feature salvo tipos base de `auth` (usuario de sesión) y el núcleo `services/http.ts`.

---

## Puesta en marcha

Requisitos: Python 3.11+, Node 20+, credenciales en `backend/.env` (plantilla en `backend/.env.example`).

```bash
# 1) Backend (primera vez)
cd backend
python -m venv .venv && .venv\Scripts\activate      # Windows
pip install -r requirements.txt
python scripts/seed.py            # opcional: crea tablas + usuarios demo

# 2) Frontend (primera vez)
cd ../frontend
npm install

# 3) Desarrollo diario (desde la raíz; levanta backend + frontend juntos)
npm run dev
```

| Rol      | Email demo                  | Password      |
|----------|-----------------------------|---------------|
| admin    | admin@maestranzatmg.cl      | Admin123*     |
| rrhh     | rrhh@maestranzatmg.cl       | Rrhh123*      |
| empleado | empleado@maestranzatmg.cl   | Empleado123*  |

> Cámbialas en producción. La política de contraseñas exige mínimo 8 caracteres al crear/editar cuentas.

---

## Módulo de asistencia (marcaje vía Workera)

El marcaje **no** se registra en este sistema: la empresa usa [Workera](https://workera.com) (reloj biométrico / app). Este portal **consulta** el historial por la [API oficial](https://help.workera.com/documentaci%C3%B3n-de-apis) y lo muestra a **RRHH y Admin** (menú *Asistencia*).

Flujo: `frontend → GET /api/rrhh/asistencia/historial → services/workera.py (HTTP) → services/asistencia.py (agrega marcas crudas en jornadas diarias: primera entrada, última salida, horas)`.

- La **API key vive solo en el backend** (`backend/.env`); el navegador nunca la ve. El endpoint exige JWT + rol rrhh/admin.
- Filtros `desde`/`hasta` (defecto: últimos 7 días; tope 62 días — la API de Workera pagina de a 20 y se degrada con rangos densos).
- Las marcas anuladas (estado INACTIVO) se ignoran. Jornada sin salida = “En curso”.

**Configuración** (en `backend/.env`):

```ini
WORKERA_API_USER=correo-de-la-cuenta      # Workera -> Editar perfil -> API
WORKERA_API_KEY=clave_de_32_caracteres
```

La documentación pública de Workera no especifica el nombre exacto de los headers de autenticación, por eso el esquema es configurable (`WORKERA_AUTH_STYLE`, `WORKERA_HEADER_*`). Para detectarlo automáticamente con tus credenciales reales:

```bash
cd backend
python scripts/verificar_workera.py   # prueba las combinaciones y te dice qué poner en el .env
```

---

## Seguridad

- **Contraseñas** con hash bcrypt (nunca en texto plano); política de largo mínimo configurable.
- **JWT** firmado (HS256, `SECRET_KEY` del .env) con expiración; `/auth/me` revalida sesión.
- **Autorización en el backend** por endpoint (`require_roles`): RRHH no puede crear/promover admins, solo gestiona empleados; un empleado solo ve/crea lo suyo. El `ProtectedRoute` del frontend es solo UX.
- **Rate limit de login**: 5 intentos fallidos por IP+email en 5 min → HTTP 429 (frena fuerza bruta).
- **Headers defensivos** en todas las respuestas (nosniff, X-Frame-Options DENY, Referrer-Policy, Cache-Control no-store en /api) y **CORS** con orígenes/métodos/headers explícitos.
- **Secretos fuera del código**: todo en `backend/.env` (git-ignorado); las keys de Workera y Supabase jamás llegan al frontend.
- Mensaje de login único para "usuario no existe" y "clave incorrecta" (evita enumeración de cuentas).

Deuda conocida (aceptada para intranet local, documentada a propósito): el JWT se guarda en `localStorage` (simple, pero expuesto a XSS si algún día se inyecta HTML sin sanitizar); el rate limit es en memoria (suficiente con un solo proceso uvicorn).

---

## Tests

```bash
cd backend
pip install -r requirements-dev.txt   # agrega httpx (TestClient)
python tests/test_api.py              # e2e: auth, roles, módulos, asistencia simulada (39 checks)
python tests/test_asistencia.py       # unitarios del agregador de marcajes (15 checks)
```

Los tests corren sobre SQLite en memoria y **simulan** la API de Workera (sin red). Frontend: `npm run lint` y `npm run build` (incluye chequeo de tipos).
