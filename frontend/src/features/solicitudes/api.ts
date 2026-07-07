// src/features/solicitudes/api.ts
// API del módulo de solicitudes de días libres / permisos / licencias.

import { API_BASE_URL, authHeaders, request } from '../../services/http'

export interface SolicitudCreate {
  trabajador_id: number
  tipo: string
  motivo: string
  fecha_inicio: string // YYYY-MM-DD
  fecha_fin: string    // YYYY-MM-DD
}

export interface Solicitud {
  id: number
  trabajador_id: number
  nombre_trabajador?: string
  tipo: string
  motivo: string
  fecha_inicio: string
  fecha_fin: string
  estado: string
  dias_habiles?: number   // días hábiles que consume (0 si no es Vacaciones)
  tiene_adjunto?: boolean  // true si tiene un foto-documento cargado
}

export interface SaldoVacaciones {
  anio: number
  dias_anuales: number
  dias_usados: number
  dias_disponibles: number
}

export interface SaldoTrabajador extends SaldoVacaciones {
  trabajador_id: number
  nombre: string
  rol: string
}

export interface AdjuntoSolicitud {
  solicitud_id: number
  nombre?: string | null
  content_type: string
  tamano_bytes?: number | null
  url: string // URL firmada TEMPORAL
}

export async function getSolicitudes(): Promise<Solicitud[]> {
  return request<Solicitud[]>('/rrhh/solicitudes')
}

export async function getMisSolicitudes(userId: number): Promise<Solicitud[]> {
  return request<Solicitud[]>(`/rrhh/mis-solicitudes/${userId}`)
}

export async function createSolicitud(data: SolicitudCreate): Promise<Solicitud> {
  return request<Solicitud>('/rrhh/solicitudes', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateEstadoSolicitud(id: number, estado: string): Promise<Solicitud> {
  return request<Solicitud>(`/rrhh/solicitudes/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado }),
  })
}

// ---------------- Saldo de vacaciones (15 días hábiles/año) ----------------

export async function getMisVacaciones(anio?: number): Promise<SaldoVacaciones> {
  const q = anio ? `?anio=${anio}` : ''
  return request<SaldoVacaciones>(`/rrhh/mis-vacaciones${q}`)
}

export async function getVacacionesDe(
  trabajadorId: number,
  anio?: number,
): Promise<SaldoVacaciones> {
  const q = anio ? `?anio=${anio}` : ''
  return request<SaldoVacaciones>(`/rrhh/vacaciones/${trabajadorId}${q}`)
}

/** Saldo de vacaciones de TODOS los trabajadores (RRHH/Admin). */
export async function getSaldosVacaciones(anio?: number): Promise<SaldoTrabajador[]> {
  const q = anio ? `?anio=${anio}` : ''
  return request<SaldoTrabajador[]>(`/rrhh/vacaciones${q}`)
}

// ---------------- Adjunto (1 foto-documento por solicitud) ----------------

export async function getAdjunto(solicitudId: number): Promise<AdjuntoSolicitud> {
  return request<AdjuntoSolicitud>(`/rrhh/solicitudes/${solicitudId}/adjunto`)
}

/** Sube o reemplaza el adjunto (multipart; el navegador fija el boundary). */
export async function subirAdjunto(
  solicitudId: number,
  archivo: File,
): Promise<AdjuntoSolicitud> {
  const form = new FormData()
  form.append('archivo', archivo)
  const res = await fetch(`${API_BASE_URL}/rrhh/solicitudes/${solicitudId}/adjunto`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) {
    let detail = 'No se pudo subir el documento.'
    try {
      const data = (await res.json()) as { detail?: unknown }
      if (typeof data.detail === 'string') detail = data.detail
    } catch {
      // sin cuerpo JSON: mensaje genérico
    }
    throw new Error(detail)
  }
  return res.json() as Promise<AdjuntoSolicitud>
}

export async function eliminarAdjunto(solicitudId: number): Promise<void> {
  return request<void>(`/rrhh/solicitudes/${solicitudId}/adjunto`, { method: 'DELETE' })
}
