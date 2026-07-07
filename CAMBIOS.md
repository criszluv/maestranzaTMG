# Cambios — Portal MaestranzaTMG

Historial de las dos revisiones técnicas del proyecto. La documentación de
arquitectura y puesta en marcha vive en el [README](README.md).

---

## Revisión 10 — Saldos por trabajador, edición en modal y visor de auditoría

- **Saldos de vacaciones por trabajador** (RRHH/Admin): nuevo apartado en la
  gestión de solicitudes con los días restantes de cada trabajador, con selector
  de año. Endpoint `GET /api/rrhh/vacaciones` (una consulta, sin N+1).
- **Editar usuario en ventana aparte**: el formulario de la izquierda ahora
  SOLO crea; editar abre un **modal** dedicado (`EditarUsuarioModal` + `Modal`
  reutilizable), para no confundir "crear" con "editar". Los cambios de usuario
  ya se auditaban (trigger sobre `users`).
- **Registro de cambios (auditoría) — la opción más efectiva sin duplicar**: en
  vez de crear otra tabla, se **reutiliza `auditoria_datos`** y se **extiende**
  la auditoría a `rrhh_solicitudes` y `pedido` (migración
  `005_auditoria_solicitudes_pedidos.sql`, función genérica + triggers,
  aplicada en Supabase). Los routers de solicitudes y pedidos ahora fijan el
  **actor** real. Nuevo **visor** `GET /api/auditoria` (RRHH/Admin, filtrable
  por tabla) y vista *Registro de cambios* que muestra quién creó/editó/eliminó
  qué y cuándo (con el diff de campos). Verificado en vivo contra la BD.
- Tests: 110/110 e2e (nuevos: lista de saldos, visor de auditoría con lectura,
  filtro y guardas de rol). `.env` de la BD confirmado (proyecto PeroyectoEv4).

---

## Revisión 9 — Solicitudes: adjunto, saldo de vacaciones y módulo RRHH

- **Saldo de vacaciones**: cada trabajador tiene **15 días hábiles/año**
  (`VACACIONES_DIAS_ANUALES`). Solo las solicitudes de tipo **Vacaciones**
  **aprobadas** descuentan; los días se cuentan **hábiles (lun–vie)** del rango
  (`app/services/vacaciones.py`, se calcula al vuelo, sin columnas nuevas).
  Endpoints `GET /api/rrhh/mis-vacaciones` y `/vacaciones/{id}` (RRHH/Admin).
- **Advertencia (no bloquea)** al pedir vacaciones que superan el saldo
  disponible; el trabajador ve su saldo y los días hábiles que consume la
  solicitud. RRHH/Admin ven los días hábiles en cada solicitud.
- **Adjunto (1 foto-documento por solicitud)**: opcional, lo sube el trabajador
  (o RRHH/Admin). Reutiliza el bucket privado `pedidos-fotos` (prefijo
  `solicitud_{id}/`), validación por **magic bytes** (JPG/PNG/WebP, 5 MB), ruta
  con UUID y **URL firmada** temporal. Endpoints GET/POST/DELETE
  `/api/rrhh/solicitudes/{id}/adjunto`. Migración `004_solicitudes_adjunto.sql`
  (columnas `adjunto_*` nullable, aplicada en Supabase).
- **RRHH toma sus propios días**: nueva vista *Mis días libres*
  (`/rrhh/mis-solicitudes`) con su saldo e historial; el backend ya permitía a
  RRHH/Admin crear y aprobar solicitudes propias.
- Tests: 100/100 e2e (nuevos: saldo de vacaciones, días hábiles, adjunto de
  solicitud con Storage simulado). `.env.example` documenta las variables nuevas.

---

## Revisión 8 — Asistencia Workera: colación, rendimiento y reportes

- **Colación de 2 h**: las horas trabajadas y las alertas (normal/extra/excede)
  se calculan sobre el **neto** = bruto − 2 h (regla de la empresa: todos tienen
  2 h de almuerzo). Nunca baja de 0. Configurable (`COLACION_HORAS`); la jornada
  expone también `horas_brutas` (visible en un tooltip en la tabla).
- **Consulta más rápida a Workera**: (1) el host que responde (`workera.com`) se
  **memoriza a nivel de proceso**, así solo la primera consulta paga el reintento
  contra `api.workera.com`; (2) el rango por defecto del historial pasó de 7 días
  a **ayer + hoy**.
