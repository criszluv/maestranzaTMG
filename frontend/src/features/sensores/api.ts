// src/features/sensores/api.ts
// API del módulo de sensores IoT (dashboard de máquinas + reporte CSV).

import { API_BASE_URL, authHeaders, request } from '../../services/http'

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

/** Reportería: descarga el histórico como CSV (blob + link temporal). */
export async function descargarReporteCsv(): Promise<void> {
  const resp = await fetch(`${API_BASE_URL}/iot/exportar_csv`, {
    headers: authHeaders(),
  })

  if (!resp.ok) {
    const texto = await resp.text().catch(() => '')
    console.error('[IoT] Error al descargar reporte:', resp.status, texto)
    throw new Error('Error al descargar el reporte')
  }

  const blob = await resp.blob()
  const downloadUrl = window.URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = downloadUrl
  a.download = `reporte_iot_${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()

  window.URL.revokeObjectURL(downloadUrl)
}
