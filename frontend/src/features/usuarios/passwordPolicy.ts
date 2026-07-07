// src/features/usuarios/passwordPolicy.ts
// -----------------------------------------------------------------------
// Espejo (en el cliente) de la política de contraseñas del backend
// (backend/app/core/passwords.py). Es solo para dar feedback INMEDIATO al
// usuario: la validación real y de seguridad siempre la hace el servidor.
// Si ambos divergen, manda el servidor (devuelve 422 con el mensaje).
// -----------------------------------------------------------------------

export const PASSWORD_MIN_LARGO = 8

export const POLITICA_PASSWORD_TEXTO =
  `Mínimo ${PASSWORD_MIN_LARGO} caracteres, combinando al menos 3 de: ` +
  'mayúsculas, minúsculas, números y símbolos. Evita datos obvios ' +
  '(tu correo), secuencias (1234, abcd) y contraseñas comunes.'

const BASES_PROHIBIDAS = new Set([
  'password', 'passw0rd', 'contrasena', 'contraseña', 'clave', 'admin',
  'administrador', 'usuario', 'user', 'root', 'test', 'demo', 'guest',
  'qwerty', 'qwertyui', 'asdf', 'asdfgh', 'zxcvbn', 'abcd', 'abcdef',
  'letmein', 'welcome', 'bienvenido', 'iloveyou', 'dragon', 'monkey',
  'master', 'login', 'secret', 'changeme', 'temporal', 'cambiar',
  'maestranza', 'tmg', 'portal', 'dimak', 'workera', 'empresa',
])

const SECUENCIAS = [
  '0123456789', '9876543210',
  'abcdefghijklmnopqrstuvwxyz', 'zyxwvutsrqponmlkjihgfedcba',
  'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
]

function clases(p: string): number {
  let n = 0
  if (/[a-z]/.test(p)) n++
  if (/[A-Z]/.test(p)) n++
  if (/[0-9]/.test(p)) n++
  if (/[^A-Za-z0-9]/.test(p)) n++
  return n
}

function baseNormalizada(p: string): string {
  return p.toLowerCase().trim().replace(/[^a-záéíóúñ]+$/u, '')
}

function esTrivial(password: string): boolean {
  const p = password.toLowerCase()
  const distintos = new Set(p)
  if (distintos.size < 4) return true
  const maxRepetido = Math.max(...[...distintos].map((c) => p.split(c).length - 1))
  if (maxRepetido > Math.floor(p.length / 2)) return true
  for (let periodo = 1; periodo <= Math.floor(p.length / 2); periodo++) {
    if ([...p].every((ch, i) => ch === p[i % periodo])) return true
  }
  for (const seq of SECUENCIAS) {
    for (let i = 0; i < seq.length - 3; i++) {
      if (p.includes(seq.slice(i, i + 4))) return true
    }
  }
  return false
}

/**
 * Devuelve un mensaje de error si la contraseña no cumple la política, o
 * `null` si es aceptable. `email` se usa para prohibir que la contraseña
 * contenga la parte local del correo.
 */
export function validarPasswordCliente(
  password: string,
  email?: string,
): string | null {
  if (password !== password.trim()) {
    return 'La contraseña no puede empezar ni terminar con espacios.'
  }
  if (password.length < PASSWORD_MIN_LARGO) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LARGO} caracteres.`
  }
  if (clases(password) < 3) {
    return 'La contraseña debe combinar al menos 3 de: mayúsculas, minúsculas, números y símbolos.'
  }
  if (esTrivial(password)) {
    return "La contraseña es demasiado predecible (evita secuencias como '1234', 'abcd' o caracteres repetidos)."
  }
  if (BASES_PROHIBIDAS.has(baseNormalizada(password))) {
    return 'La contraseña es demasiado común o fácil de adivinar. Elige otra.'
  }
  if (email) {
    const local = email.split('@')[0]?.toLowerCase() ?? ''
    if (local.length >= 4 && password.toLowerCase().includes(local)) {
      return 'La contraseña no puede contener tu nombre de correo.'
    }
  }
  return null
}