- **Reporte mensual** (`GET /api/rrhh/asistencia/reporte?anio&mes`, solo
  RRHH/Admin): una fila por trabajador con días asistidos, jornadas
  completas/incompletas (sin marcar entrada o salida) y horas netas del mes.
  Nueva pestaña "Reporte mensual" en Asistencia con selector de mes/año y
  **exportación CSV** (saneada contra inyección de fórmulas).
- **Arranque `npm run dev` más estable**: uvicorn `--reload` ahora vigila solo
  `backend/app` (antes recorría `.venv`, `node_modules` y la carpeta de OneDrive,
  causa probable de que el primer arranque fallara) y `concurrently -k` cierra
  ambos procesos juntos para no dejar el puerto ocupado.
- Tests: 85/85 e2e + 27/27 de asistencia (nuevos: colación, resumen mensual y
  el endpoint de reporte). `.env.example` documenta las variables nuevas.

---

## Revisión 7 — Endurecimiento de seguridad y programación segura

Pasada de *hardening* sobre una base ya sólida (bcrypt, JWT con `iss`, RLS
deny-by-default, auditoría con actor, retención legal, magic bytes, Storage
privado). Auditoría de código: **cero SQL concatenado** (todo por ORM) y **cero
XSS** (React escapa por defecto, sin `dangerouslySetInnerHTML`). Se cerraron
los huecos restantes:

- **Fortaleza de contraseñas obligatoria** (`app/core/passwords.py`) al crear o
  cambiarlas: mínimo 8 caracteres, ≥3 clases de carácter, sin secuencias ni
  patrones repetidos, sin contraseñas comunes/corporativas (blocklist) y que no
  contengan el correo del titular. Replicada en el frontend
  (`passwordPolicy.ts`) para feedback inmediato, con la política visible bajo el
  campo en los formularios de RRHH y Admin. El servidor es la autoridad final.
- **Anti *password spraying***: segundo limitador de login por IP (20/5 min),
  además del existente por IP+correo (5/5 min) contra fuerza bruta a una cuenta.
- **Inyección de fórmulas CSV (CWE-1236)**: la exportación de reportería IoT
  ahora sanea el texto libre (nombre de máquina) para que Excel/LibreOffice no
  ejecute celdas que empiecen por `= + - @`.
- **Headers defensivos ampliados**: HSTS, Permissions-Policy,
  Cross-Origin-Opener-Policy, X-Permitted-Cross-Domain-Policies y una CSP
  `default-src 'none'` en las respuestas `/api`.
- **Validación de entrada reforzada**: largos máximos en todo el texto libre
  (usuarios, pedidos, solicitudes, IoT) y rechazo de `inf/nan` en métricas
  (defensa en profundidad, además del tope global de 1 MB de payload).
- **Manejador global de excepciones**: los errores no controlados se registran
  en el servidor y devuelven un mensaje genérico (sin filtrar trazas).
- Tests: 78/78 e2e (12 nuevos: política de contraseñas, headers de seguridad,
  saneamiento CSV). Documentación de cumplimiento (`docs/PROTECCION_DATOS.md`) y
  `.env.example` actualizados con los nuevos controles y variables.

---

## Revisión 6 — Fotos de progreso en pedidos (Supabase Storage)

- **Bucket privado `pedidos-fotos`** creado en vivo (migración
  `003_fotos_pedidos_storage`): 5 MB por archivo y whitelist JPEG/PNG/WebP
  aplicados por el propio Storage; acceso solo por **URLs firmadas** de 1 h
  que genera el backend con la SERVICE_ROLE key (jamás llega al navegador).
- **Tabla `public.pedido_fotos`** (RLS, sin grants públicos): metadatos +
  **soft-delete auditado** — "eliminar" pasa la foto a `estado='oculta'`
  (desaparece de todas las vistas) registrando quién y cuándo; el archivo
  queda resguardado y solo la retención del pedido (6 años) lo depura de
  verdad (fn_depurar_retencion ahora también barre el bucket).
- **Endpoints** en `/api/pedidos/{id}/fotos` (GET/POST/DELETE): autorización
  por pedido (empleado asignado, RRHH, admin), máximo **10 fotos visibles**
  por pedido, validación del tipo REAL por **magic bytes** (anti spoofing de
  Content-Type), rutas generadas con UUID (nunca el nombre del cliente),
  límite de payload multipart de 6 MB. Al borrar un pedido se limpian sus
  objetos del bucket (best-effort).
