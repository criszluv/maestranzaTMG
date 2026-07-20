// src/components/CampoFecha.tsx
// Campo de fecha con calendario propio en modal. Multiplataforma
// (Android/iOS/web) y sin dependencias nativas extra, para que la app
// se vea idéntica en todos los dispositivos. Devuelve YYYY-MM-DD.

import { useMemo, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontSize, radius, shadow, space } from '../theme/tokens'
import { DIAS_CORTOS, MESES, formatearFecha, toISO } from '../services/fechas'

interface CampoFechaProps {
  valor: string // YYYY-MM-DD o ''
  onChange: (iso: string) => void
  placeholder?: string
  /** Permite limpiar el valor con una X (filtros opcionales). */
  limpiable?: boolean
}

interface Celda {
  dia: number
  iso: string
  esHoy: boolean
}

function celdasDelMes(anio: number, mes: number): (Celda | null)[] {
  const primero = new Date(anio, mes, 1)
  // getDay(): 0=domingo … queremos lunes=0
  const offset = (primero.getDay() + 6) % 7
  const diasEnMes = new Date(anio, mes + 1, 0).getDate()
  const hoy = toISO(new Date())

  const celdas: (Celda | null)[] = Array.from({ length: offset }, () => null)
  for (let dia = 1; dia <= diasEnMes; dia++) {
    const iso = toISO(new Date(anio, mes, dia))
    celdas.push({ dia, iso, esHoy: iso === hoy })
  }
  return celdas
}

export function CampoFecha({ valor, onChange, placeholder = 'Selecciona fecha', limpiable }: CampoFechaProps) {
  const [abierto, setAbierto] = useState(false)

  const base = valor ? new Date(`${valor}T00:00:00`) : new Date()
  const [anio, setAnio] = useState(base.getFullYear())
  const [mes, setMes] = useState(base.getMonth())

  const celdas = useMemo(() => celdasDelMes(anio, mes), [anio, mes])

  const abrir = () => {
    const d = valor ? new Date(`${valor}T00:00:00`) : new Date()
    setAnio(d.getFullYear())
    setMes(d.getMonth())
    setAbierto(true)
  }

  const cambiarMes = (delta: number) => {
    const d = new Date(anio, mes + delta, 1)
    setAnio(d.getFullYear())
    setMes(d.getMonth())
  }

  return (
    <>
      <Pressable onPress={abrir} style={styles.campo}>
        <Ionicons name="calendar-outline" size={16} color={colors.text3} />
        <Text style={[styles.campoTexto, !valor && { color: colors.text3 }]}>
          {valor ? formatearFecha(valor) : placeholder}
        </Text>
        {limpiable && !!valor && (
          <Pressable onPress={() => onChange('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.text3} />
          </Pressable>
        )}
      </Pressable>

      <Modal
        visible={abierto}
        transparent
        animationType="fade"
        onRequestClose={() => setAbierto(false)}
      >
        <Pressable style={styles.fondo} onPress={() => setAbierto(false)}>
          <Pressable style={styles.caja} onPress={() => {}}>
            {/* Cabecera: navegación de mes */}
            <View style={styles.cabecera}>
              <Pressable onPress={() => cambiarMes(-1)} hitSlop={8} style={styles.flecha}>
                <Ionicons name="chevron-back" size={18} color={colors.text2} />
              </Pressable>
              <Text style={styles.mesTexto}>
                {MESES[mes]} {anio}
              </Text>
              <Pressable onPress={() => cambiarMes(1)} hitSlop={8} style={styles.flecha}>
                <Ionicons name="chevron-forward" size={18} color={colors.text2} />
              </Pressable>
            </View>

            {/* Días de la semana */}
            <View style={styles.filaSemana}>
              {DIAS_CORTOS.map((d, i) => (
                <Text key={`${d}-${i}`} style={styles.diaSemana}>
                  {d}
                </Text>
              ))}
            </View>

            {/* Celdas del mes */}
            <View style={styles.grilla}>
              {celdas.map((celda, i) =>
                celda === null ? (
                  <View key={`v-${i}`} style={styles.celda} />
                ) : (
                  <Pressable
                    key={celda.iso}
                    onPress={() => {
                      onChange(celda.iso)
                      setAbierto(false)
                    }}
                    style={({ pressed }) => [
                      styles.celda,
                      celda.iso === valor && styles.celdaSeleccionada,
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.celdaTexto,
                        celda.esHoy && !((celda.iso === valor)) && styles.celdaHoy,
                        celda.iso === valor && styles.celdaTextoSeleccionada,
                      ]}
                    >
                      {celda.dia}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>

            <Pressable
              onPress={() => {
                const hoy = toISO(new Date())
                onChange(hoy)
                setAbierto(false)
              }}
              style={styles.hoyBoton}
            >
              <Text style={styles.hoyTexto}>Hoy</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.s3,
    minHeight: 44,
  },
  campoTexto: { flex: 1, fontSize: fontSize.base, color: colors.text },

  fondo: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.s5,
  },
  caja: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.s4,
    width: '100%',
    maxWidth: 340,
    ...shadow.md,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.s3,
  },
  flecha: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
  },
  mesTexto: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },

  filaSemana: { flexDirection: 'row', marginBottom: space.s1 },
  diaSemana: {
    flexBasis: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.text3,
  },

  grilla: { flexDirection: 'row', flexWrap: 'wrap' },
  celda: {
    flexBasis: `${100 / 7}%`,
    aspectRatio: 1.15,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  celdaSeleccionada: { backgroundColor: colors.primary },
  celdaTexto: { fontSize: fontSize.sm, color: colors.text },
  celdaTextoSeleccionada: { color: '#fff', fontWeight: '700' },
  celdaHoy: { color: colors.primary, fontWeight: '700' },

  hoyBoton: {
    alignSelf: 'flex-end',
    marginTop: space.s2,
    paddingVertical: space.s2,
    paddingHorizontal: space.s3,
  },
  hoyTexto: { color: colors.primary, fontWeight: '700', fontSize: fontSize.sm },
})
