# Portal MaestranzaTMG — Documentación general del proyecto

> Documento panorámico: de qué va el proyecto, arquitectura, stack tecnológico, alcance funcional, roles y seguridad. Para el detalle de puesta en marcha ver el [README](README.md); para el historial técnico ver [CAMBIOS.md](CAMBIOS.md); para cumplimiento legal ver [docs/PROTECCION_DATOS.md](docs/PROTECCION_DATOS.md).

---

## 1. ¿De qué va el proyecto?

**Portal MaestranzaTMG** es una **intranet web** (aplicación de gestión interna) para una maestranza — un taller industrial que fabrica y repara piezas metalmecánicas. El sistema centraliza en un solo lugar la operación administrativa de la empresa: cuentas de usuario, recursos humanos, órdenes de trabajo, cartera de clientes, cobranza y monitoreo de máquinas.

Es un **prototipo funcional** (versión `0.4.0`) construido como proyecto de ingeniería, pero trabajado con criterios de producción: datos reales migrados desde planillas Excel de la empresa, cumplimiento de la **Ley 21.719** de protección de datos personales de Chile, y endurecimiento de seguridad siguiendo OWASP. Lleva **12 revisiones técnicas** documentadas.

El sistema es una **SPA** (*Single Page Application*) con arquitectura **cliente-servidor** clásica de tres capas:

```
  Navegador (React SPA)  ──HTTP/JSON+JWT──►  API REST (FastAPI)  ──►  Base de datos (Supabase/PostgreSQL)
                                                    │
                                                    ├──► Workera API  (reloj de asistencia externo)
                                                    └──► Supabase Storage  (fotos y adjuntos)
```

---

## 2. Stack tecnológico

### Backend (API REST)

| Tecnología | Versión | Para qué |
|---|---|---|
| **Python** | 3.11+ | Lenguaje del servidor |
| **FastAPI** | 0.124 | Framework web asíncrono; genera OpenAPI/Swagger automático |
| **Uvicorn** | 0.38 | Servidor ASGI que ejecuta la app |
| **SQLAlchemy** | 2.0 | ORM (mapeo objeto-relacional); estilo `Mapped`/`mapped_column` |
| **psycopg2** | 2.9 | Driver de PostgreSQL |
| **Pydantic** | 2.12 | Validación de entrada/salida (schemas) y settings |
| **bcrypt** | 4.2 | Hash de contraseñas |
| **PyJWT** | 2.10 | Firma y verificación de tokens JWT (HS256) |
| **python-multipart** | 0.0.20 | Subida de archivos (fotos de pedidos) |
| **requests** | 2.32 | Cliente HTTP hacia la API de Workera |
| **python-dotenv** | 1.2 | Carga de secretos desde `.env` |

### Frontend (SPA)

| Tecnología | Versión | Para qué |
|---|---|---|
| **React** | 19 | Librería de UI basada en componentes |
| **TypeScript** | 5.9 | Tipado estático sobre JavaScript |
| **Vite** | 7 | Build tool y dev server (HMR) |
| **React Router** | 7 | Enrutamiento del lado del cliente |
| **date-fns** | 4 | Manejo de fechas |
| **react-calendar** | 6 | Selector de calendario (solicitudes) |
| **ESLint** | 9 | Linter |

### Infraestructura y servicios externos

- **Supabase (PostgreSQL)** — base de datos gestionada; se usa además **RLS** (Row Level Security), **triggers**, funciones y **pg_cron** para depuración automática de datos.
- **Supabase Storage** — buckets privados para fotos de avance de pedidos y adjuntos de solicitudes.
- **Workera** — sistema externo de marcaje biométrico/reloj de asistencia; el portal solo **consulta** su API oficial, no registra marcas.
- **npm + concurrently** — orquesta backend y frontend juntos en desarrollo (`npm run dev`).

---

## 3. Arquitectura

### Backend — capas (Clean Architecture pragmática)

La regla de dependencia es estricta: **`routers → services → models/db`**.