- **Frontend**: componente `FotosPedido` compartido — el empleado sube y
  elimina en *Mis pedidos* (contador X/10); RRHH/Admin revisan el avance por
  pedido en *Gestión de pedidos* (botón Fotos) y pueden moderar.
- Tests: 66/66 e2e (14 nuevos de fotos con Storage simulado: autorización,
  magic bytes, límite, soft-delete con resguardo verificado en BD).

---

## Revisión 5 — Cumplimiento Ley 21.719 en el código + hardening OWASP

### Derechos del titular implementados en la aplicación

- **Módulo de privacidad** (`services/privacidad.py` + `routers/privacidad.py`):
  `GET /api/privacidad/politica` (transparencia: política servida desde una
  fuente única) y `GET /api/privacidad/mis-datos` (derecho de **acceso y
  portabilidad**: paquete JSON con cuenta, solicitudes y pedidos del titular;
  la identidad sale del JWT, nunca de la URL).
- **Derecho de supresión compatible con retención legal**:
  `POST /api/rrhh/usuarios/{id}/anonimizar` (solo admin, irreversible) —
  seudonimiza nombre/correo, invalida la contraseña y desactiva la cuenta,
  conservando disociados los registros con plazo legal vigente. Protecciones:
  no a uno mismo, no al único admin activo.
- **Auditoría con actor real** (migración `002_auditoria_actor_app.sql`,
  aplicada en vivo): el backend fija `app.actor` por transacción
  (`set_config`, parámetros ligados) y el trigger lo copia a
  `auditoria_datos.actor_app` — quién hizo cada cambio a nivel de persona.
- **Frontend**: sección **Privacidad** para todos los roles (política +
  descarga de datos propios en JSON), aviso de tratamiento en el login.
- `docs/PROTECCION_DATOS.md`: registro de tratamiento, derechos, medidas,
  encargados (Supabase/Workera) y procedimiento de brechas (72 h).

### Hardening OWASP

- **Inyección SQL**: auditoría de código + SAST (bandit) — el 100 % del SQL
  pasa por el ORM con parámetros ligados; cero concatenación. El único
  hallazgo real de bandit (assert eliminable con `-O`) se corrigió.
- **Entrada**: el parámetro `empleados` que viaja a la API de Workera ahora
  exige patrón `[A-Za-z0-9,]` (anti parameter-smuggling); payloads > 1 MB se
  rechazan con 413 (anti DoS).
- **HTTP**: `TrustedHostMiddleware` (anti host-header attack), CSP parcial en
  `index.html` (object/base/form/frame) con CSP completa documentada para el
  reverse proxy de producción.
- **JWT**: claim `iss` emitido y validado (anti token-confusion).
- **Logs de seguridad** (los logs también son tratamiento): login fallido,
  bloqueo por fuerza bruta y anonimizaciones se registran con correos
  **enmascarados** (`enmascarar_email`).
- Verificado: XSS (0 sinks peligrosos en React), CSRF no aplica (Bearer, sin
  cookies), tests 52/52 + 15/15, tsc/eslint/build en cero.

---

## Revisión 4 — Seguridad de la base de datos Supabase (Ley 21.719)

Aplicada en vivo al proyecto "PeroyectoEv4" (4 migraciones registradas en
Supabase; copia de referencia en `backend/db/migrations/001_seguridad_y_retencion.sql`).

- **Fix "Unrestricted" (hallazgo crítico del advisor)**: los roles públicos
  `anon`/`authenticated` tenían TODOS los privilegios (hasta TRUNCATE sobre
  `users` con hashes de contraseñas). Ahora: RLS deny-by-default en todas las
  tablas + `REVOKE ALL` + default privileges revocados (tablas, secuencias y
  funciones). El backend FastAPI no se afecta (conecta como dueño).
- **Integridad**: CHECK de rol en `users`, estado/rango de fechas en
  `rrhh_solicitudes` (+ `trabajador_id` y `estado` NOT NULL), `valor >= 0` en
  `pedido`; `iot_metricas.timestamp` convertido a `timestamptz`; eliminada la
  tabla muerta `iot_mediciones`.
