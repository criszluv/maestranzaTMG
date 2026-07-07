// src/features/usuarios/api.ts
// API del módulo de gestión de usuarios (RRHH y Admin).

import { request } from '../../services/http'
import type { User, UserEstado, UserRol } from '../auth/api'

export interface UsuarioCreate {
  email: string
  password: string
  nombre: string
  rol: UserRol
  estado: UserEstado
}

export interface UsuarioUpdate {
  email?: string
  password?: string
  nombre?: string
  rol?: UserRol
  estado?: UserEstado
}

export async function getUsuarios(solo_activos?: boolean): Promise<User[]> {
  const query = solo_activos === undefined ? '' : `?solo_activos=${solo_activos}`
  return request<User[]>(`/rrhh/usuarios${query}`)
}

export async function crearUsuario(data: UsuarioCreate): Promise<User> {
  return request<User>('/rrhh/usuarios', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function actualizarUsuario(id: number, data: UsuarioUpdate): Promise<User> {
  return request<User>(`/rrhh/usuarios/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deshabilitarUsuario(id: number): Promise<User> {
  return request<User>(`/rrhh/usuarios/${id}/deshabilitar`, { method: 'POST' })
}

export async function habilitarUsuario(id: number): Promise<User> {
  return request<User>(`/rrhh/usuarios/${id}/habilitar`, { method: 'POST' })
}