```
backend/app/
├── main.py          Punto de entrada: CORS, middlewares de seguridad, registro de routers
├── dependencies.py  get_current_user (valida JWT) y require_roles (autorización)
├── core/            config.py (settings del .env), security.py (bcrypt+JWT),
│                    passwords.py (política de fortaleza), rate_limit.py
├── db/              session.py: ÚNICA puerta a la BD (engine + get_db)
├── models/          ORM por módulo: usuario, solicitud, pedido, iot, cliente,
│                    trabajo, factura, auditoria, pedido_foto
├── schemas/         Contratos Pydantic (validación de entrada/salida) por módulo
├── services/        Lógica de dominio: workera, asistencia, iot_metricas,
│                    privacidad, imagenes, almacenamiento, rut, vacaciones
└── routers/         Endpoints HTTP por módulo (todo cuelga de /api)
```

- **routers**: solo validan la entrada (con schemas) y traducen errores a códigos HTTP. No contienen lógica de negocio.
- **services**: donde vive la lógica y las integraciones (cliente de Workera, agregación de marcajes, poda de métricas IoT).
- **models/db**: la base de datos solo se toca a través de `app/db`.
- **Extensibilidad (principio Abierto/Cerrado)**: agregar un módulo nuevo = crear su `model` + `schema` + `service` + `router` y sumarlo a `app/routers/__init__.py`, sin tocar el resto.

### Frontend — modular por feature

```
frontend/src/
├── services/http.ts   Núcleo HTTP: URL base, token JWT, helper request() tipado
├── features/          UN directorio por módulo de negocio, cada uno con su api.ts:
│   ├── auth/          login + AuthContext (sesión)
│   ├── usuarios/      gestión de cuentas (vistas RRHH y Admin)
│   ├── solicitudes/   días libres (empleado, RRHH, Admin) + saldos de vacaciones
│   ├── asistencia/    historial y reportes de marcaje (Workera)
│   ├── pedidos/       órdenes de trabajo + fotos de avance
│   ├── sensores/      dashboard IoT + exportación CSV
│   ├── clientes/      cartera de clientes
│   ├── trabajos/      trabajos realizados a clientes
│   ├── facturas/      pagos pendientes / cobranza
│   ├── auditoria/     registro de cambios
│   └── privacidad/    datos personales del titular (Ley 21.719)
└── components/        UI compartida (Sidebar, Modal, Toast, ConfirmDialog, EmptyState)
```

- Regla de aislamiento: ninguna feature importa de otra, salvo tipos base de `auth` (usuario de sesión) y el núcleo `services/http.ts`.

---

## 4. Alcance funcional (módulos)

El sistema cubre **once módulos de negocio**. Todos los endpoints cuelgan del prefijo `/api`.

**Autenticación (`/auth`)** — login con emisión de JWT y `/auth/me` para revalidar sesión.

**Usuarios / Trabajadores (`/rrhh/usuarios`)** — RRHH crea, edita, habilita y deshabilita cuentas de empleados. La **anonimización irreversible** (derecho de supresión de la Ley 21.719) queda restringida solo a Admin.

**Solicitudes de días libres (`/rrhh/solicitudes`)** — el empleado crea sus solicitudes de permisos/licencias con adjunto opcional (certificado); RRHH las aprueba o rechaza. Incluye **saldo de vacaciones** por trabajador.

**Asistencia (`/rrhh/asistencia`)** — consulta el historial de marcaje desde **Workera** (no lo registra). El backend agrega las marcas crudas en jornadas diarias (primera entrada, última salida, colación, horas trabajadas) y genera reportes mensuales. La API key vive solo en el servidor; el navegador nunca la ve.

**Pedidos / Órdenes de trabajo (`/pedidos`)** — RRHH crea y asigna pedidos a empleados; el empleado ve los suyos y actualiza su estado. Soporta **fotos de avance** almacenadas en Supabase Storage.

**Sensores IoT (`/iot`)** — dashboard de métricas de máquinas de la planta. Ingesta de métricas y poda de históricos restringidas a Admin; consulta, resumen por máquina y **exportación CSV** (con saneamiento anti-inyección de fórmulas) para RRHH/Admin.

