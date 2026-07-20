// src/api/clientes.ts
// API del módulo de clientes (cartera de la maestranza). Solo RRHH/Admin.
// Espejo de frontend/src/features/clientes/api.ts.

import { request } from '../services/http'

export interface ContactoCliente {
  id?: number
  nombre?: string | null
  telefono?: string | null
  nota?: string | null
  orden?: number
}

export interface EntidadCliente {
  id?: number
  rut: string
  nombre?: string | null
}

export interface Cliente {
  id: number
  nombre: string
  email?: string | null
  fecha_ingreso?: string | null // YYYY-MM-DD
  estado: 'habilitado' | 'deshabilitado' | string
  contactos: ContactoCliente[]
  entidades: EntidadCliente[]
}

export interface ClienteResumen {
  id: number
  nombre: string
  estado: string
}

export interface ClientePayload {
  nombre: string
  email?: string | null
  fecha_ingreso?: string | null
  contactos?: ContactoCliente[]
  entidades?: EntidadCliente[]
}

export async function getClientes(buscar?: string, estado?: string): Promise<Cliente[]> {
  const params = new URLSearchParams()
  if (buscar) params.set('buscar', buscar)
  if (estado) params.set('estado', estado)
  const q = params.toString()
  return request<Cliente[]>(`/clientes${q ? `?${q}` : ''}`)
}

export async function getClientesResumen(): Promise<ClienteResumen[]> {
  return request<ClienteResumen[]>('/clientes/resumen')
}

export async function crearCliente(data: ClientePayload): Promise<Cliente> {
  return request<Cliente>('/clientes', { method: 'POST', body: JSON.stringify(data) })
}

export async function actualizarCliente(
  id: number,
  data: Partial<ClientePayload>,
): Promise<Cliente> {
  return request<Cliente>(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deshabilitarCliente(id: number): Promise<Cliente> {
  return request<Cliente>(`/clientes/${id}/deshabilitar`, { method: 'POST' })
}

export async function habilitarCliente(id: number): Promise<Cliente> {
  return request<Cliente>(`/clientes/${id}/habilitar`, { method: 'POST' })
}
