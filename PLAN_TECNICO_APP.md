# Plan técnico de la aplicación — Portal MaestranzaTMG

> **Alcance de este documento:** solo la **aplicación**. Qué hay hoy, qué le falta técnicamente, y qué vamos a construir para corregir el rumbo.
> No trata informes, objetivos, marco teórico ni cronograma — eso se aborda por separado.
> Documentos relacionados: [README.md](README.md) · [DOCUMENTACION_PROYECTO.md](DOCUMENTACION_PROYECTO.md) · [CAMBIOS.md](CAMBIOS.md)

---

## 1. Estado actual de la app

### 1.1 Lo que está sólido

La base técnica está bien construida y no hay que tocarla:

- **Arquitectura por capas real** en el backend (`routers → services → models/db`), con la regla de dependencia respetada. Agregar un módulo no obliga a tocar los existentes.
- **Frontend modular por feature**, cada uno con su `api.ts` tipado y sin acoplamiento cruzado.
- **Seguridad seria**: bcrypt, JWT HS256 con expiración e `iss`, autorización por endpoint en el servidor, rate limit doble de login, cabeceras defensivas, CSP, RLS deny-by-default en Supabase, auditoría con actor de aplicación, cero SQL concatenado.
- **Cumplimiento Ley 21.719** implementado en código, no declarado en papel.
- **Migraciones SQL versionadas** (8 hasta ahora) y suite de pruebas que corre sin red.
- **Tres clientes sobre la misma API**: web (React 19 + Vite), móvil (Expo + expo-router) y escritorio (Electron). Esto es un activo que hoy está subutilizado.

### 1.2 El problema real

La app es **ancha pero plana**. Once módulos que, en el fondo, repiten el mismo patrón: formulario, tabla, control de rol. Es correcto, está bien hecho, pero técnicamente es la misma solución once veces.

Y hay dos debilidades concretas:

**a) El módulo IoT es un maniquí.** Revisando el código:

| Dónde | Qué pasa |
|---|---|
| `app/models/iot.py` | `IotMetrica` tiene 3 columnas de valor (`temperatura`, `humedad`, `consumo_kw`). No hay identidad de dispositivo, ni calidad de dato, ni unidad, ni frecuencia. |
| `app/services/iot_metricas.py` | `MAX_METRICAS = 30`. La app **borra su propia historia**. No existe serie de tiempo. |
| `app/routers/iot.py` | La ingesta es un `POST` manual protegido por rol admin. No hay dispositivo que pueda publicar. |
| `scripts/simulador_iot.py` | Los datos son `random.uniform()`. Ruido sin estructura física: no hay nada que analizar ni predecir. |
| `features/sensores/` | El dashboard muestra las últimas 20 filas. Es un visor, no un sistema de monitoreo. |

En resumen: hoy el módulo IoT **no monitorea nada, no decide nada y no recuerda nada**.

**b) Los módulos no se hablan entre sí.** Cada feature vive aislada. La app no tiene ningún flujo donde un evento en un módulo dispare una acción en otro. Es un conjunto de once herramientas, no un sistema.

---

## 2. Qué se busca según las guías — traducido a la app

Las guías de INACAP están escritas en lenguaje de gestión (BPMN, KPI, SLA, ITIL). Traducidas a **requisitos técnicos de la aplicación**, piden esto:

| Lo que pide la guía | Lo que significa para el código |
|---|---|
| "Topología de comunicación… protocolos de comunicaciones necesarios" | La app debe usar **más de un protocolo**. Hoy todo es HTTP/JSON. Un solo protocolo = un diagrama de tres cajas. |
| "Componentes de hardware que se requerirán" | Debe existir una **capa física** (dispositivo de campo), no solo software en un servidor. |
| "Las herramientas tecnológicas implementadas **se complementan adecuadamente entre sí**" (el ítem de mayor peso individual) | Debe existir **integración real entre módulos**: un evento en uno dispara trabajo en otro. |
| "KPI que permitan medir la eficiencia de la solución" | La app debe **emitir métricas de proceso**, no solo guardar datos. Un CRUD no tiene KPI propios. |
| "Gestión de disponibilidad y continuidad" | La app necesita **healthchecks, reconexión con backoff, buffer ante caída de red y degradación elegante**. Hoy si se cae algo, simplemente falla. |
| "Demuestra **innovación** que lo diferencia de otras soluciones existentes" | Necesita un componente que no sea CRUD. |
| "Plan de pruebas… unitarias, integrales, estrés" | Ya tienes tests; hay que **extenderlos a la capa nueva** y agregar prueba de carga. |
| "Diagrama de componentes con relaciones de dependencia" | Cuantos más componentes reales y desacoplados, más rico el diagrama. Hoy son dos: SPA y API. |

**Conclusión:** casi todo lo que falta apunta al mismo lugar. La app necesita dejar de ser una intranet CRUD y convertirse en un **sistema ciber-físico integrado**: que ingiera del mundo real, decida, y actúe sobre el proceso de negocio.

---

## 3. El rumbo

> De **intranet administrativa** a **sistema de gestión con monitoreo de planta y mantenimiento predictivo integrado**.

