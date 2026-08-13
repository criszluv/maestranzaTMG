import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'
import { clearToken, getToken, setToken } from '../../services/http'
import {
  login as loginApi,
  getMe,
  type User,
  type LoginCredentials,
} from './api'

interface AuthContextType {
  user: User | null
  token: string | null
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const USER_KEY = 'usuario_portal'

// ---------------------------------------------------------------------------
//  CIERRE DE SESIÓN POR INACTIVIDAD
// ---------------------------------------------------------------------------
// Los equipos del taller y de la oficina son compartidos: si alguien deja la
// sesión abierta y se va, cualquiera podría seguir operando con su identidad
// (y todo quedaría auditado a su nombre). Tras este tiempo sin interacción la
// sesión se cierra sola, en el cliente. El token del servidor sigue teniendo
// su propia expiración (ACCESS_TOKEN_EXPIRE_MINUTES), que es la barrera real.
const ACTIVIDAD_KEY = 'ultima_actividad_portal'
const MINUTOS_INACTIVIDAD = 30
const MS_INACTIVIDAD = MINUTOS_INACTIVIDAD * 60 * 1000

function marcarActividad(): void {
  try {
    localStorage.setItem(ACTIVIDAD_KEY, String(Date.now()))
  } catch {
    // Modo privado o storage lleno: no es crítico.
  }
}

/** true si pasó más de MINUTOS_INACTIVIDAD desde la última interacción. */
function sesionVencidaPorInactividad(): boolean {
  try {
    const ultima = Number(localStorage.getItem(ACTIVIDAD_KEY) ?? 0)
    return ultima > 0 && Date.now() - ultima > MS_INACTIVIDAD
  } catch {
    return false
  }
}

function getInitialUser(): User | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(USER_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored) as User
  } catch (error) {
    console.error('Error al parsear usuario_portal desde localStorage', error)
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getInitialUser())
  const [token, setTokenState] = useState<string | null>(() => getToken())

  const logout = useCallback(() => {
    setUser(null)
    setTokenState(null)
    clearToken()
    try {
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(ACTIVIDAD_KEY)
    } catch (error) {
      console.error('No se pudo limpiar la sesión de localStorage', error)
    }
  }, [])

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      const data = await loginApi(credentials)
      setToken(data.access_token)
      setTokenState(data.access_token)
      setUser(data.user)
      marcarActividad()
      try {
        localStorage.setItem(USER_KEY, JSON.stringify(data.user))
      } catch (error) {
        console.error('No se pudo guardar la sesión en localStorage', error)
      }
    },
    [],
  )

  // Si una petición devuelve 401 (token expirado/ inválido), http.ts dispara
  // este evento global y cerramos sesión en la app.
  useEffect(() => {
    const onUnauthorized = () => logout()
    window.addEventListener('auth:unauthorized', onUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized)
  }, [logout])

  // Al montar: si hay token guardado, lo revalidamos contra /auth/me y
  // refrescamos los datos del usuario (por si cambió su rol/estado).
  useEffect(() => {
    if (!getToken()) return
    // Se abandonó el equipo con la sesión abierta: no se rehidrata.
    if (sesionVencidaPorInactividad()) {
      logout()
      return
    }
    getMe()
      .then((u) => {
        setUser(u)
        localStorage.setItem(USER_KEY, JSON.stringify(u))
      })
      .catch(() => {
        // Un 401 ya disparó el logout vía evento; otros errores los ignoramos.
      })
  }, [logout])

  // Vigilancia de inactividad mientras hay sesión: cada interacción renueva
  // el contador y un chequeo periódico (o al volver a la pestaña) cierra la
  // sesión si se pasó del límite.
  useEffect(() => {
    if (!user) return

    const revisar = () => {
      if (sesionVencidaPorInactividad()) logout()
    }
    const eventos = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const

    marcarActividad()
    eventos.forEach((e) =>
      window.addEventListener(e, marcarActividad, { passive: true }),
    )
    document.addEventListener('visibilitychange', revisar)
    const intervalo = window.setInterval(revisar, 60_000)

    return () => {
      eventos.forEach((e) => window.removeEventListener(e, marcarActividad))
      document.removeEventListener('visibilitychange', revisar)
      window.clearInterval(intervalo)
    }
  }, [user, logout])

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de un <AuthProvider>')
  }
  return ctx
}
