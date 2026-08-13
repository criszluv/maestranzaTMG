// src/features/pedidos/api.ts
// API del módulo de pedidos (órdenes de trabajo).

import { API_BASE_URL, authHeaders, errorDeRespuesta, request } from '../../services/http'

export type EstadoPedido = 'pendiente' | 'en proceso' | 'terminado'

/** Destino comercial al cerrar un pedido terminado. */
export type TipoCierre = 'pagado' | 'pendiente'

export interface Pedido {
  id: number
  pedido: string
  descripcion?: string | null
  estado: EstadoPedido
  valor?: number | null
  encargado_id?: number | null
  encargado_nombre?: string | null
  cliente_id?: number | null
  cliente_nombre?: string | null
  /** null = aún no derivado a trabajos/facturas. */
  cerrado_en?: string | null
  cierre_tipo?: TipoCierre | null
  trabajo_id?: number | null
  factura_id?: number | null
}

export interface PedidoCreate {
  pedido: string
  descripcion?: string | null
  estado?: EstadoPedido
  valor?: number | null
  encargado_id?: number | null
  cliente_id?: number | null
}

export interface PedidoUpdate {
  pedido?: string
  descripcion?: string | null
  estado?: EstadoPedido
  valor?: number | null
  encargado_id?: number | null
  cliente_id?: number | null
}

/**
 * Cierre del pedido terminado. Los campos omitidos se heredan del pedido
 * (valor) o se generan (detalle = nombre + descripción, fecha = hoy).
 */
export interface PedidoCierrePayload {
  tipo: TipoCierre
  valor?: number | null
  fecha?: string | null      // YYYY-MM-DD
  numero?: number | null     // solo cierre 'pendiente' (N° de factura)
  nota?: string | null
  detalle?: string | null
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

/**
 * Cierra un pedido TERMINADO y lo deriva al módulo comercial:
 *   'pagado'    -> queda registrado en Trabajos realizados
 *   'pendiente' -> queda registrado en Pagos pendientes (factura por cobrar)
 * Solo se puede cerrar una vez y requiere que el pedido tenga cliente.
 */
export async function cerrarPedido(
  id: number,
  data: PedidoCierrePayload,
): Promise<Pedido> {
  return request<Pedido>(`/pedidos/${id}/cerrar`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
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
    throw await errorDeRespuesta(res, 'No se pudo subir la imagen.')
  }
  return res.json() as Promise<FotoPedido>
}

/** Soft-delete: desaparece de las vistas; el archivo queda resguardado. */
export async function ocultarFoto(pedidoId: number, fotoId: number): Promise<void> {
  return request<void>(`/pedidos/${pedidoId}/fotos/${fotoId}`, { method: 'DELETE' })
}
