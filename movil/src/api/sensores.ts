// src/api/sensores.ts
// API del módulo de sensores IoT (dashboard de máquinas + reporte CSV).
// Espejo de frontend/src/features/sensores/api.ts.

import { API_BASE_URL, authHeaders, request } from '../services/http'
import { guardarYCompartirTexto } from '../services/files'

export type IotMetrica = {
  id: number
  maquina: string
  temperatura: number | string
  humedad: number | string
  consumo_kw: number | string
  timestamp: string
}

export async function fetchMetricas(limite = 20): Promise<IotMetrica[]> {
  const data = await request<IotMetrica[]>(`/iot/metricas?limite=${limite}`)
  return Array.isArray(data) ? data : []
}

/** Reportería: descarga/comparte el histórico como CSV. */
export async function descargarReporteCsv(): Promise<void> {
  const resp = await fetch(`${API_BASE_URL}/iot/exportar_csv`, {
    headers: authHeaders(),
  })

  if (!resp.ok) {
    throw new Error('Error al descargar el reporte')
  }

  const contenido = await resp.text()
  const nombre = `reporte_iot_${new Date().toISOString().split('T')[0]}.csv`
  await guardarYCompartirTexto(nombre, contenido, 'text/csv')
}
