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
