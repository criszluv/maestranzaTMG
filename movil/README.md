# MaestranzaTMG — App móvil

Cliente móvil del Portal MaestranzaTMG, construido con **React Native + Expo
(SDK 57) + TypeScript + expo-router**. Consume la misma API FastAPI que el
frontend web (`/api`, JWT Bearer, roles verificados en el backend), por lo que
web y móvil ven siempre los mismos datos.

## Módulos incluidos (paridad con la web)

| Módulo | empleado | rrhh / admin |
|---|---|---|
| Panel de planta (sensores IoT) | ✔ (lectura + export CSV) | ✔ |
| Solicitudes de días libres | ✔ crear + historial + adjunto | ✔ gestión (aprobar/rechazar) + "Mis días libres" |
| Saldos de vacaciones | saldo propio | ✔ todo el equipo |
| Pedidos (órdenes de trabajo) | ✔ mis pedidos + estado + **fotos con cámara** | ✔ CRUD completo + encargado |
| Asistencia (Workera) | — | ✔ historial + reporte mensual |
| Usuarios | — | ✔ CRUD + habilitar/deshabilitar |
| Clientes | — | ✔ CRUD + contactos + entidades (RUT validado) |
| Trabajos | — | ✔ CRUD (eliminar: solo admin) |
| Pagos pendientes (facturas) | — | ✔ CRUD + pagar/reabrir (eliminar: solo admin) |
| Auditoría (Ley 21.719) | — | ✔ visor con antes/después |
| Privacidad (Ley 21.719) | ✔ política + descargar mis datos | ✔ |

Seguridad: el JWT se guarda en **expo-secure-store** (Keystore/Keychain
cifrado, no localStorage). El control de acceso real siempre lo hace el
backend (`require_roles`); las pantallas solo ocultan lo que el rol no puede
usar. Un 401 cierra la sesión automáticamente.

## Estructura

```
movil/
  src/app/            Rutas (expo-router): login, (tabs), módulos del stack
  src/api/            APIs por módulo (tipos 1:1 con frontend/src/features/*/api.ts)
  src/auth/           AuthContext + guard de roles (Protegido)
  src/components/     Kit UI (Card, Boton, Badge, Selector, CampoFecha, Toast, Confirm…)
  src/features/       Vistas compartidas entre rutas (solicitudes, pedidos)
  src/services/       http (JWT + multipart), storage, fechas, rut, passwordPolicy, files
  src/theme/          Design tokens (espejo de frontend/src/styles/index.css)
```

## Correr en desarrollo

Requisitos: Node 20+, el backend corriendo (`uvicorn` en el puerto 8000) y,
para probar en un teléfono, la app **Expo Go** (Android/iOS) instalada y el
teléfono en la **misma red Wi-Fi** que el PC.

```bash
cd movil
npm install
npm start          # abre el menú de Expo; escanea el QR con Expo Go
```

> **"Project is incompatible with this version of Expo Go"**
> Expo Go es una app genérica de la tienda: solo trae el runtime del SDK
> más reciente que Expo publicó. Si la versión instalada en el teléfono es
> anterior al SDK del proyecto (57), da ese error. Soluciones:
> 1. Actualizar Expo Go desde Play Store / App Store, o
> 2. **Dejar de depender de Expo Go**: `eas build -p android --profile
>    development` genera un *development build* propio (ver más abajo) que
>    reemplaza a Expo Go y no caduca con cada SDK.
>
> Mantén los paquetes alineados al SDK con `npx expo install --check`
> (o `--fix` para aplicarlo): versiones desalineadas causan fallos raros
> en el dispositivo.

**URL del backend** — se resuelve en este orden (ver `src/services/http.ts`):

1. Variable `EXPO_PUBLIC_API_URL` (p. ej. en un archivo `.env`):
   `EXPO_PUBLIC_API_URL=http://192.168.1.50:8000`
2. En desarrollo con Expo Go: se infiere automáticamente la IP del PC que
   sirve el bundle y se usa el puerto 8000 (no necesitas configurar nada si
   backend y Metro corren en la misma máquina).
3. Fallback: `http://127.0.0.1:8000` (modo web en el mismo equipo).

> El backend debe escuchar en la red local para que el teléfono lo alcance:
> `uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000`

### Modo web (para desarrollo rápido)

```bash
npm run web        # http://localhost:8081
```

Para el modo web hace falta que `CORS_ORIGINS` del `backend/.env` incluya
`http://localhost:8081` (ya agregado). Las apps nativas no usan CORS.

### Typecheck

```bash
npm run typecheck
```

## Generar el APK (Android) / build iOS

La vía es **EAS Build** (`eas.json` ya está configurado en el repo):

```bash
npx eas-cli login                                  # cuenta de expo.dev
npx eas-cli build -p android --profile preview     # APK autónomo (el que se reparte)
npx eas-cli build -p android --profile development # dev build (reemplaza Expo Go)
npx eas-cli build:list --platform android --limit 1 --json --non-interactive  # ver estado
```

- **`preview`** produce un **APK autónomo**: se instala y funciona solo, sin
  PC ni Expo Go. Es el que se entrega a los trabajadores.
  **`development`** produce un dev build con recarga en caliente (necesita
  `npm start` corriendo). **`production`** genera un AAB para Play Store.
- **La URL del backend ya viene fija en `eas.json`** (`env.EXPO_PUBLIC_API_URL`
  en los perfiles `preview` y `production`). Un APK instalado no puede
  inferir la IP del PC como en desarrollo, así que ese valor es obligatorio:
  si cambias de hosting, edítalo ahí y vuelve a compilar.
- **EAS compila desde el estado commiteado de git**: haz `git commit` de
  cualquier cambio (incluido `eas.json`) *antes* de lanzar el build, o se
  compilará la versión anterior.
- En el plan gratuito el build puede quedar **en cola bastante rato** antes
  de empezar; la compilación en sí toma 10-20 min.
- El APK se firma con un keystore que EAS genera y guarda en tu cuenta.
  **Consérvalo** (`npx eas-cli credentials`): sin él, Android no reconocerá
  futuras versiones como la misma app.
- `android.usesCleartextTraffic` está en `true` para permitir `http://` en
  pruebas dentro de la red local; **desactívalo cuando el backend tenga
  HTTPS** en producción.
- Para iOS: `eas build -p ios` (requiere cuenta Apple Developer).

Alternativa 100 % local (requiere Android Studio + SDK):

```bash
npx expo run:android --variant release
```

## Cuentas demo

Las mismas del portal web (ver README raíz): `admin@maestranzatmg.cl`,
`rrhh@maestranzatmg.cl`, `empleado@maestranzatmg.cl` (cambiar en producción).

## Notas de diseño

- Tokens de color/tipografía portados de `frontend/src/styles/index.css`
  (filosofía ISA-101: base neutra, el color comunica estado; rojo solo
  crítico/marca).
- Navegación: 4 pestañas (Inicio · Solicitudes · Pedidos · Menú). Solicitudes
  y Pedidos muestran la vista personal (empleado) o la de gestión (rrhh y
  admin). El Menú replica las secciones de la sidebar web.
- Calendario y selectores propios (sin dependencias nativas extra) para que
  la UI sea idéntica en Android, iOS y web.
- Descargas (CSV IoT, JSON de datos personales): en el teléfono se abren con
  la hoja de compartir del sistema; en web descargan como archivo.
