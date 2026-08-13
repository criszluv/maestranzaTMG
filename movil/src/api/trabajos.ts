// src/api/trabajos.ts
// API del módulo de trabajos realizados a clientes. Solo RRHH/Admin.
// Espejo de frontend/src/features/trabajos/api.ts.

import { request } from '../services/http'
import type { Factura } from './facturas'

export type EstadoTrabajo = 'Pendiente' | 'En proceso' | 'Finalizado'

export const ESTADOS_TRABAJO: EstadoTrabajo[] = ['Pendiente', 'En proceso', 'Finalizado']

export interface Trabajo {
  id: number
  cliente_id: number
  cliente_nombre?: string | null
  fecha: string          // YYYY-MM-DD
  hora?: string | null   // HH:MM:SS
  estado: EstadoTrabajo | string
  valor?: number | null  // CLP
  detalle: string
}

export interface TrabajoPayload {
  cliente_id: number
  fecha: string
  hora?: string | null
  estado?: EstadoTrabajo
  valor?: number | null
  detalle: string
}

export interface FiltroTrabajos {
  cliente_id?: number
  buscar?: string
  desde?: string
  hasta?: string
}

export async function getTrabajos(filtro: FiltroTrabajos = {}): Promise<Trabajo[]> {
  const params = new URLSearchParams()
  if (filtro.cliente_id) params.set('cliente_id', String(filtro.cliente_id))
  if (filtro.buscar) params.set('buscar', filtro.buscar)
  if (filtro.desde) params.set('desde', filtro.desde)
  if (filtro.hasta) params.set('hasta', filtro.hasta)
  const q = params.toString()
  return request<Trabajo[]>(`/trabajos${q ? `?${q}` : ''}`)
}

export async function crearTrabajo(data: TrabajoPayload): Promise<Trabajo> {
  return request<Trabajo>('/trabajos', { method: 'POST', body: JSON.stringify(data) })
}

export async function actualizarTrabajo(
  id: number,
  data: Partial<TrabajoPayload>,
): Promise<Trabajo> {
  return request<Trabajo>(`/trabajos/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

/** Solo admin (correcciones excepcionales; queda auditado). */
export async function eliminarTrabajo(id: number): Promise<void> {
  return request<void>(`/trabajos/${id}`, { method: 'DELETE' })
}

/**
 * Corrige el cobro: el trabajo deja de estar pagado y se mueve a Pagos
 * pendientes como factura por cobrar. Si venía del cierre de un pedido, ese
 * pedido queda marcado como 'pendiente'. Devuelve la factura creada.
 */
export async function pasarTrabajoAPendiente(id: number): Promise<Factura> {
  return request<Factura>(`/trabajos/${id}/a-pendiente`, { method: 'POST' })
}
