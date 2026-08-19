# Handoff — Portal MaestranzaTMG

> Estado del proyecto al cierre de esta sesión de trabajo.
> Commit de referencia: **`54357bc`** en `main` · repo `criszluv/maestranzaTMG`.
> Documentos relacionados: [README.md](README.md) · [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) · [PLAN_TECNICO_APP.md](PLAN_TECNICO_APP.md)

---

## 1. Objetivo

**Objetivo del producto.** Portal interno para Maestranza TMG que reemplaza el
manejo en planillas de las áreas de personas (solicitudes, asistencia,
usuarios) y de operación comercial (clientes, pedidos, trabajos realizados,
pagos pendientes), con el cumplimiento de la Ley 21.719 implementado en código.

**Objetivo académico (Proyecto de Título, TIHI84).** Las rúbricas dan más peso
a dos cosas que un CRUD no entrega por sí solo:

| Ítem de la rúbrica | Peso | Entrega |
|---|---|---|
| Las herramientas implementadas **se complementan entre sí** | 20 | ES3 (25 %) |
| Los **procesos de negocio** entregan una solución sustentable | 20 | ES3 (25 %) |
| Demuestra **innovación** frente a otras soluciones | 15 | ES3 (25 %) |
| Diagramas de arquitectura e infraestructura | 15 | ES4 (35 %) |
| Factibilidad técnica, económica, legal y ambiental | 15 | ES4 (35 %) |
| Responder preguntas con argumentos sólidos | 15 | ES4 (35 %) |

**Conclusión que guía el trabajo técnico:** el proyecto debe pasar de once
módulos aislados a un **sistema donde un evento de planta genera trabajo real
dentro de la app**. Cerrar ese ciclo (anomalía → orden de trabajo → ejecución →
realimentación) es lo que apunta a los dos ítems de 20 puntos.

**Restricción de formato que condiciona el diseño:** la demo son **8 minutos**
y la defensa **12**. Lo que no se pueda mostrar o explicar en ese tiempo rinde
poco, por más ingeniería que tenga detrás.

---

## 2. Estado actual

### Qué está desplegado y funcionando

| Pieza | Dónde | Estado |
|---|---|---|
| Backend FastAPI 0.124 | Render (plan gratuito) | ✅ `maestranza-backend-14e1.onrender.com` |
| Frontend React 19 + Vite 7 | Vercel | ✅ `maestranza-tmg.vercel.app` |
| Base de datos + Storage | Supabase (`mgulybixftokpgjezuzc`) | ✅ 10 migraciones aplicadas |
| App móvil Expo SDK 57 / RN 0.86 | APK vía EAS | ⚠️ instalado, pero **desactualizado** |
| Cliente de escritorio Electron | `ejecutable/` | ✅ apunta a la URL de Vercel |

- **Tests:** 196/196 checks OK (`backend/tests/test_api.py`, corre sin red).
- **Typecheck:** limpio en web y móvil.
- **Despliegue continuo:** Render y Vercel redespliegan solos con cada push a
  `main`. **Las migraciones NO se aplican solas** (ver §4 y §7).

### Datos reales en producción

113 clientes · 233 facturas pendientes · 56 trabajos · 4 máquinas · 7 lecturas
de telemetría histórica.

### Roles

| | Panel de planta | Máquinas | Personas | Operación comercial |
|---|---|---|---|---|
| **admin** | ✅ | ✅ ver y editar | ✅ | ✅ |
| **empleado** | ✅ | ✅ solo ver | sus solicitudes y pedidos | — |
| **rrhh** | ❌ | ❌ | ✅ | ✅ |

RRHH aterriza en *Solicitudes*; el resto en *Panel de planta*. La autorización
está en el backend (`require_roles`), no solo en el menú.

---

## 3. Cambios realizados en esta sesión

### 3.1 Clientes nuevos sobre la misma API
- **App móvil** (`movil/`): React Native + Expo, paridad completa con la web en
  los 12 módulos. El JWT vive en `expo-secure-store`, no en localStorage.
- **Cliente de escritorio** (`ejecutable/`): Electron endurecido que carga el
  portal hospedado — sandbox, sin acceso a Node, navegación restringida al
  dominio, permisos denegados, instancia única y página offline con reintento.
  Genera instalador NSIS y versión portable.

### 3.2 Ciclo de vida del pedido (migración 009)

1. RRHH crea el pedido y le asigna **cliente** (de la cartera o uno nuevo
   creado en el momento) y **encargado**.
2. El encargado avanza a *terminado* y sube fotos de avance.
3. RRHH lo **cierra**: `pagado` → Trabajos realizados; `pendiente` → Pagos
   pendientes.

Se cierra una sola vez (bloqueo `FOR UPDATE` dentro de una transacción única) y
queda congelado para no contradecir al registro comercial que originó. Además
se puede **corregir el cobro** en ambos sentidos
(`/trabajos/{id}/a-pendiente` y `/facturas/{id}/a-trabajo`): el registro se
mueve sin duplicarse y el pedido de origen se resincroniza.