- **Ley 21.719** (vigencia 01-12-2026): tabla `auditoria_datos` + trigger
  sobre `users` (quién/qué/cuándo, sin hashes), `COMMENT` de finalidad y plazo
  en cada tabla (base del registro de actividades de tratamiento), funciones
  con `search_path` fijo y sin EXECUTE público (advisor de Supabase sin
  crítico ni warnings; solo INFO por el deny-by-default intencional).
- **Retención legal automática**: `fn_depurar_retencion()` programada con
  pg_cron (día 1 de cada mes): solicitudes >5 años desde `fecha_fin`
  (criterio DT), pedidos terminados >6 años (art. 17 Código Tributario),
  telemetría IoT >90 días (minimización), auditoría >3 años. Primera
  ejecución verificada (depuró 23 métricas antiguas).
- `pedido` ganó `creado_en`/`actualizado_en` (sin fecha no había retención
  posible) y los modelos SQLAlchemy quedaron alineados.

---

## Revisión 3 — Rediseño UX/UI (sistema de diseño + navegación)

- **Design tokens** en `styles/index.css`: paleta semántica (ISA-101: base neutra slate, azul acero para acciones, rojo SOLO para crítico/marca), tipografía Inter, escalas de espaciado/radios/sombras, `:focus-visible` global y soporte `prefers-reduced-motion`.
- **Sidebar lateral** (`components/layout/Sidebar.tsx`, reemplaza al Navbar): módulos agrupados por sección (Principal / Personas / Operación) según rol, iconos SVG propios (`components/common/Icon.tsx`, adiós emojis), avatar + logout, responsiva (pasa a barra superior < 860 px).
- **Panel de planta** rediseñado bajo High-Performance HMI: stat-cards con alertas críticas primero, banner de alarma, tabla neutra donde el color aparece solo en estados anómalos (texto + color, nunca solo color), leyenda de umbrales.
- **Accesibilidad**: corregidos chips con contraste ~1.4:1 en MisSolicitudes (ahora AA ≥ 4.5:1), labels asociados con `htmlFor` en login, `aria-label`/`role="alert"` donde corresponde, targets táctiles ≥ 34 px.
- Login sobrio con marca TMG, botones de acción re-semantizados (aprobar = azul acción, rechazar/eliminar = rojo), fondos y encabezados unificados vía clases en las 10 vistas.

---

## Revisión 2 — Refactor de arquitectura + integración Workera real

### 1. Integración con la API de Workera (marcaje)

Antes existía solo un cliente *placeholder* con TODOs. Ahora:

