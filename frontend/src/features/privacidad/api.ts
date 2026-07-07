// src/features/privacidad/api.ts
// Derechos del titular de datos (Ley 21.719): transparencia, acceso y
// portabilidad. Cada usuario solo puede consultar SUS datos (el backend
// resuelve la identidad desde el JWT).

import { request } from '../../services/http'

export interface FinalidadTratamiento {
  dato: string
  finalidad: string
  base_licitud: string
  plazo: string
}

export interface PoliticaTratamiento {
  responsable: string
  contacto: string
  marco_legal: string[]
  finalidades: FinalidadTratamiento[]
  derechos: Record<string, string>
  medidas_seguridad: string[]
  brechas: string
}

export async function getPolitica(): Promise<PoliticaTratamiento> {
  return request<PoliticaTratamiento>('/privacidad/politica')
}

/** Descarga el paquete completo de datos personales como archivo JSON. */
export async function descargarMisDatos(): Promise<void> {
  const datos = await request<unknown>('/privacidad/mis-datos')
  const blob = new Blob([JSON.stringify(datos, null, 2)], {
    type: 'application/json',
  })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mis-datos-personales_${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}