### 3.3 Fundación del monitoreo de planta (migración 010)

| Defecto corregido | Corrección |
|---|---|
| La máquina era un `text` suelto: nada podía relacionarse con ella | Tabla `maquinas` con `rpm_nominal` |
| No existía el dispositivo; la ingesta iba solo por rol admin | Tabla `dispositivos` con `ultima_telemetria` |
| `MAX_METRICAS = 30`: **la app borraba su historia en cada inserción** | Retención por antigüedad (90 días), en una sola política |

Se suman la tabla `anomalias` (ciclo `detectada → validada → resuelta`, con
realimentación `era_real` para medir falsos positivos) y `pedido.tipo`
(`comercial` | `mantenimiento`): una orden de mantenimiento apunta a una
máquina, no se factura y cierra como `interno`. Sin eso, las órdenes que genere
el detector serían imposibles de cerrar.

`iot_metricas` adopta el **contrato de telemetría** (RMS, kurtosis, factor de
cresta, picos del espectro, corriente, calidad del dato). Se transmiten
características, no señal cruda: cuando llegue el ESP32 publica lo mismo y no
se toca nada aguas abajo.

### 3.4 Módulo de Máquinas
Pantalla para mantener el inventario y, sobre todo, las **RPM nominales**
(definen dónde caen 1× y sus armónicos en el espectro). Destaca en rojo las
máquinas sin ese dato. Sin DELETE a propósito: se dan de baja.

### 3.5 Correcciones de comportamiento
- **Errores de validación invisibles.** FastAPI devuelve `detail` como *lista*
  en los 422; el cliente solo leía el caso texto y mostraba "Error en la
  petición". Ahora se ve el mensaje real (*"RUT inválido: el dígito verificador
  no corresponde"*).
- **"Pagado" ambiguo.** Había dos acciones con el mismo significado para el
  usuario y efectos distintos; una dejaba la factura en un limbo invisible.
  Unificado: *Marcar pagada* mueve la factura a Trabajos realizados.
- **Fotos de 50 MB.** El bucket no era el cuello de botella: el backend topaba
  en 5 MB. Alineado a 50 MB y, en móvil, las fotos se reescalan a 1920 px y se
  recomprimen antes de subir.
- **Adjuntos de solicitudes limitados a 1 MB** pese a declarar 5 MB: el
  middleware de tamaño solo exceptuaba `/fotos`.
- **Sesión.** El login redirige si ya hay sesión, y se cierra sola tras 30 min
  de inactividad (pensado para los equipos compartidos del taller).
- **Solicitudes de RRHH paginadas** de a 5, con filtro por estado.

### 3.6 Despliegue
Guía completa en [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md), con los errores
reales que fueron apareciendo: Root Directory en Render, `PYTHON_VERSION`,
`ALLOWED_HOSTS` (400) y `CORS_ORIGINS` (bloqueo del navegador).

---

## 4. Intentos fallidos, bloqueos y deuda pendiente

### 4.1 TimescaleDB no está disponible — bloqueante para el plan original
`PLAN_TECNICO_APP.md` apoya toda la capa de serie de tiempo en una *hypertable*
de TimescaleDB, "extensión disponible en Supabase". **Se verificó contra el
proyecto real: `timescaledb` no aparece siquiera como instalable.** Supabase la
descontinuó.

**Alternativa (aún no implementada):** particionado declarativo nativo de
PostgreSQL + vistas materializadas refrescadas con **`pg_cron`**, que sí está
instalado en el proyecto. Cubre el objetivo y, para el informe, implementar la
lógica de rollup propia demuestra más que activar una extensión que lo hace
sola.

### 4.2 Render gratuito duerme — decisión pendiente del equipo
El plan gratuito suspende el servicio tras ~15 min sin uso (medido: 32 s para
despertar). Un consumidor MQTT dormido pierde mensajes y un WebSocket se corta.
Esto condiciona el Bloque B del plan técnico. Opciones: plan de pago
(~US$7/mes) o diseñar la detección por consulta periódica en vez de streaming.

### 4.3 El autoencoder LSTM no cabe en el servidor
TensorFlow supera la memoria del plan gratuito (512 MB) incluso solo para
inferencia. Salidas: exportar a **ONNX** y usar `onnxruntime`, o dejar
**Isolation Forest** en producción y presentar la comparación con el LSTM como
análisis offline — igualmente válido para el ítem de innovación, y más fácil de
defender.

### 4.4 Las RPM actuales son inventadas
Las 4 máquinas se sembraron con valores de relleno (Torno 1500, Fresadora 1200,
Plasma CNC 1800, Prensa 900). **Con valores inventados, el diagnóstico de
vibración no es defendible en la presentación.** Hay que confirmarlos en
planta; la pantalla de Máquinas existe justamente para cargarlos.

### 4.5 El APK instalado está desactualizado
Los cambios de rol (Panel de planta y Máquinas fuera de RRHH) y la pantalla de
Máquinas **no están en el APK instalado**: cualquier cambio móvil exige
recompilar (~20 min en EAS, más el tiempo de cola). Se agrupan con el próximo
build.

