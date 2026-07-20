// src/services/http.ts
// -----------------------------------------------------------------------
// Núcleo HTTP compartido (espejo de frontend/src/services/http.ts):
// URL base del backend, manejo del token JWT y el helper genérico
// `request`. Cada módulo define SU api en src/api/<modulo>.ts.
//
// Diferencias con la web:
//  - El token vive en SecureStore (nativo) con caché síncrono en memoria.
//  - La URL base se resuelve así:
//      1. EXPO_PUBLIC_API_URL (p. ej. "http://192.168.1.50:8000")
//      2. En desarrollo con Expo Go: la IP del PC que sirve el bundle
//         (hostUri) + puerto 8000 — funciona solo en la misma red.
//      3. Fallback: http://127.0.0.1:8000 (expo web en el mismo equipo).
// -----------------------------------------------------------------------

import Constants from 'expo-constants'
import { Platform } from 'react-native'
import * as storage from './storage'

function inferirHostDev(): string | null {
  // hostUri ~ "192.168.1.50:8081" cuando la app corre vía Expo Go / dev client
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig
      ?.debuggerHost
  const host = hostUri?.split(':')[0]
  return host ? `http://${host}:8000` : null
}

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === 'web' ? 'http://127.0.0.1:8000' : inferirHostDev()) ??
  'http://127.0.0.1:8000'

export const API_BASE_URL = `${API_BASE}/api`

// =========================
//  SESIÓN / TOKEN JWT
// =========================
const TOKEN_KEY = 'token_portal'

// Caché en memoria: fetch necesita el token de forma síncrona y
// SecureStore es asíncrono. AuthContext llama a loadToken() al arrancar.
let tokenEnMemoria: string | null = null

export function getToken(): string | null {
  return tokenEnMemoria
}

export async function loadToken(): Promise<string | null> {
  tokenEnMemoria = await storage.getItem(TOKEN_KEY)
  return tokenEnMemoria
}

export async function setToken(token: string): Promise<void> {
  tokenEnMemoria = token
  await storage.setItem(TOKEN_KEY, token)
}

export async function clearToken(): Promise<void> {
  tokenEnMemoria = null
  await storage.removeItem(TOKEN_KEY)
}

/** Cabeceras con el Bearer token (para requests manuales, ej: multipart). */
export function authHeaders(): Record<string, string> {
  return tokenEnMemoria ? { Authorization: `Bearer ${tokenEnMemoria}` } : {}
}

// =========================
//  EVENTO 401 (token vencido)
// =========================
// React Native no tiene eventos de window: mini-emisor propio.
// AuthContext se suscribe y cierra la sesión cuando el backend responde 401.
type Listener = () => void
const listeners = new Set<Listener>()

export function onUnauthorized(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emitUnauthorized(): void {
  listeners.forEach((l) => l())
}

// =========================
//  HELPER GENÉRICO REQUEST
// =========================

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...((options?.headers as Record<string, string>) ?? {}),
      },
    })
  } catch {
    throw new Error(
      `No se pudo conectar con el servidor (${API_BASE}). Revisa tu conexión.`,
    )
  }

  // Token inválido/expirado teniendo sesión: limpiamos y avisamos a la app
  // para que cierre sesión (lo escucha AuthContext).
  if (res.status === 401 && token) {
    await clearToken()
    emitUnauthorized()
  }

  if (!res.ok) {
    let detail = 'Error en la petición'
    try {
      const errorData = await res.json()
      if (typeof (errorData as { detail?: unknown })?.detail === 'string') {
        detail = (errorData as { detail: string }).detail
      }
    } catch {
      // Si no hay JSON, dejamos el mensaje genérico
    }
    throw new Error(detail)
  }

  if (res.status === 204) {
    // @ts-expect-error: T puede ser void
    return undefined
  }

  return res.json() as Promise<T>
}

// =========================
//  SUBIDA MULTIPART (fotos / adjuntos)
// =========================

/** Archivo local seleccionado con expo-image-picker. */
export interface ArchivoLocal {
  uri: string
  nombre: string
  mimeType: string
}

/**
 * Sube un archivo como multipart/form-data (campo "archivo").
 * En nativo, fetch acepta { uri, name, type }; en web convertimos el
 * data/blob URI a Blob. No se fija Content-Type: el runtime pone el boundary.
 */
export async function subirArchivo<T>(path: string, archivo: ArchivoLocal): Promise<T> {
  const form = new FormData()

  if (Platform.OS === 'web') {
    const blob = await (await fetch(archivo.uri)).blob()
    form.append('archivo', new File([blob], archivo.nombre, { type: archivo.mimeType }))
  } else {
    form.append('archivo', {
      uri: archivo.uri,
      name: archivo.nombre,
      type: archivo.mimeType,
    } as unknown as Blob)
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })

  if (res.status === 401 && getToken()) {
    await clearToken()
    emitUnauthorized()
  }

  if (!res.ok) {
    let detail = 'No se pudo subir el archivo.'
    try {
      const data = (await res.json()) as { detail?: unknown }
      if (typeof data.detail === 'string') detail = data.detail
    } catch {
      // sin cuerpo JSON: mensaje genérico
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}
