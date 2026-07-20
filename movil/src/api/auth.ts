// src/api/auth.ts
// API del módulo de autenticación + tipos base del usuario de sesión.
// Espejo de frontend/src/features/auth/api.ts.

import { request } from '../services/http'

export interface User {
  id: number
  email: string
  nombre: string
  rol: 'admin' | 'rrhh' | 'empleado'
  estado: 'activo' | 'inactivo'
}

export type UserRol = User['rol']
export type UserEstado = User['estado']

export interface LoginCredentials {
  email: string
  password: string
}

// Respuesta del login: token + datos del usuario
export interface LoginResponse {
  access_token: string
  token_type: string
  user: User
}

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
}

// Devuelve el usuario del token actual (rehidratación de sesión).
export async function getMe(): Promise<User> {
  return request<User>('/auth/me')
}