La idea rectora, en una frase: **la máquina avisa, el sistema decide, y el sistema genera trabajo real dentro de la app.**

El punto crítico —y lo que separa un proyecto bueno de uno mediocre— es el cierre del ciclo:

```
  Sensor / banco de pruebas
        │  MQTT/TLS
        ▼
  Broker  ──►  Consumidor  ──►  Serie de tiempo (TimescaleDB)
                                        │
                                        ▼
                              Motor de detección (features + modelo)
                                        │
                                   ¿anomalía?
                                        ▼
                              Alerta ──► valida un técnico
                                        │
                                        ▼
                    ORDEN DE TRABAJO en el módulo `pedidos` (ya existe)
                                        │
                                        ▼
                        asignación → ejecución → cierre
                                        │
                                        ▼
                    realimentación: ¿fue falso positivo? → ajusta umbral
```

Ese cierre es lo que hace que los once módulos dejen de ser once herramientas sueltas.

**Importante:** nada de lo anterior requiere tener los sensores comprados. Todo el flujo se construye contra un **contrato de mensajes**, y el productor de esos mensajes puede ser un banco de pruebas por software. Cuando llegue el ESP32, publica en el mismo topic y no se toca nada aguas abajo.

---

## 4. Qué vamos a construir (sin hardware)

### Bloque A — Fundaciones de datos

**A.1 · Contrato de telemetría (diseño, se congela primero)**

Es el paso que vuelve el hardware un reemplazo transparente. Se define y no se toca más:

```
Topic:   tmg/{planta}/{maquina_id}/telemetria
```

```jsonc
{
  "device_id": "esp32-torno-01",
  "maquina_id": 3,
  "ts": "2026-08-15T14:03:21.500Z",
  "fw": "1.0.0",
  "ventana_ms": 1000,
  "vibracion": {                 // features, no la señal cruda
    "rms": 0.42,
    "kurtosis": 3.11,
    "factor_cresta": 4.8,
    "picos": [[49.8, 0.31], [99.6, 0.08]]   // [Hz, amplitud]
  },
  "corriente_a": 12.4,
  "temperatura_c": 61.2,
  "calidad": "ok"                // ok | degradada | sensor_fallo
}
```

Decisión de diseño: **el dispositivo envía características, no la señal cruda**. Menos ancho de banda, menos almacenamiento, y es lo que permite después mover el modelo al borde.

**A.2 · Banco de pruebas por software** (reemplaza `scripts/simulador_iot.py`)

Fuera `random.uniform()`. Entra un generador con modelo físico:

- Señal base: frecuencia de giro de la máquina + armónicos + ruido gaussiano.
- **Modos de degradación inyectables por comando**:
  - *Desbalance* → crece la amplitud en 1× la frecuencia de giro.
  - *Rodamiento picado* → aparecen bandas laterales características.
  - *Sobrecarga* → sube la corriente y la temperatura con inercia térmica (no salto instantáneo).
  - *Falla de sensor* → valores congelados o fuera de rango, para probar `calidad`.
- Publica por MQTT respetando el contrato A.1.

Esto no es hacer trampa: es un **banco de pruebas**, y es como se valida un pipeline antes de tener planta. Además resuelve el problema que hoy no tiene solución — **te entrega datos etiquetados** para poder medir si el modelo acierta.

**A.3 · Migración a serie de tiempo**

- Eliminar `MAX_METRICAS = 30` y `podar_metricas()` en su forma actual.
- Nueva tabla como **hypertable de TimescaleDB** (extensión disponible en Supabase).
- Tabla `maquinas` y tabla `dispositivos` (hoy la máquina es un `Text` suelto, sin FK).
- **Retención escalonada** en vez de borrado: crudo por horas → agregados de 1 min → agregados de 1 h para histórico largo. Reemplaza el `DELETE` actual, que hoy tira la información a la basura.
- Nueva migración `009_series_tiempo_iot.sql`, siguiendo la convención ya establecida.

### Bloque B — Transporte y confiabilidad

**B.1 · Broker MQTT + consumidor**

Mosquitto con TLS, y un servicio consumidor en el backend que escribe a la hypertable. Esto agrega un **segundo protocolo** y un **componente desacoplado** al diagrama.

**B.2 · Autenticación por dispositivo**

Credencial única por dispositivo, con ACL que restringe cada uno a publicar solo en su propio topic. Corrige un hoyo real que existe hoy: la ingesta va protegida por rol admin, así que **cualquiera con ese token puede inyectar métricas falsas**.

**B.3 · Continuidad**

- Buffer local en el dispositivo y reconexión con backoff exponencial.
- Endpoint `/health` con estado de broker, base de datos y último dato recibido por máquina.
- Alerta de **silencio de sensor**: si un dispositivo deja de reportar, eso también es un evento — hoy la app no se enteraría.

Esto es exactamente lo que la guía llama "gestión de disponibilidad y continuidad", pero implementado en código.

### Bloque C — Detección

**C.1 · Pipeline de características**

Ventanas deslizantes → FFT → RMS, kurtosis, factor de cresta, energía por banda de frecuencia, tendencia térmica. Todo explicable: nada de caja negra.