### 4.6 Problemas resueltos que conviene recordar
- **"Project is incompatible with this version of Expo Go"**: Expo Go solo
  soporta el SDK más reciente publicado. Se resolvió generando APK propio, que
  además es lo que se va a distribuir.
- **"Unsupported FormDataPart implementation"** al subir fotos desde Android:
  desde el SDK 54, Expo reemplaza el `fetch` global y su `FormData` ya no
  acepta el patrón clásico `{ uri, name, type }` de React Native. Se migró a
  `File.upload()` de `expo-file-system` (multipart nativo, en streaming).
- **Esa subida nativa no se pudo verificar desde el entorno de desarrollo:** se
  validó el contrato contra el código del paquete y el typecheck, pero solo se
  confirma en un teléfono real con el APK instalado.

### 4.7 Deuda menor
- El repositorio incluye las 6 guías `.docx` (**20 MB**). Se pueden sacar.
- El commit `c6ef4d8` registró el borrado de `Informe_PrototipoTMG.docx` y
  `Propuesta_Comercial_MaestranzaTMG.docx`. Ya no estaban en disco y `git add -A`
  registró la ausencia. **Son recuperables desde el historial.**
- El instalador `.exe` no está firmado: Windows SmartScreen mostrará el aviso de
  "aplicación no reconocida". Requiere un certificado OV/EV.
- `scripts/simulador_iot.py` sigue generando ruido con `random.uniform()`: sirve
  para poblar el dashboard, **no** para validar detección (no entrega
  etiquetas).

---

## 5. Lo que viene

### Paso 2 · Banco de pruebas con modelo físico
Reemplazar `random.uniform()` por un generador con señal base (frecuencia de
giro + armónicos + ruido) y **modos de degradación inyectables**: desbalance,
rodamiento picado, sobrecarga con inercia térmica y falla de sensor. Publica
respetando el contrato de telemetría.

*Por qué importa:* entrega **datos etiquetados**. Sin ellos no se puede
demostrar que el detector acierta, y esa es la pregunta que va a aparecer en la
defensa.

### Paso 3 · Detección y cierre del ciclo — el de mayor peso
Pipeline de características (ventanas, FFT, RMS, kurtosis, tendencia térmica),
servicio de anomalías con umbrales estadísticos + Isolation Forest, y la pieza
clave: **anomalía validada → orden de trabajo de mantenimiento** en el módulo
de pedidos, que se asigna, se ejecuta y se cierra con realimentación.

La infraestructura de datos para esto **ya está lista** (tablas `anomalias`,
`maquinas`, `dispositivos`, `pedido.tipo` y el cierre `interno`).

### Paso 4 · Visualización y aviso
Dashboard de planta en vivo (WebSocket en vez del polling actual) y
notificación push al móvil ante una anomalía crítica. Ambos rinden mucho en una
demo de 8 minutos.

### Paso 5 · KPIs y pruebas
MTBF, MTTR, % de paradas no programadas, tiempo de anticipación de la detección
y tasa de falsos positivos. Tests del pipeline de características (FFT sobre
señal sintética conocida) y prueba de carga — a correr en local: contra el plan
gratuito se mediría el hosting, no la app.

---

## 6. Qué necesita el equipo (no depende del código)

1. **RPM reales de las 4 máquinas** y confirmar si son esas las que se van a
   monitorear. Es lo más urgente: condiciona la credibilidad del Paso 3.
2. **Decidir si Render pasa a plan de pago.** Define el diseño de los Pasos 3
   y 4 (streaming vs. consulta periódica).
3. **Datos de la empresa para KPI y SLA** (16 puntos en ES2): paradas no
   programadas al mes, duración típica de una reparación, costo de una hora de
   máquina detenida.
4. **Tres procesos de negocio para el BPMN** (8 puntos en ES2, 10 en ES4). El
   ciclo detección → validación → orden → cierre sirve como uno de ellos.
5. **Evaluación económica, legal y ambiental** (~30 puntos entre ES3 y ES4).
   Ningún código la resuelve: hay que redactarla.

---

## 7. Cómo retomar

```bash
# Backend (desde la raíz del repo)
backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --reload --port 8000
backend/.venv/Scripts/python.exe backend/tests/test_api.py    # 196/196

# Frontend
npm --prefix frontend run dev        # http://localhost:5173

# Móvil (necesita APK propio; Expo Go no sirve con SDK 57)
npm --prefix movil start

# Escritorio
npm --prefix ejecutable start
```

**Antes de tocar la base de datos:** las migraciones viven en
`backend/db/migrations/` y se aplican **a mano** en Supabase. La próxima es la
`011`. Si se sube código que espera columnas nuevas sin aplicar la migración,
el backend falla en producción.

**Antes de compilar el APK:** EAS compila desde el estado *commiteado* de git;
hay que hacer `git commit` antes de lanzar el build.

**Credenciales demo:** ver [README.md](README.md). Cambiarlas antes de un uso
real.
