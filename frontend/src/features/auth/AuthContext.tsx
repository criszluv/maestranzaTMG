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
    getMe()
      .then((u) => {
        setUser(u)
        localStorage.setItem(USER_KEY, JSON.stringify(u))
      })
      .catch(() => {
        // Un 401 ya disparó el logout vía evento; otros errores los ignoramos.
      })
  }, [])

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
