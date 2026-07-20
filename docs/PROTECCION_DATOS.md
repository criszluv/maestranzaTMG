# Protección de Datos Personales — Portal MaestranzaTMG

Documento de cumplimiento de la **Ley 21.719** (protección de datos personales, vigencia 1 de diciembre de 2026). Sirve como base del registro de actividades de tratamiento y del procedimiento de gestión de brechas. Responsable del tratamiento: **Maestranza TMG** (contacto: rrhh@maestranzatmg.cl, configurable en `backend/.env`).

## 1. Registro de actividades de tratamiento

| Dato | Finalidad | Base de licitud | Plazo de conservación | Dónde vive |
|---|---|---|---|---|
| Nombre y correo (cuenta) | Autenticación y control de acceso | Relación laboral / interés legítimo | Mientras dure la relación; luego **anonimización** | `public.users` (Supabase) |
| Solicitudes de días libres | Gestión de RRHH | Obligaciones laborales | **5 años** desde `fecha_fin` (criterio DT) | `public.rrhh_solicitudes` |
| Documento adjunto de solicitud (foto-documento, opcional) | Respaldo de la solicitud (p. ej. certificado) | Obligaciones laborales | Ligado a la solicitud: **5 años** | Bucket privado `pedidos-fotos` (prefijo `solicitud_{id}/`) + columnas `adjunto_*` en `public.rrhh_solicitudes` |
| Pedidos asignados | Operación y trazabilidad comercial | Obligaciones tributarias | **6 años** pedidos terminados (art. 17 C. Tributario) | `public.pedido` |
| Marcaje entrada/salida | Control de jornada legal | Obligación legal (C. del Trabajo) | 5 años — **administrado por Workera** (encargado externo); este portal solo consulta | API Workera |
| Fotos de avance de pedidos | Evidencia del progreso del trabajo | Relación laboral / interés legítimo | Ligada al pedido: **6 años** (el "borrar" del usuario es lógico; el archivo queda resguardado hasta la depuración) | Bucket privado `pedidos-fotos` + `public.pedido_fotos` |
| Contactos de clientes (nombre, teléfono, email de personas) | Coordinación comercial y cobros | Ejecución de contrato / interés legítimo | Mientras dure la relación comercial (caen con el cliente) | `public.clientes` + `public.cliente_contactos` |
| Trabajos realizados a clientes (valor, detalle) | Registro comercial / trazabilidad | Obligaciones tributarias | **6 años** desde la fecha (art. 17 C. Tributario); depuración automática | `public.trabajos` |
| Facturas por cobrar (cliente, monto, estado de pago) | Cobranza / registro comercial | Obligaciones tributarias | Pagadas: **6 años** desde el pago (depuración automática); pendientes: mientras dure la cobranza | `public.facturas` |
| Auditoría de cambios | Responsabilidad / seguridad | Interés legítimo | 3 años | `public.auditoria_datos` |

La depuración al vencer los plazos es **automática**: `fn_depurar_retencion()` corre por `pg_cron` el día 1 de cada mes (migraciones `001`/`002` en `backend/db/migrations/`).

## 2. Derechos del titular y cómo se ejercen en el sistema

En prosa: el derecho de **acceso y portabilidad** está automatizado — cada trabajador descarga sus datos en JSON estructurado desde la sección *Privacidad* del portal (`GET /api/privacidad/mis-datos`; la identidad sale del JWT, nunca de la URL). La **transparencia** también: la política completa se sirve en `GET /api/privacidad/politica` y se muestra en la misma sección. La **rectificación** la gestiona RRHH desde el módulo de usuarios (queda auditada con el actor real). La **supresión** se implementa como **anonimización irreversible** (`POST /api/rrhh/usuarios/{id}/anonimizar`, solo administradores): reemplaza nombre y correo por seudónimos, invalida la contraseña y desactiva la cuenta, conservando disociados los registros que la ley obliga a retener. La **oposición** y consultas restantes se canalizan con el responsable indicado arriba.

## 3. Medidas de seguridad (técnicas y organizativas)

