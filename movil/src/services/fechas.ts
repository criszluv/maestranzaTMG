// src/services/fechas.ts
// Utilidades de fechas compartidas por las pantallas (es-CL).

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const

export const DIAS_CORTOS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const

/** Fecha local de hoy como YYYY-MM-DD (sin sorpresas de zona horaria). */
export function hoyISO(): string {
  const d = new Date()
  return toISO(d)
}

export function toISO(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const dia = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dia}`
}

/** "2026-07-15" -> "15-07-2026" (formato chileno corto). */
export function formatearFecha(iso?: string | null): string {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  if (!a || !m || !d) return iso
  return `${d}-${m}-${a}`
}

/** ISO datetime -> "15-07-2026 08:31" en hora local. */
export function formatearFechaHora(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const hh = `${d.getHours()}`.padStart(2, '0')
  const mm = `${d.getMinutes()}`.padStart(2, '0')
  return `${formatearFecha(toISO(d))} ${hh}:${mm}`
}

/** Días hábiles (lun-vie) en [inicio, fin]; espeja el backend. */
export function diasHabiles(inicioISO: string, finISO: string): number {
  if (!inicioISO || !finISO) return 0
  const inicio = new Date(`${inicioISO}T00:00:00`)
  const fin = new Date(`${finISO}T00:00:00`)
  if (fin < inicio) return 0
  let total = 0
  const d = new Date(inicio)
  while (d <= fin) {
    const dow = d.getDay() // 0=domingo, 6=sábado
    if (dow !== 0 && dow !== 6) total += 1
    d.setDate(d.getDate() + 1)
  }
  return total
}

const formatoCLP = new Intl.NumberFormat('es-CL')

/** 1234567 -> "$1.234.567" (CLP). */
export function formatearCLP(valor?: number | null): string {
  if (valor === null || valor === undefined) return '—'
  return `$${formatoCLP.format(valor)}`
}
