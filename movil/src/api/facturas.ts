// src/api/facturas.ts
// API del módulo de pagos pendientes (facturas por cobrar). Solo RRHH/Admin.
// Espejo de frontend/src/features/facturas/api.ts.

import { request } from '../services/http'
import type { Trabajo } from './trabajos'

export type EstadoFactura = 'pendiente' | 'pagada'

export interface Factura {
  id: number
  cliente_id?: number | null
  cliente_nombre?: string | null   // nombre real del cliente vinculado
  cliente_texto: string            // nombre tal como se digitó (siempre)
  numero?: number | null
  monto?: number | null            // CLP
  fecha_emision?: string | null    // YYYY-MM-DD
  estado: EstadoFactura | string
  pagada_en?: string | null
  nota?: string | null
}

export interface FacturaPayload {
  cliente_id?: number | null
  cliente_texto?: string | null
  numero?: number | null
  monto?: number | null
  fecha_emision?: string | null
  nota?: string | null
}

export interface FiltroFacturas {
  estado?: EstadoFactura
  cliente_id?: number
  buscar?: string
  solo_sin_vincular?: boolean
}

export async function getFacturas(filtro: FiltroFacturas = {}): Promise<Factura[]> {
  const params = new URLSearchParams()
  if (filtro.estado) params.set('estado', filtro.estado)
  if (filtro.cliente_id) params.set('cliente_id', String(filtro.cliente_id))
  if (filtro.buscar) params.set('buscar', filtro.buscar)
  if (filtro.solo_sin_vincular) params.set('solo_sin_vincular', 'true')
  const q = params.toString()
  return request<Factura[]>(`/facturas${q ? `?${q}` : ''}`)
}

export async function crearFactura(data: FacturaPayload): Promise<Factura> {
  return request<Factura>('/facturas', { method: 'POST', body: JSON.stringify(data) })
}

export async function actualizarFactura(
  id: number,
  data: Partial<FacturaPayload>,
): Promise<Factura> {
  return request<Factura>(`/facturas/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function pagarFactura(id: number): Promise<Factura> {
  return request<Factura>(`/facturas/${id}/pagar`, { method: 'POST' })
}

export async function reabrirFactura(id: number): Promise<Factura> {
  return request<Factura>(`/facturas/${id}/reabrir`, { method: 'POST' })
}

/** Solo admin (registros erróneos; queda auditado). */
export async function eliminarFactura(id: number): Promise<void> {
  return request<void>(`/facturas/${id}`, { method: 'DELETE' })
}

/**
 * La factura se dio por pagada y pasa al historial de Trabajos realizados.
 * Si venía del cierre de un pedido, ese pedido queda marcado como 'pagado'.
 * Requiere que la factura tenga un cliente de la cartera vinculado.
 */
export async function pasarFacturaATrabajo(id: number): Promise<Trabajo> {
  return request<Trabajo>(`/facturas/${id}/a-trabajo`, { method: 'POST' })
}
