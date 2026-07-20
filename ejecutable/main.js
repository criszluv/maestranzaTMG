// main.js — Cliente de escritorio del Portal MaestranzaTMG.
//
// Arquitectura: shell delgado y endurecido que carga el portal hospedado en
// la nube. Toda la lógica de negocio, autenticación y datos viven en el
// servidor: el ejecutable solo muestra la web, así los trabajadores siempre
// ven la última versión sin reinstalar nada.
//
// Modelo de seguridad (checklist oficial de Electron):
//  - Sandbox global + contextIsolation; el contenido web NO tiene acceso a
//    Node.js ni a APIs privilegiadas (no hay preload ni IPC: superficie cero).
//  - Navegación bloqueada: solo se permite el origen del portal declarado en
//    app-config.json; cualquier otro destino se abre en el navegador del
//    sistema (solo http/https) o se cancela.
//  - Permisos del navegador (cámara, micrófono, geolocalización, etc.)
//    denegados por defecto.
//  - DevTools y atajos de depuración deshabilitados en producción.
//  - Instancia única: un segundo lanzamiento enfoca la ventana existente.

'use strict'

const { app, BrowserWindow, Menu, dialog, session, shell } = require('electron')
const fs = require('fs')
const path = require('path')

const ES_DEV = !app.isPackaged

// =========================
//  CONFIGURACIÓN (URL del portal)
// =========================
// Empaquetada: resources/app-config.json (editable por un administrador sin
// recompilar). En desarrollo: el app-config.json del proyecto, con override
// opcional vía PORTAL_URL para pruebas locales.

function cargarConfig() {
  const ruta = ES_DEV
    ? path.join(__dirname, 'app-config.json')
    : path.join(process.resourcesPath, 'app-config.json')
  try {
    const config = JSON.parse(fs.readFileSync(ruta, 'utf8'))
    return { appUrl: String(config.appUrl ?? '') }
  } catch (error) {
    return { appUrl: '', error: `No se pudo leer ${ruta}: ${error.message}` }
  }
}

const config = cargarConfig()
if (ES_DEV && process.env.PORTAL_URL) {
  config.appUrl = process.env.PORTAL_URL
}

let APP_URL = null
try {
  const candidata = new URL(config.appUrl)
  if (candidata.protocol === 'https:' || candidata.protocol === 'http:') {
    APP_URL = candidata
  }
} catch {
  // Queda null: se informa y se cierra en app.whenReady().
}

/** true si la URL pertenece al portal (mismo origen que app-config.json). */
function esOrigenPermitido(urlTexto) {
  try {
    return APP_URL !== null && new URL(urlTexto).origin === APP_URL.origin
  } catch {
    return false
  }
}

// =========================
//  ESTADO DE VENTANA (tamaño/posición entre sesiones)
// =========================

const RUTA_ESTADO = () => path.join(app.getPath('userData'), 'window-state.json')

function leerEstadoVentana() {
  try {
    const estado = JSON.parse(fs.readFileSync(RUTA_ESTADO(), 'utf8'))
    if (Number.isFinite(estado.width) && Number.isFinite(estado.height)) {
      return estado
    }
  } catch {
    // Primera ejecución o archivo corrupto: valores por defecto.
  }
  return { width: 1280, height: 800 }
}

function guardarEstadoVentana(win) {
  try {
    if (win.isDestroyed() || win.isMinimized()) return
    const bounds = win.getNormalBounds()
    fs.writeFileSync(
      RUTA_ESTADO(),
      JSON.stringify({ ...bounds, maximized: win.isMaximized() }),
    )
  } catch {
    // No crítico: si falla, la próxima sesión abre con el tamaño por defecto.
  }
}

// =========================
//  VENTANA PRINCIPAL
// =========================

let ventana = null