**C.2 · Modelo con baseline explícito**

- **Baseline:** umbrales estadísticos + Isolation Forest.
- **Propuesta:** autoencoder LSTM sobre ventanas multivariadas.
- Se **reportan los dos comparados** (precisión, recall, falsos positivos por día, tiempo de anticipación). Tener baseline es lo que distingue ingeniería de "le puse IA".
- Entrenamiento offline; en producción solo inferencia. El artefacto del modelo se versiona.

**C.3 · Servicio de anomalías**

Nuevo `app/services/anomalias.py` + modelo `Anomalia` (máquina, tipo, severidad, score, ventana, estado). Estados: `detectada → validada → descartada → resuelta`.

### Bloque D — Integración (lo que más peso tiene)

**D.1 · Cierre del ciclo con `pedidos`**

Anomalía validada por un técnico → se crea automáticamente una **orden de trabajo de mantenimiento** en el módulo `pedidos` que ya existe, con la máquina, el diagnóstico y la evidencia adjunta. Se asigna, se ejecuta, se cierra.

**D.2 · Realimentación**

Al cerrar la orden, el técnico marca si la anomalía era real. Eso alimenta la métrica de falsos positivos y permite ajustar umbrales. El sistema aprende de su propia operación.

**D.3 · Tiempo real en la web**

WebSocket en vez del polling actual. El dashboard de `features/sensores` pasa de "últimas 20 filas" a monitoreo vivo con estado por máquina.

**D.4 · Notificación push al móvil**

Ya existe la app Expo con `src/api/sensores.ts`. Agregando `expo-notifications`, una anomalía crítica llega al teléfono del supervisor. Aprovecha un activo ya construido y es un momento fuerte para la demostración práctica.

**D.5 · KPIs del proceso**

Endpoint y vista con: MTBF, MTTR, % de paradas no programadas, tiempo de anticipación de la detección, tasa de falsos positivos, consumo energético por máquina.

### Bloque E — Calidad

- Tests unitarios del pipeline de características (FFT sobre señal sintética conocida → resultado esperado).
- Tests de integración del consumidor MQTT.
- **Prueba de carga**: N dispositivos simulados publicando en paralelo, para medir hasta dónde aguanta.
- Extender la suite existente, que ya corre sin red.

---

## 5. Qué NO vamos a hacer

Decisiones de alcance para no dispersar el esfuerzo:

- **No agregar un módulo 12.** Son tres personas. La profundidad y la integración valen más que la cantidad de módulos.
- **No reescribir lo que funciona.** Auth, usuarios, solicitudes, clientes, trabajos y facturas quedan como están.
- **No meter un chatbot.** Sería un envoltorio sobre una API ajena, sin aporte propio.
- **No transmitir señal cruda.** Solo características. Decisión de diseño defendible por ancho de banda y almacenamiento.
- **No prometer instalación física en máquinas reales** como entregable comprometido. Va como fase 2.

---

## 6. Orden de ejecución y dependencias

```
A.1 contrato ──► A.2 banco de pruebas ──► A.3 serie de tiempo
                                              │
                        ┌─────────────────────┴──────────────┐
                        ▼                                    ▼
                  B.1 broker ──► B.2 auth               C.1 features
                        │                                    │
                        └──────► B.3 continuidad             ▼
                                                        C.2 modelo
                                                             │
                                                             ▼
                                                       C.3 servicio
                                                             │
                                                             ▼
                                          D.1 cierre del ciclo con pedidos
                                                             │
                                        ┌────────────────────┼──────────┐
                                        ▼                    ▼          ▼
                                   D.3 WebSocket        D.4 push   D.5 KPIs
                                                             │
                                                             ▼
                                                        E. pruebas
```

**Si el tiempo aprieta**, el camino mínimo que igual deja un sistema demostrable e integrado es:

> **A.1 → A.2 → A.3 → C.1 → C.3 → D.1 → D.3**

Los bloques B (broker y continuidad) y C.2 (modelo comparado) suben el techo del proyecto, pero no son los que evitan el piso. D.1 es **innegociable**: sin el cierre del ciclo, todo lo demás queda como un gráfico decorativo.

---

## 7. Hardware: qué queda pendiente

Nada de lo anterior se bloquea por no tener sensores. Cuando se compren, el trabajo pendiente es acotado:

1. Firmware del ESP32: leer sensores, calcular FFT y características a bordo, publicar por MQTT respetando el contrato A.1.
2. Reemplazar el banco de pruebas por el dispositivo real — **mismo topic, mismo payload, cero cambios aguas abajo**.
3. Reentrenar el modelo con datos reales, usando el modelo del banco de pruebas como punto de partida.
4. Campaña de validación en planta.

Nota sobre la elección: **ESP32, no Arduino Uno.** El Uno son 16 MHz y 2 KB de RAM, sin WiFi — no alcanza para FFT ni para MQTT. El ESP32 es doble núcleo a 240 MHz con WiFi integrado, y deja espacio para más adelante mover la inferencia al propio dispositivo.

---

*Documento de planificación técnica. Refleja el estado del repositorio al momento de su redacción.*
