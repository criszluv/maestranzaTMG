// src/auth/Protegido.tsx
// Segunda línea de defensa para la UX (igual que ProtectedRoute en la web):
// la AUTORIZACIÓN real está en el backend (JWT + require_roles); esto solo
// evita mostrar pantallas que el usuario no podría usar.

import { Redirect } from 'expo-router'
import type { ReactNode } from 'react'
import { Cargando } from '../components/ui'
import { useAuth } from './AuthContext'

type Rol = 'admin' | 'rrhh' | 'empleado'

interface ProtegidoProps {
  children: ReactNode
  rolRequerido?: Rol
}

export function Protegido({ children, rolRequerido }: ProtegidoProps) {
  const { user, cargando } = useAuth()

  if (cargando) return <Cargando />

  // 1. Sin sesión: al login
  if (!user) return <Redirect href="/login" />

  // 2. Con rol requerido que no cumple (y no es admin): a las pestañas
  if (rolRequerido && user.rol !== rolRequerido && user.rol !== 'admin') {
    return <Redirect href="/(tabs)" />
  }

  return <>{children}</>
}
