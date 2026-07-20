// src/theme/tokens.ts
// Design tokens de la app móvil — espejo de frontend/src/styles/index.css.
// Filosofía (ISA-101 / High-Performance HMI): base neutra; el color
// comunica estado. Rojo = SOLO crítico/peligro y marca.

export const colors = {
  // Neutros (slate)
  bg: '#f4f6f9',
  surface: '#ffffff',
  surface2: '#f8fafc',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  text: '#1e293b',
  text2: '#475569',
  text3: '#64748b',

  // Acción / navegación (azul acero)
  primary: '#1d4ed8',
  primaryHover: '#1e40af',
  primarySoft: '#eff6ff',
  primaryBorder: '#bfdbfe',

  // Marca TMG (rojo: SOLO logo y acentos puntuales)
  brand: '#b91c1c',

  // Semánticos
  success: '#15803d',
  successSoft: '#f0fdf4',
  successBorder: '#bbf7d0',
  warning: '#b45309',
  warningSoft: '#fffbeb',
  warningBorder: '#fde68a',
  danger: '#b91c1c',
  dangerSoft: '#fef2f2',
  dangerBorder: '#fecaca',
  info: '#1d4ed8',
  infoSoft: '#eff6ff',
  infoBorder: '#bfdbfe',

  // Barra oscura (login / cabeceras)
  dark: '#0f172a',
  darkText: '#cbd5e1',
  darkBorder: '#1e293b',
} as const

export const fontSize = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 16,
  lg: 18,
  xl: 22,
} as const

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  full: 999,
} as const

export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 24,
  s6: 32,
} as const

/** Sombra suave equivalente a --shadow-sm/md (iOS + Android). */
export const shadow = {
  sm: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const
