// src/services/rut.ts
// Validación de RUT chileno en el cliente (espejo de backend/app/services/rut.py).
// Solo feedback inmediato: la validación autoritativa la hace el backend.

const RUT_RE = /^(\d{1,3}(?:\.?\d{3})*)-([\dkK])$/

function digitoVerificador(cuerpo: string): string {
  let suma = 0
  let factor = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const resto = 11 - (suma % 11)
  if (resto === 10) return 'K'
  if (resto === 11) return '0'
  return String(resto)
}

/**
 * Valida y devuelve el RUT en formato canónico "12.345.678-9", o lanza
 * Error con mensaje apto para el usuario si es inválido.
 */
export function normalizarRut(valor: string): string {
  const rut = (valor || '').trim().toUpperCase()
  const m = RUT_RE.exec(rut)
  if (!m) throw new Error('RUT inválido: usa el formato 12.345.678-9.')

  const cuerpo = m[1].replace(/\./g, '')
  const dv = m[2].toUpperCase()
  if (cuerpo.length < 1 || cuerpo.length > 9) {
    throw new Error('RUT inválido: largo fuera de rango.')
  }
  if (digitoVerificador(cuerpo) !== dv) {
    throw new Error(`RUT inválido: el dígito verificador no corresponde (${valor}).`)
  }

  let conPuntos = ''
  for (let i = 0; i < cuerpo.length; i++) {
    const d = cuerpo[cuerpo.length - 1 - i]
    if (i && i % 3 === 0) conPuntos = '.' + conPuntos
    conPuntos = d + conPuntos
  }
  return `${conPuntos}-${dv}`
}