- **Cliente real** (`app/services/workera.py`) según la [documentación oficial](https://help.workera.com/documentaci%C3%B3n-de-apis): endpoint `GET /apiClient/v1/attendanceData`, parámetros `start`/`end`/`page`, recorrido completo de la **paginación** (20 registros por página) con tope configurable.
- **Agregación de jornadas** (`app/services/asistencia.py`): Workera entrega *marcas* crudas (cada pasada de huella/tarjeta); el servicio las agrupa por trabajador y día → primera entrada, última salida, horas trabajadas. Ignora marcas anuladas (INACTIVO), acepta `attendanceType` y `attTypeInDevice`, y trata entradas/salidas extraordinarias (tipos 3/2). Es una función pura con 15 tests unitarios.
- **Endpoint** `GET /api/rrhh/asistencia/historial?desde&hasta` (solo RRHH/Admin) con defecto de últimos 7 días y tope de 62 (la API de Workera se degrada con rangos densos). Errores traducidos: sin credenciales → 503; credenciales rechazadas o falla de red → 502 con mensaje claro.
- **Esquema de autenticación configurable** (`WORKERA_AUTH_STYLE`, `WORKERA_HEADER_*`): la doc pública no fija el nombre de los headers. `python scripts/verificar_workera.py` prueba las combinaciones típicas contra la API real y dicta la configuración correcta para el `.env`.
- **Variables unificadas** a `WORKERA_*` con compatibilidad hacia las antiguas `WORKERIA_*` (no hay que tocar el `.env` existente); si la URL antigua apuntaba directo a `/attendanceData`, se normaliza sola.
- Frontend: sección **Asistencia** habilitada para **RRHH** (antes solo Admin) como vista compartida `features/asistencia/HistorialAsistencia.tsx`, con **filtros de fecha**, contadores (jornadas, críticas >10 h, en curso) y estados de error/vacío. La API key nunca llega al navegador (el backend hace de proxy con control de acceso propio).

### 2. Reestructura del backend (Clean Architecture pragmática)

- `app/db/` concentra la conexión a Supabase (antes `database.py` suelto).
- `models.py` monolítico → `app/models/` con un archivo por dominio.
- Schemas Pydantic separados de los routers → `app/schemas/` por módulo.
- Router `rrhh.py` (usuarios + solicitudes + asistencia mezclados) dividido en `usuarios.py`, `solicitudes.py` y `asistencia.py`. **Las URLs no cambian.**
- `app/routers/__init__.py` registra todos los routers (agregar un módulo no toca `main.py`).
- Scripts utilitarios movidos a `backend/scripts/` (`seed`, `migrate_passwords`, `simulador_iot`, + nuevo `verificar_workera`).
- Poda de métricas IoT deduplicada en `app/services/iot_metricas.py` (antes copiada en el router y el simulador).

### 3. Seguridad añadida

- **Rate limit de login**: 5 intentos fallidos por IP+email en 5 min → 429.
- **Política de contraseñas**: mínimo 8 caracteres al crear/cambiar (422 si no cumple).
- **Headers defensivos** globales (nosniff, X-Frame-Options DENY, Referrer-Policy, Cache-Control no-store en `/api`).
- CORS con métodos y headers **explícitos** (antes `*`).
- `.gitignore` corregido: `.env.*` ignoraba también la plantilla `.env.example`.

### 4. Reestructura del frontend (features por dominio)

- `services/api.ts` monolítico (326 líneas, 5 módulos mezclados) → `services/http.ts` (núcleo: URL base, token, `request()`) + un `api.ts` **por feature**.
- Carpetas por rol (`admin/`, `rrhh/`, `iot/`) → carpetas por **módulo de negocio**: `auth`, `usuarios`, `solicitudes`, `asistencia`, `pedidos`, `sensores`. Vistas duplicadas de asistencia (Admin y RRHH tenían cada una la suya) → una sola compartida.
- `VistaRRHH` ahora solo gestiona solicitudes + calendario (el marcaje tiene su propia página, enlazada desde el navbar y el encabezado).
- ESLint y `tsc` quedan **en cero**: corregidos los 3 avisos `react-refresh/only-export-components` pendientes (hooks de contexto permitidos explícitamente en la config) y un `set-state-in-effect` en `MisSolicitudes`.

### 5. Limpieza

- Eliminados: `frontend/dist` (artefacto de build), `__pycache__`, `assets/react.svg` y `vite.svg` (plantilla Vite), README boilerplate de Vite.
- `index.html`: `lang="es"`, título "Portal MaestranzaTMG" y favicon propio.
- `requirements.txt`: de 30 paquetes congelados → 10 dependencias directas comentadas (+ `requirements-dev.txt` para tests).
- `.env.example` actualizado con toda la configuración documentada.

### 6. Tests

- `tests/test_api.py`: 30 → **39 checks** (asistencia con Workera simulada, rate limit, política de contraseñas, rangos de fecha inválidos).
- `tests/test_asistencia.py` (nuevo): **15 checks** unitarios del agregador de marcajes.

### Pendiente (no bloqueante)

- Ejecutar `python scripts/verificar_workera.py` con conexión a internet para confirmar el esquema de autenticación de Workera y fijarlo en el `.env`.
- Si el sistema sale de un entorno local: mover el JWT a cookies httpOnly, rate limit compartido (Redis) y rotar credenciales.

---

## Revisión 1 — Seguridad base y correcciones

- **Hashing de contraseñas con bcrypt** y **autenticación JWT** (antes el backend no validaba identidad ni rol y las claves se guardaban en texto plano).
- Guardas de rol por endpoint (`get_current_user`, `require_roles`) y autorización fina: RRHH no crea admins, solo gestiona empleados; empleados solo ven lo suyo.
- Validación con `Literal` (roles, estados) → 422 automático; validación de rangos de fecha y de encargados de pedidos.
- `.env` corregido (keys de Supabase invertidas) + `.env.example`; CORS configurable.
- Frontend: manejo de token y cierre de sesión ante 401; bugs de renders en cascada y de `horas_trabajadas === 0` corregidos.
- Tests e2e sobre SQLite en memoria.

> Recomendación vigente: rotar la contraseña de la BD y las API keys que hayan estado en un `.env` compartido.
