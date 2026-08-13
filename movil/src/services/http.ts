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
import {
  File as ArchivoFS,
  UploadType,
  type UploadResult,
} from 'expo-file-system'
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
//  MENSAJES DE ERROR DEL BACKEND
// =========================
// FastAPI responde de DOS formas distintas y hay que entender ambas:
//   - Errores de negocio (400/403/404/409): { detail: "texto" }
//   - Errores de validación (422):          { detail: [ {loc, msg, type}, … ] }
// Si solo se lee el caso "texto", los 422 (RUT inválido, teléfono con
// formato raro, campo muy largo…) se pierden y el usuario ve un genérico.

interface ErrorValidacion {
  loc?: (string | number)[]
  msg?: string
  type?: string
}

export function mensajeDeError(cuerpo: unknown, porDefecto: string): string {
  const detail = (cuerpo as { detail?: unknown })?.detail

  if (typeof detail === 'string' && detail.trim()) return detail

  if (Array.isArray(detail)) {
    const mensajes = (detail as ErrorValidacion[])
      .slice(0, 3) // no abrumar: los primeros errores bastan para corregir
      .map((e) => {
        // Pydantic antepone "Value error, " a los validadores propios.
        const msg = (e.msg ?? '').replace(/^Value error,\s*/i, '').trim()
        if (!msg) return ''
        // Nuestros validadores ya devuelven frases completas en español
        // ("RUT inválido: …"); los genéricos de Pydantic vienen en inglés y
        // sin contexto, así que se les antepone el campo.
        if (e.type === 'value_error') return msg
        const campo = [...(e.loc ?? [])]
          .reverse()
          .find((p) => typeof p === 'string' && p !== 'body')
        return campo ? `${campo}: ${msg}` : msg
      })
      .filter(Boolean)

    if (mensajes.length) return mensajes.join(' · ')
  }

  return porDefecto
}

/** Lee el cuerpo de una respuesta fallida y devuelve el mensaje a mostrar. */
async function errorDeRespuesta(res: Response, porDefecto: string): Promise<Error> {
  let cuerpo: unknown = null
  try {
    cuerpo = await res.json()
  } catch {
    // Sin cuerpo JSON: queda el mensaje por defecto.
  }
  return new Error(mensajeDeError(cuerpo, porDefecto))
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
    throw await errorDeRespuesta(res, 'Error en la petición')
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

/** Interpreta el resultado de una subida (código + cuerpo en texto). */
async function procesarSubida<T>(status: number, cuerpoTexto: string): Promise<T> {
  if (status === 401 && getToken()) {
    await clearToken()
    emitUnauthorized()
  }

  let datos: unknown = null
  try {
    datos = JSON.parse(cuerpoTexto)
  } catch {
    // Respuesta sin JSON (proxy, timeout…): queda el mensaje por defecto.
  }

  if (status < 200 || status >= 300) {
    throw new Error(mensajeDeError(datos, 'No se pudo subir el archivo.'))
  }
  return datos as T
}

/**
 * Sube un archivo como multipart/form-data (campo "archivo").
 *
 * En NATIVO se usa la subida multipart del módulo de archivos, no fetch:
 * desde el SDK 54 Expo reemplaza el fetch global por su propia
 * implementación, que solo admite `string`, `Blob` u objetos con `bytes()`.
 * El clásico `{ uri, name, type }` de React Native ya no se acepta y falla
 * con "Unsupported FormDataPart implementation". Además, la subida nativa
 * transmite el archivo en streaming: una foto de varios MB no se carga
 * entera en memoria de JS.
 *
 * En WEB sí se usa FormData con un File real, que es lo estándar del
 * navegador (allí no existe la subida nativa).
 */
export async function subirArchivo<T>(path: string, archivo: ArchivoLocal): Promise<T> {
  const url = `${API_BASE_URL}${path}`

  if (Platform.OS === 'web') {
    const blob = await (await fetch(archivo.uri)).blob()
    const form = new FormData()
    form.append('archivo', new File([blob], archivo.nombre, { type: archivo.mimeType }))

    const res = await fetch(url, { method: 'POST', headers: authHeaders(), body: form })
    return procesarSubida<T>(res.status, await res.text())
  }

  let resultado: UploadResult
  try {
    resultado = await new ArchivoFS(archivo.uri).upload(url, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'archivo',   // debe coincidir con el parámetro del backend
      mimeType: archivo.mimeType,
      headers: authHeaders(),
    })
  } catch {
    throw new Error(
      `No se pudo enviar el archivo al servidor (${API_BASE}). Revisa tu conexión.`,
    )
  }
  return procesarSubida<T>(resultado.status, resultado.body)
}
