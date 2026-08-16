// src/features/maquinas/api.ts
// API del módulo de máquinas de planta (activos monitoreados). Solo RRHH/Admin.

import { request } from '../../services/http'

export type EstadoMaquina = 'operativa' | 'detenida' | 'mantenimiento' | 'baja'

export const ESTADOS_MAQUINA: EstadoMaquina[] = [
  'operativa',
  'detenida',
  'mantenimiento',
  'baja',
]

export interface Maquina {
  id: number
  nombre: string
  ubicacion?: string | null
  /**
   * Frecuencia de giro nominal (RPM). Define dónde caen 1× y sus armónicos
   * en el espectro de vibración: sin este dato no se puede distinguir un
   * desbalance de un rodamiento picado.
   */
  rpm_nominal?: number | null
  estado: EstadoMaquina | string
  /** Última telemetría recibida; null = la máquina nunca reportó. */
  ultima_lectura?: string | null
  lecturas: number
}

export interface MaquinaPayload {
  nombre: string
  ubicacion?: string | null
  rpm_nominal?: number | null
  estado?: EstadoMaquina
}

export async function getMaquinas(incluirBajas = false): Promise<Maquina[]> {
  const q = incluirBajas ? '?incluir_bajas=true' : ''
  return request<Maquina[]>(`/maquinas${q}`)
}

export async function crearMaquina(data: MaquinaPayload): Promise<Maquina> {
  return request<Maquina>('/maquinas', { method: 'POST', body: JSON.stringify(data) })
}

export async function actualizarMaquina(
  id: number,
  data: Partial<MaquinaPayload>,
): Promise<Maquina> {
  return request<Maquina>(`/maquinas/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}
