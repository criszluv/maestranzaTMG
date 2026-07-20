// src/api/asistencia.ts
// API del módulo de asistencia (historial de marcaje vía Workera).
// El backend agrega las marcas crudas en jornadas diarias; la API key de
// Workera nunca llega al cliente. Espejo de features/asistencia/api.ts.

import { request } from '../services/http'

export interface Jornada {
  trabajador_id?: number | string | null
  nombre_trabajador?: string | null
  identificacion?: string | null
  sucursal?: string | null
  departamento?: string | null
  fecha?: string | null            // YYYY-MM-DD
  hora_entrada?: string | null     // ISO datetime
  hora_salida?: string | null      // ISO datetime
  horas_brutas?: number | null     // entrada→salida, sin descontar colación
  horas_trabajadas?: number | null // NETO (bruto - colación); null = en curso
  marcas?: number
}

export interface ReporteMensual {
  trabajador_id?: number | string | null
  nombre_trabajador?: string | null
  identificacion?: string | null
  sucursal?: string | null
  departamento?: string | null
  dias_asistidos: number
  jornadas_completas: number
  jornadas_incompletas: number     // días sin marcar entrada o salida
  horas_trabajadas: number         // total neto del mes
  horas_promedio?: number | null   // por jornada completa
}

export interface FiltroAsistencia {
  desde?: string // YYYY-MM-DD
  hasta?: string // YYYY-MM-DD
}

export async function getHistorialAsistencia(
  filtro: FiltroAsistencia = {},
): Promise<Jornada[]> {
  const params = new URLSearchParams()
  if (filtro.desde) params.set('desde', filtro.desde)
  if (filtro.hasta) params.set('hasta', filtro.hasta)
  const query = params.toString()
  return request<Jornada[]>(`/rrhh/asistencia/historial${query ? `?${query}` : ''}`)
}

export async function getReporteMensual(
  anio: number,
  mes: number,
): Promise<ReporteMensual[]> {
  return request<ReporteMensual[]>(
    `/rrhh/asistencia/reporte?anio=${anio}&mes=${mes}`,
  )
}