function crearVentana() {
  const estado = leerEstadoVentana()

  ventana = new BrowserWindow({
    width: estado.width,
    height: estado.height,
    x: estado.x,
    y: estado.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    title: 'MaestranzaTMG',
    webPreferences: {
      // Defensa en profundidad (varios son default, se fijan explícitos):
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      plugins: false,
      devTools: ES_DEV,
      spellcheck: false,
    },
  })

  if (estado.maximized) ventana.maximize()
  ventana.once('ready-to-show', () => ventana.show())

  ventana.on('resize', () => guardarEstadoVentana(ventana))
  ventana.on('move', () => guardarEstadoVentana(ventana))
  ventana.on('close', () => guardarEstadoVentana(ventana))
  ventana.on('closed', () => {
    ventana = null
  })

  // El título lo controla el shell, no la página (anti-spoofing).
  ventana.on('page-title-updated', (event) => event.preventDefault())

  // Sin conexión o portal caído: página local con reintento.
  ventana.webContents.on(
    'did-fail-load',
    (_event, codigo, descripcion, urlFallida, esFramePrincipal) => {
      // -3 = ERR_ABORTED (navegación cancelada, no es un error real)
      if (!esFramePrincipal || codigo === -3) return
      console.warn(`[shell] Falla al cargar ${urlFallida}: ${codigo} ${descripcion}`)
      ventana.loadFile(path.join(__dirname, 'offline.html'), {
        query: { destino: APP_URL.toString() },
      })
    },
  )

  // Renderer caído (crash/OOM): recargar el portal.
  ventana.webContents.on('render-process-gone', (_event, detalles) => {
    console.warn(`[shell] Render process gone: ${detalles.reason}`)
    if (detalles.reason !== 'clean-exit') ventana.loadURL(APP_URL.toString())
  })

  if (ES_DEV) {
    ventana.webContents.on('did-finish-load', () => {
      console.log(`[shell] Cargado: ${ventana.webContents.getURL()}`)
    })
  }

  ventana.loadURL(APP_URL.toString())
}

// =========================
//  MENÚ (mínimo, en español)
// =========================

function crearMenu() {
  const plantilla = [
    {
      label: 'Portal',
      submenu: [
        {
          label: 'Ir al inicio',
          accelerator: 'Alt+Home',
          click: () => ventana?.loadURL(APP_URL.toString()),
        },
        { role: 'reload', label: 'Recargar' },
        { role: 'forceReload', label: 'Forzar recarga' },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' },
        { role: 'resetZoom', label: 'Tamaño real' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        // DevTools solo en desarrollo: en producción ni siquiera existe la opción.
        ...(ES_DEV ? [{ role: 'toggleDevTools', label: 'DevTools (dev)' }] : []),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla))
}

// =========================
//  INSTANCIA ÚNICA
// =========================

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (ventana) {
      if (ventana.isMinimized()) ventana.restore()
      ventana.focus()
    }
  })

  // Sandbox para TODOS los renderers del proceso.
  app.enableSandbox()

  // =========================
  //  POLÍTICAS GLOBALES DE SEGURIDAD
  // =========================
  app.on('web-contents-created', (_event, contents) => {
    // 1. Navegación del frame principal: solo dentro del portal (o la página
    //    offline local). Todo lo demás se cancela.
    contents.on('will-navigate', (event, urlDestino) => {
      const esOffline = urlDestino.startsWith('file://')
      if (!esOrigenPermitido(urlDestino) && !esOffline) {
        event.preventDefault()
        // Enlaces externos legítimos (http/https) van al navegador del sistema.
        if (/^https?:\/\//i.test(urlDestino)) void shell.openExternal(urlDestino)
      }
    })

    // 2. window.open / target=_blank: nunca se crean ventanas nuevas.
    //    http/https se delega al navegador del sistema; el resto se descarta
    //    (bloquea esquemas peligrosos tipo file:, javascript:, ms-*, etc.).
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })

    // 3. Nada puede adjuntar <webview>.
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })

  app.whenReady().then(() => {
    // 4. Permisos del navegador denegados por defecto (cámara, micrófono,
    //    geolocalización, MIDI, notificaciones…). El portal no los necesita
    //    en escritorio: las fotos se suben con el selector de archivos.
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, _permiso, callback) => callback(false),
    )
    session.defaultSession.setPermissionCheckHandler(() => false)

    if (APP_URL === null) {
      dialog.showErrorBox(
        'MaestranzaTMG — Configuración inválida',
        config.error ??
          `La URL del portal no es válida: "${config.appUrl}".\n` +
            'Revisa appUrl en resources/app-config.json (debe ser https://…).',
      )
      app.quit()
      return
    }

    crearMenu()
    crearVentana()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) crearVentana()
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
