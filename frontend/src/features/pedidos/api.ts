// src/features/pedidos/api.ts
// API del módulo de pedidos (órdenes de trabajo).

import { API_BASE_URL, authHeaders, request } from '../../services/http'

export type EstadoPedido = 'pendiente' | 'en proceso' | 'terminado'

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

/**
 * Sube una imagen (multipart). No usa request(): este helper fuerza
 * Content-Type JSON y aquí el navegador debe fijar el boundary solo.
 */
export async function subirFoto(pedidoId: number, archivo: File): Promise<FotoPedido> {
  const form = new FormData()
  form.append('archivo', archivo)

  const res = await fetch(`${API_BASE_URL}/pedidos/${pedidoId}/fotos`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) {
    let detail = 'No se pudo subir la imagen.'
    try {
      const data = (await res.json()) as { detail?: unknown }
      if (typeof data.detail === 'string') detail = data.detail
    } catch {
      // sin cuerpo JSON: mensaje genérico
    }
    throw new Error(detail)
  }
  return res.json() as Promise<FotoPedido>
}

/** Soft-delete: desaparece de las vistas; el archivo queda resguardado. */
export async function ocultarFoto(pedidoId: number, fotoId: number): Promise<void> {
  return request<void>(`/pedidos/${pedidoId}/fotos/${fotoId}`, { method: 'DELETE' })
}
