// src/api/pedidos.ts
// API del módulo de pedidos (órdenes de trabajo) + fotos de progreso.
// Espejo de frontend/src/features/pedidos/api.ts.

import { request, subirArchivo, type ArchivoLocal } from '../services/http'

export type EstadoPedido = 'pendiente' | 'en proceso' | 'terminado'

export const ESTADOS_PEDIDO: EstadoPedido[] = ['pendiente', 'en proceso', 'terminado']

export interface Pedido {
  id: number
  pedido: string
  descripcion?: string | null
  estado: EstadoPedido
  valor?: number | null
  encargado_id?: number | null
  encargado_nombre?: string | null
}

export interface PedidoCreate {
  pedido: string
  descripcion?: string | null
  estado?: EstadoPedido
  valor?: number | null
  encargado_id?: number | null
}

export interface PedidoUpdate {
  pedido?: string
  descripcion?: string | null
  estado?: EstadoPedido
  valor?: number | null
  encargado_id?: number | null
}

export async function getPedidos(): Promise<Pedido[]> {
  return request<Pedido[]>('/pedidos')
}

export async function getMisPedidos(userId: number): Promise<Pedido[]> {
  return request<Pedido[]>(`/pedidos/mis-pedidos/${userId}`)
}

export async function crearPedido(data: PedidoCreate): Promise<Pedido> {
  return request<Pedido>('/pedidos', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function actualizarPedido(id: number, data: PedidoUpdate): Promise<Pedido> {
  return request<Pedido>(`/pedidos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function actualizarEstadoPedido(
  id: number,
  estado: EstadoPedido,
): Promise<Pedido> {
  return request<Pedido>(`/pedidos/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado }),
  })
}

export async function eliminarPedido(id: number): Promise<void> {
  return request<void>(`/pedidos/${id}`, { method: 'DELETE' })
}

// ============================================================
//  FOTOS DE PROGRESO (bucket privado de Supabase Storage)
// ============================================================

export interface FotoPedido {
  id: number
  pedido_id: number
  subido_por: number
  subido_por_nombre?: string | null
  nombre_original?: string | null
  tamano_bytes: number
  content_type: string
  subida_en: string
  /** URL firmada TEMPORAL (expira ~1 h): usar al momento, no persistir. */
  url: string
}

export async function getFotos(pedidoId: number): Promise<FotoPedido[]> {
  return request<FotoPedido[]>(`/pedidos/${pedidoId}/fotos`)
}

/** Sube una imagen de avance (multipart). */
export async function subirFoto(
  pedidoId: number,
  archivo: ArchivoLocal,
): Promise<FotoPedido> {
  return subirArchivo<FotoPedido>(`/pedidos/${pedidoId}/fotos`, archivo)
}

/** Soft-delete: desaparece de las vistas; el archivo queda resguardado. */
export async function ocultarFoto(pedidoId: number, fotoId: number): Promise<void> {
  return request<void>(`/pedidos/${pedidoId}/fotos/${fotoId}`, { method: 'DELETE' })
}
