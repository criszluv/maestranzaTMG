# Guía de despliegue — Portal MaestranzaTMG

Cómo publicar el sistema en la nube para uso real. Arquitectura de despliegue:

| Pieza | Plataforma | Notas |
|---|---|---|
| Base de datos + almacenamiento de fotos | **Supabase** | Ya está en la nube; no se toca |
| Backend (FastAPI) | **Render** | Servidor que corre siempre |
| Frontend (React + Vite) | **Vercel** | Web estática (SPA) |
| App de escritorio (`.exe`) | Apunta a la URL de Vercel | Ver `ejecutable/README.md` |
| App móvil (`.apk`) | Apunta a la URL del backend | Ver `movil/README.md` |

> **Por qué el backend NO va en Vercel:** Vercel ejecuta *funciones* efímeras
> (arrancan y mueren por petición). El backend es un servidor de larga vida con
> pool de conexiones a Postgres, integración con Workera y subida de archivos:
> necesita una plataforma de *servidor* (Render, Railway, Fly, un VPS…).

El orden importa: cada servicio necesita la URL del otro. Sigue las partes en orden.

---

## Parte 1 — Backend en Render

1. [render.com](https://render.com) → cuenta con GitHub → **New +** → **Web Service**.
2. Elige el repo `criszluv/maestranzaTMG` y configura:
   - **Root Directory**: `backend`  ← imprescindible (el backend vive en esa subcarpeta)
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: Free
3. **Environment Variables** (copia los valores de tu `backend/.env` local, que ya
   funciona; genera un `SECRET_KEY` nuevo para producción):

   | Variable | Valor |
   |---|---|
   | `PYTHON_VERSION` | `3.12.7` (evita fallos con el Python 3.14 por defecto de Render) |
   | `DATABASE_URL` | El de tu `.env` (conexión a Supabase) |
   | `SECRET_KEY` | Nuevo: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
   | `CORS_ORIGINS` | La URL de Vercel (se completa en la Parte 3) |
   | `ALLOWED_HOSTS` | El dominio de Render, ej. `maestranza-backend-14e1.onrender.com` |
   | `SUPABASE_URL` | El de tu `.env` |
   | `SUPABASE_SERVICE_ROLE_KEY` | El de tu `.env` |
   | `WORKERA_API_USER` | El de tu `.env` |
   | `WORKERA_API_KEY` | El de tu `.env` |
   | `AUTO_CREATE_TABLES` | `false` |

4. **Create Web Service**. Al terminar, copia la URL pública
   (ej. `https://maestranza-backend-14e1.onrender.com`).
5. Verifica: abre esa URL con `/docs` al final → debe mostrar la API. El
   healthcheck raíz `/` responde un JSON de estado.

### Errores típicos en Render (ya resueltos con lo de arriba)

| Síntoma | Causa | Solución |
|---|---|---|
| `Could not open requirements file` | Root Directory sin poner | Root Directory = `backend` |
| Falla al instalar `psycopg2` / `pydantic` | Render usa Python 3.14 por defecto | Variable `PYTHON_VERSION=3.12.7` |
| Login responde **400** | `ALLOWED_HOSTS` no incluye el dominio de Render | Añade `ALLOWED_HOSTS=<dominio>.onrender.com` |
| Login responde **CORS blocked** | `CORS_ORIGINS` no incluye la URL de Vercel | Ver Parte 3 |

> **Plan gratis:** el servicio se "duerme" tras ~15 min sin uso y **despierta
> solo** en la siguiente petición (esa primera tarda ~30–60 s). No hay que
> arrancarlo a mano. Para evitar la espera: plan de pago (~US$7/mes) o un
> pinger externo (UptimeRobot) al healthcheck.

---

## Parte 2 — Frontend en Vercel

1. [vercel.com](https://vercel.com) → cuenta con GitHub → **Add New… → Project**
   → importa `criszluv/maestranzaTMG`.
2. Configura:
   - **Root Directory**: `frontend`  ← imprescindible (monorepo)
   - **Framework Preset**: Vite (autodetectado)
3. **Environment Variables**:
   - `VITE_API_URL` = la URL de Render de la Parte 1 (sin `/api` al final; el
     código lo agrega solo). Ej: `https://maestranza-backend-14e1.onrender.com`
4. **Deploy**. Copia la URL resultante (ej. `https://maestranza-tmg.vercel.app`).

El archivo `frontend/vercel.json` ya incluye la reescritura SPA (para que
refrescar rutas como `/dashboard` no dé 404) y cabeceras de seguridad.

---

## Parte 3 — Conectar los cabos

Ya con ambas URLs, autoriza el frontend en el backend:

1. Render → tu servicio → **Environment**.
2. `CORS_ORIGINS` = la URL de Vercel, **sin barra final**:
   `https://maestranza-tmg.vercel.app`
3. `ALLOWED_HOSTS` = el dominio de Render (si no lo pusiste ya):
   `maestranza-backend-14e1.onrender.com`
4. **Save** → Render reinicia solo.
5. Abre la web de Vercel e inicia sesión con una cuenta real. Si entra, todo
   quedó conectado. ✅

> Usa siempre la **URL de producción** de Vercel (`maestranza-tmg.vercel.app`).
> Las URLs temporales de cada despliegue (`...-git-main-....vercel.app`) no
> están en `CORS_ORIGINS` y darían error; si las necesitas, agrégalas por coma.

---

## Parte 4 — Apps cliente

- **Escritorio (.exe):** pon la URL de Vercel en `ejecutable/app-config.json`
  y ejecuta `npm run dist` (ver `ejecutable/README.md`). Como el `.exe` solo
  carga la web, cada redepliegue en Vercel llega solo, sin reinstalar.
- **Móvil (.apk):** define `EXPO_PUBLIC_API_URL` con la URL del backend de
  Render y compila con EAS (ver `movil/README.md`).

---

## Actualizaciones

Ambas plataformas están conectadas a GitHub: **cada `git push` a `main`
redespliega automáticamente** el backend (Render) y el frontend (Vercel). No
hay pasos manuales para publicar cambios.