Aplicación: contraseñas con bcrypt y **política de fortaleza** obligatoria al crear/cambiar (mínimo 8 caracteres, ≥3 clases de carácter, sin secuencias/repeticiones triviales, sin contraseñas comunes ni corporativas de la blocklist, y que no contengan el correo del titular — `app/core/passwords.py`, replicada en el frontend para feedback inmediato); JWT firmado con expiración, emisor (`iss`) validado y control de rol por endpoint; **rate limit de login doble**: por (IP+correo) contra fuerza bruta a una cuenta (5 intentos/5 min) y por IP contra *password spraying* (20 intentos/5 min); validación estricta de entrada con Pydantic (tipos `Literal`, largos **máximos** en todo texto libre, patrones — el parámetro que viaja a Workera solo admite `[A-Za-z0-9,]` — y rechazo de `inf/nan` en métricas); todo el SQL pasa por el ORM con parámetros ligados (**cero SQL concatenado**, verificado con auditoría de código y SAST bandit); **saneamiento anti-inyección de fórmulas (CSV injection, CWE-1236)** en la exportación de reportería; límite de tamaño de payload (413 sobre 1 MB); manejador global de errores que **no filtra trazas** al cliente; `TrustedHostMiddleware`; headers defensivos (nosniff, X-Frame-Options DENY, Referrer-Policy, **HSTS**, **Permissions-Policy**, **Cross-Origin-Opener-Policy**, CSP `default-src 'none'` en `/api`, Cache-Control no-store); CORS con orígenes/métodos/headers explícitos; logs de seguridad con correos **enmascarados** (minimización).

Base de datos: RLS deny-by-default en todas las tablas, roles públicos sin ningún privilegio, funciones sin EXECUTE público y con `search_path` fijo, **auditoría de `users`, `rrhh_solicitudes`, `pedido`, `clientes`, `cliente_contactos`, `cliente_entidades`, `trabajos` y `facturas`** (INSERT/UPDATE/DELETE) sin contraseñas y con **actor de aplicación** (`auditoria_datos.actor_app`, fijado por el backend), consultable por RRHH/Admin en *Registro de cambios* (`GET /api/auditoria`); constraints de dominio, retención automática.

Frontend: React con escape por defecto (sin `dangerouslySetInnerHTML`), CSP parcial en `index.html` (`object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-src 'none'`). Al desplegar a producción, fijar en el reverse proxy la CSP completa: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://API-DEL-BACKEND; frame-ancestors 'none'`.

Deuda aceptada y documentada (entorno intranet local): JWT en `localStorage` y rate limit en memoria de un proceso; si el sistema se expone a internet, migrar a cookies httpOnly + almacenamiento compartido (Redis) y servir todo tras TLS.

## 4. Procedimiento ante violaciones de seguridad (brechas)

La Ley 21.719 exige notificar a la **Agencia de Protección de Datos Personales** y, cuando el riesgo lo amerite, a los afectados. Procedimiento interno: (1) **Detectar y contener** — revisar logs de seguridad del backend (eventos `SEGURIDAD`) y `auditoria_datos`; revocar credenciales comprometidas (SECRET_KEY, contraseña de BD, API keys de Supabase/Workera) y desactivar cuentas afectadas. (2) **Evaluar** — qué datos, cuántos titulares, riesgo para las personas; dejar registro escrito con fechas y evidencia. (3) **Notificar** — a la Agencia dentro de las **72 horas** siguientes a tomar conocimiento cuando exista riesgo para los derechos de los titulares, y a los afectados sin dilación si el riesgo es alto. (4) **Remediar y aprender** — parchar la causa raíz, actualizar este documento y los tests.

## 5. Encargados de tratamiento (terceros)

Supabase (hosting de la base de datos y del almacenamiento de fotos, región us-west-2) y Workera/Qwantec (control de asistencia) tratan datos por cuenta de Maestranza TMG. Mantener con ambos los resguardos contractuales de confidencialidad y seguridad que exige la Ley 21.719 para encargados, y limitar las credenciales de integración a lo mínimo (la API key de Workera es de solo lectura de marcaje y vive únicamente en `backend/.env`).
