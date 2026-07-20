// src/api/privacidad.ts
// Derechos del titular de datos (Ley 21.719): transparencia, acceso y
// portabilidad. Cada usuario solo puede consultar SUS datos (el backend
// resuelve la identidad desde el JWT). Espejo de features/privacidad/api.ts.

import { request } from '../services/http'
import { guardarYCompartirTexto } from '../services/files'

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

/** Descarga/comparte el paquete completo de datos personales como JSON. */
export async function descargarMisDatos(): Promise<void> {
  const datos = await request<unknown>('/privacidad/mis-datos')
  const nombre = `mis-datos-personales_${new Date().toISOString().split('T')[0]}.json`
  await guardarYCompartirTexto(nombre, JSON.stringify(datos, null, 2), 'application/json')
}
