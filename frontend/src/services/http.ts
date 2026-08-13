// src/services/http.ts
// -----------------------------------------------------------------------
// Núcleo HTTP compartido: URL base del backend, manejo del token JWT y el
// helper genérico `request`. Cada feature define SU api en
// features/<modulo>/api.ts usando estas piezas (separación por módulo).
// -----------------------------------------------------------------------

//  - VITE_API_BASE_URL => "http://host:8000/api"
//  - VITE_API_URL      => "http://host:8000"  (se le agrega /api)
const API_BASE = import.meta.env?.VITE_API_URL ?? 'http://127.0.0.1:8000'

export const API_BASE_URL =
  import.meta.env?.VITE_API_BASE_URL ?? `${API_BASE}/api`

// =========================
//  SESIÓN / TOKEN JWT
// =========================
// El backend exige un Bearer token en casi todos los endpoints. Guardamos el
// token en localStorage y lo adjuntamos en cada request.
const TOKEN_KEY = 'token_portal'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
}

/** Cabeceras con el Bearer token (para requests manuales, ej: descargas). */
export function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
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
export async function errorDeRespuesta(res: Response, porDefecto: string): Promise<Error> {
  let cuerpo: unknown = null
  try {
    cuerpo = await res.json()
  } catch {
    // Sin cuerpo JSON (502, timeout de proxy…): queda el mensaje por defecto.
  }
  return new Error(mensajeDeError(cuerpo, porDefecto))
}

// =========================
//  HELPER GENÉRICO REQUEST
// =========================

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()

  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
    ...options,
  })

  // Token inválido/expirado teniendo sesión: limpiamos y avisamos a la app
  // para que cierre sesión (lo escucha AuthContext).
  if (res.status === 401 && token) {
    clearToken()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'))
    }
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
