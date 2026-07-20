// src/api/auditoria.ts
// Visor del registro de cambios (auditoría, Ley 21.719). Solo RRHH/Admin.
// Espejo de frontend/src/features/auditoria/api.ts.

import { request } from '../services/http'

export interface RegistroAuditoria {
  id: number
  tabla: string
  operacion: 'INSERT' | 'UPDATE' | 'DELETE' | string
  registro_id?: string | null
  actor_app?: string | null      // "id|email" del usuario de la app
  actor_bd?: string | null
  datos_antes?: Record<string, unknown> | null
  datos_despues?: Record<string, unknown> | null
  ocurrido_en: string            // ISO datetime
}

export async function getAuditoria(
  tabla?: string,
  limite = 100,
): Promise<RegistroAuditoria[]> {
  const params = new URLSearchParams()
  if (tabla) params.set('tabla', tabla)
  params.set('limite', String(limite))
  return request<RegistroAuditoria[]>(`/auditoria?${params.toString()}`)
}