**Clientes (`/clientes`)** — cartera de clientes con contactos (1:N) y entidades de facturación/RUT (1:N), en diseño normalizado (3NF). Búsqueda por nombre, RUT, contacto o teléfono.

**Trabajos (`/trabajos`)** — trabajos realizados a cada cliente (fecha, valor en CLP, detalle), con FK real a clientes. Eliminar es solo de Admin.

**Facturas / Pagos pendientes (`/facturas`)** — cobranza de facturas por cobrar, con **diseño híbrido** (nombre digitado + vínculo opcional al cliente real). Antigüedad con semáforo (≤30 verde / 31–60 ámbar / >60 rojo), marcar pagada / reabrir. Eliminar solo Admin.

**Auditoría (`/auditoria`)** — registro de todos los cambios (INSERT/UPDATE/DELETE) sobre datos sensibles, con el **actor real** de la aplicación. Consultable por RRHH/Admin.

**Privacidad (`/privacidad`)** — el titular descarga sus propios datos en JSON (acceso y portabilidad) y consulta la política de tratamiento. La identidad sale del JWT, nunca de la URL.

---

## 5. Roles y permisos

El sistema tiene **tres roles**, verificados **en el backend** por endpoint (`require_roles`). El `ProtectedRoute` del frontend es solo experiencia de usuario, no seguridad real.

| | **empleado** | **rrhh** | **admin** |
|---|:---:|:---:|:---:|
| Ver/crear sus propias solicitudes y pedidos | ✔ | ✔ | ✔ |
| Descargar sus datos (privacidad) | ✔ | ✔ | ✔ |
| Gestionar cuentas de empleados | | ✔ | ✔ |
| Aprobar/rechazar solicitudes, ver saldos de vacaciones | | ✔ | ✔ |
| Consultar asistencia (Workera) y reportes | | ✔ | ✔ |
| Crear/asignar pedidos, gestionar clientes, trabajos y facturas | | ✔ | ✔ |
| Consultar el registro de auditoría | | ✔ | ✔ |
| Ver dashboard IoT | | ✔ | ✔ |
| **Anonimizar usuario** (supresión irreversible) | | | ✔ |
| **Eliminar** trabajos y facturas | | | ✔ |
| **Ingestar/podar métricas IoT** | | | ✔ |

Reglas clave: `admin` es **superusuario** (pasa siempre). **RRHH no puede crear ni promover administradores**, solo gestiona empleados. Un empleado solo ve y crea lo suyo. Las acciones irreversibles o destructivas (anonimizar, eliminar) quedan reservadas a Admin.

**Cuentas demo** (cambiar en producción): `admin@maestranzatmg.cl / Admin123*`, `rrhh@maestranzatmg.cl / Rrhh123*`, `empleado@maestranzatmg.cl / Empleado123*`.

---

## 6. Seguridad

**Autenticación y contraseñas**: hash **bcrypt** (nunca texto plano); política de fortaleza obligatoria (mínimo 8 caracteres, ≥3 clases de carácter, sin secuencias/repeticiones triviales, sin contraseñas comunes ni que contengan el correo). JWT firmado HS256 con expiración y emisor (`iss`) validado.

**Autorización**: control de rol por endpoint en el servidor; el frontend nunca decide permisos.

**Anti fuerza bruta**: rate limit doble de login — por (IP+correo) contra ataque a una cuenta (5 intentos/5 min → HTTP 429) y por IP contra *password spraying* (20 intentos/5 min).

**Validación de entrada**: Pydantic con tipos `Literal`, largos máximos, patrones (el parámetro que viaja a Workera solo admite `[A-Za-z0-9,]`), rechazo de `inf/nan`. **Cero SQL concatenado** — todo pasa por el ORM con parámetros ligados (verificado con bandit/SAST).

**Cabeceras y transporte defensivos**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, **HSTS**, **Permissions-Policy**, **Cross-Origin-Opener-Policy**, **CSP** `default-src 'none'` en `/api`, `Cache-Control: no-store`. `TrustedHostMiddleware` contra host-header attacks. **CORS** con orígenes/métodos/headers explícitos. Límite de payload (413 sobre 1 MB).

