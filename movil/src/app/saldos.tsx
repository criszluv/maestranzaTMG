// src/app/saldos.tsx
// Saldos de vacaciones de todos los trabajadores (RRHH/Admin).
// 15 días hábiles por año; solo el tipo "Vacaciones" descuenta saldo.

import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { getSaldosVacaciones, type SaldoTrabajador } from '../api/solicitudes'
import { Protegido } from '../auth/Protegido'
import { useToast } from '../components/Toast'
import {
  Card,
  Cargando,
  Encabezado,
  Pantalla,
  Selector,
  Vacio,
} from '../components/ui'
import { colors, fontSize, radius, space } from '../theme/tokens'

function SaldosContenido() {
  const notify = useToast()
  const anioActual = new Date().getFullYear()

  const [anio, setAnio] = useState(anioActual)
  const [saldos, setSaldos] = useState<SaldoTrabajador[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  const anios = [anioActual, anioActual - 1, anioActual - 2].map((a) => ({
    valor: a,
    etiqueta: String(a),
  }))

  const cargar = useCallback(async () => {
    try {
      const data = await getSaldosVacaciones(anio)
      setSaldos(data)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudieron cargar los saldos.', 'error')
    } finally {
      setCargando(false)
    }
  }, [anio, notify])

  useEffect(() => {
    setCargando(true)
    void cargar()
  }, [cargar])

  const onRefresh = useCallback(async () => {
    setRefrescando(true)
    await cargar()
    setRefrescando(false)
  }, [cargar])

  if (cargando) return <Cargando />

  return (
    <Pantalla onRefresh={onRefresh} refrescando={refrescando}>
      <Encabezado
        titulo={`Saldos ${anio}`}
        subtitulo="Días de vacaciones disponibles por trabajador (15 hábiles al año)."
      />

      <Selector valor={anio} opciones={anios} onChange={setAnio} />

      {saldos.length === 0 ? (
        <Card>
          <Vacio mensaje="Sin trabajadores con saldo para este año." />
        </Card>
      ) : (
        <Card style={{ padding: 0 }}>
          {saldos.map((s, i) => {
            const agotado = s.dias_disponibles <= 0
            return (
              <View
                key={s.trabajador_id}
                style={[styles.fila, i > 0 && styles.filaBorde]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.nombre}>{s.nombre}</Text>
                  <Text style={styles.rol}>
                    {s.rol} · {s.dias_usados} usados de {s.dias_anuales}
                  </Text>
                </View>
                <View
                  style={[
                    styles.saldo,
                    {
                      backgroundColor: agotado ? colors.dangerSoft : colors.successSoft,
                      borderColor: agotado ? colors.dangerBorder : colors.successBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.saldoTexto,
                      { color: agotado ? colors.danger : colors.success },
                    ]}
                  >
                    {s.dias_disponibles}
                  </Text>
                </View>
              </View>
            )
          })}
        </Card>
      )}
    </Pantalla>
  )
}

export default function SaldosScreen() {
  return (
    <Protegido rolRequerido="rrhh">
      <SaldosContenido />
    </Protegido>
  )
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    paddingVertical: space.s3,
    paddingHorizontal: space.s4,
  },
  filaBorde: { borderTopWidth: 1, borderTopColor: colors.border },
  nombre: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  rol: { fontSize: fontSize.xs, color: colors.text3 },
  saldo: {
    minWidth: 44,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.s2,
  },
  saldoTexto: { fontWeight: '700', fontSize: fontSize.md },
})
