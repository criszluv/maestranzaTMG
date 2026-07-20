// src/auth/AuthContext.tsx
// Sesión de la app: bootstrap del token guardado (SecureStore), login,
// logout y cierre automático cuando el backend responde 401.
// A diferencia de la web, el usuario NO se persiste en disco: se rehidrata
// desde /auth/me en cada arranque (datos siempre frescos y menos datos
// personales almacenados en el dispositivo).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  clearToken,
  loadToken,
  onUnauthorized,
  setToken,
} from '../services/http'
import { getMe, login as loginApi, type LoginCredentials, type User } from '../api/auth'

interface AuthContextType {
  user: User | null
  /** true mientras se restaura la sesión guardada al arrancar. */
  cargando: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [cargando, setCargando] = useState(true)

  const logout = useCallback(async () => {
    setUser(null)
    await clearToken()
  }, [])

  const login = useCallback(async (credentials: LoginCredentials) => {
    const data = await loginApi(credentials)
    await setToken(data.access_token)
    setUser(data.user)
  }, [])

  // Si una petición devuelve 401 (token expirado/inválido), http.ts emite
  // este evento y cerramos sesión en la app.
  useEffect(() => {
    return onUnauthorized(() => {
      setUser(null)
    })
  }, [])

  // Al arrancar: si hay token guardado, lo revalidamos contra /auth/me.
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      try {
        const token = await loadToken()
        if (token) {
          const u = await getMe()
          if (!cancelado) setUser(u)
        }
      } catch {
        // 401 ya limpió el token vía evento; errores de red dejan la
        // sesión cerrada (el usuario puede reintentar el login).
      } finally {
        if (!cancelado) setCargando(false)
      }
    })()
    return () => {
      cancelado = true
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, cargando, login, logout }}>
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
