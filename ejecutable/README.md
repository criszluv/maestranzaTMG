# MaestranzaTMG — Cliente de escritorio (.exe)

Aplicación de escritorio para Windows que carga el **Portal MaestranzaTMG
hospedado en la nube**. Los trabajadores la instalan una vez y siempre ven la
última versión del portal: las actualizaciones llegan solas desde el hosting,
sin reinstalar nada.

**Tecnología:** Electron + electron-builder (el mismo modelo de Slack,
WhatsApp Desktop o VS Code). El ejecutable es un *shell delgado y endurecido*:
no contiene lógica de negocio; autenticación, datos y permisos siguen viviendo
en el backend FastAPI.

## Seguridad (programación segura aplicada)

Checklist oficial de seguridad de Electron, todo activo en [main.js](main.js):

| Control | Estado |
|---|---|
| `sandbox` global + `contextIsolation` | ✔ el contenido web corre aislado |
| `nodeIntegration` deshabilitado, sin preload ni IPC | ✔ superficie de ataque cero hacia Node |
| Navegación restringida | ✔ solo el origen declarado en `app-config.json` |
| `window.open` / target=_blank | ✔ nunca crea ventanas; http/https se abren en el navegador del sistema, otros esquemas se descartan |
| Permisos del navegador (cámara, mic, GPS…) | ✔ denegados por defecto |
| `<webview>` | ✔ bloqueado |
| DevTools | ✔ inexistentes en producción |
| Anti título-spoofing | ✔ el título de la ventana lo fija el shell |
| Instancia única | ✔ un segundo lanzamiento enfoca la ventana existente |
| Caída de red / portal | ✔ página offline local con reintento automático |

La sesión (token JWT en localStorage del perfil de la app) queda en el perfil
de Windows de cada usuario (`%APPDATA%/MaestranzaTMG`), separada por usuario
del PC.

## Configurar la URL del portal

La única configuración es [app-config.json](app-config.json):

```json
{ "appUrl": "https://portal.maestranzatmg.cl" }
```

- **Antes de compilar:** edita `appUrl` con la URL real donde subiste la app
  web (frontend). Debe ser `https://` en producción.
- **Después de instalar:** el archivo queda editable (sin recompilar) en
  `C:\Users\<usuario>\AppData\Local\Programs\MaestranzaTMG\resources\app-config.json`
  — útil si el dominio cambia.
- La app **solo** navega dentro de ese dominio; cualquier otro enlace se abre
  en el navegador del sistema.

## Compilar el .exe

Requisitos: Node 20+ (solo en el PC que compila; los trabajadores no
necesitan nada).

```powershell
cd ejecutable
npm install
npm run dist
```

Genera en `dist/`:

- **`MaestranzaTMG-Instalador-1.0.0.exe`** — instalador (NSIS) de un clic,
  **no requiere permisos de administrador** (instala por usuario), crea
  accesos directos en Escritorio y menú Inicio, y deja desinstalador en
  "Aplicaciones instaladas". Es el que se reparte a los trabajadores.
- **`MaestranzaTMG-Portable-1.0.0.exe`** — versión portable (un solo archivo,
  sin instalación), útil para probar o llevar en un pendrive.

El ícono se genera con [build/generar-icono.ps1](build/generar-icono.ps1)
(ya está generado; vuelve a correrlo solo si quieres cambiar la marca).

## Despliegue a los trabajadores

1. Sube la app web (frontend + backend) a tu hosting con **HTTPS**.
2. Pon esa URL en `app-config.json` y compila (`npm run dist`).
3. Reparte `MaestranzaTMG-Instalador-*.exe` (carpeta compartida, correo
   interno o intranet). Doble clic → instalado.
4. Cuando actualices el portal en la nube, **no hay que redistribuir nada**:
   la app siempre carga la versión publicada.

### Firma de código (recomendado para producción)

El instalador no está firmado digitalmente, por lo que Windows SmartScreen
puede mostrar el aviso "aplicación no reconocida" la primera vez (se instala
igual con "Más información → Ejecutar de todas formas"). Para eliminarlo,
compra un certificado de firma de código (OV/EV) y configúralo en
electron-builder (`win.certificateFile` / Azure Trusted Signing); es el mismo
requisito que tendría cualquier .exe corporativo.

## Desarrollo

```powershell
cd ejecutable
npm start                                  # usa appUrl de app-config.json
$env:PORTAL_URL = 'http://localhost:5173'  # (opcional) apuntar al Vite local
npm start
```

En desarrollo hay DevTools y logs; en el build de producción, no.