**Base de datos**: **RLS deny-by-default** en todas las tablas, roles públicos sin privilegios, funciones sin EXECUTE público y con `search_path` fijo, auditoría con actor de aplicación, retención automática (`pg_cron`).

**No filtración de información**: manejador global de errores que no expone trazas, mensaje de login único para "usuario no existe" y "clave incorrecta" (evita enumeración de cuentas), logs con correos enmascarados.

**Secretos fuera del código**: todo en `backend/.env` (git-ignorado); las keys de Workera y Supabase jamás llegan al frontend.

**Deuda conocida y aceptada** (intranet local, documentada a propósito): JWT en `localStorage` (expuesto a XSS si se inyectara HTML sin sanitizar) y rate limit en memoria de un solo proceso. Si el sistema se expone a internet: migrar a cookies httpOnly + Redis y servir tras TLS.

---

## 7. Cumplimiento legal (Ley 21.719)

El proyecto implementa en código la ley chilena de protección de datos personales (vigencia 1 de diciembre de 2026):

- **Registro de actividades de tratamiento** documentado (qué dato, finalidad, base de licitud, plazo, dónde vive).
- **Derechos del titular**: acceso y portabilidad automatizados (descarga JSON desde *Privacidad*); rectificación vía RRHH (auditada); supresión como **anonimización irreversible** (solo Admin), conservando disociados los registros que la ley obliga a retener.
- **Retención automática**: `fn_depurar_retencion()` corre por `pg_cron` el día 1 de cada mes. Plazos: solicitudes 5 años, pedidos/trabajos/facturas 6 años (art. 17 C. Tributario), auditoría 3 años.
- **Procedimiento de brechas**: detección/contención, evaluación, notificación a la Agencia dentro de **72 horas** ante riesgo, y remediación.

---

## 8. Persistencia y datos

La base de datos evoluciona por **migraciones SQL versionadas** (`backend/db/migrations/`), ocho hasta la fecha:

```
001_seguridad_y_retencion.sql       005_auditoria_solicitudes_pedidos.sql
002_auditoria_actor_app.sql         006_clientes_y_trabajos.sql
003_fotos_pedidos_storage.sql       007_auditoria_cliente_detalle.sql
004_solicitudes_adjunto.sql         008_facturas_pendientes.sql
```

Se migraron **datos reales** desde las planillas Excel de la empresa con criterios rigurosos (sin adivinar datos ambiguos de dinero ni fechas ilegibles): 113 clientes, 119 contactos, 103 entidades, 55 trabajos y 233 facturas pendientes ($87.179.882 por cobrar). Todos los RUT pasaron el dígito verificador.

---

## 9. Puesta en marcha (resumen)

Requisitos: **Python 3.11+**, **Node 20+**, credenciales en `backend/.env`.

```bash
# Backend (primera vez)
cd backend && python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
python scripts/seed.py            # opcional: tablas + usuarios demo

# Frontend (primera vez)
cd ../frontend && npm install

# Desarrollo diario (desde la raíz: levanta backend + frontend juntos)
npm run dev
```

**Scripts útiles** (`backend/scripts/`): `seed.py` (datos demo), `migrate_passwords.py`, `simulador_iot.py` (genera métricas de prueba), `verificar_workera.py` (detecta el esquema de auth de la API de Workera).

**Tests**: `python tests/test_api.py` (e2e sobre SQLite en memoria, con Workera simulado) y `python tests/test_asistencia.py` (unitarios del agregador de marcajes). Frontend: `npm run lint` y `npm run build` (incluye chequeo de tipos).

---

## 10. Estado y madurez

Prototipo en versión `0.4.0`, con 12 revisiones técnicas que fueron incorporando: seguridad base → refactor de arquitectura + integración Workera → rediseño UX/UI → hardening de BD y cumplimiento Ley 21.719 → fotos de pedidos → endurecimiento OWASP → asistencia con reportes → solicitudes con adjuntos y vacaciones → auditoría con visor → módulos de clientes y trabajos → módulo de pagos pendientes. Suite e2e verde (152 checks en la última revisión).
