// src/app/(tabs)/index.tsx
// Panel de planta: dashboard de sensores IoT. Última lectura por máquina
// + historial reciente. Se refresca solo cada 15 s y con pull-to-refresh.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { descargarReporteCsv, fetchMetricas, type IotMetrica } from '../../api/sensores'
import { useToast } from '../../components/Toast'
import {
  Boton,
  Card,
  CardTitulo,
  Cargando,
  Encabezado,
  Pantalla,
  Vacio,
} from '../../components/ui'
import { formatearFechaHora } from '../../services/fechas'
import { colors, fontSize, radius, space } from '../../theme/tokens'

const INTERVALO_REFRESCO_MS = 15_000

function num(v: number | string): number {
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : NaN
}

/** Última lectura de cada máquina (las métricas llegan más recientes primero). */
function ultimasPorMaquina(metricas: IotMetrica[]): IotMetrica[] {
  const vistas = new Set<string>()
  const ultimas: IotMetrica[] = []
  for (const m of metricas) {
    if (!vistas.has(m.maquina)) {
      vistas.add(m.maquina)
      ultimas.push(m)
    }
  }
  return ultimas
}

function ValorSensor({
  icono,
  valor,
  unidad,
  alerta,
}: {
  icono: keyof typeof Ionicons.glyphMap
  valor: number
  unidad: string
  alerta?: boolean
}) {
  const color = alerta ? colors.danger : colors.text
  return (
    <View style={styles.valorSensor}>
      <Ionicons name={icono} size={15} color={alerta ? colors.danger : colors.text3} />
      <Text style={[styles.valorTexto, { color }]}>
        {Number.isNaN(valor) ? '—' : valor.toFixed(1)}
        <Text style={styles.unidad}> {unidad}</Text>
      </Text>
    </View>
  )
}

export default function PanelPlanta() {
  const notify = useToast()
  const [metricas, setMetricas] = useState<IotMetrica[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [exportando, setExportando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const data = await fetchMetricas(30)
      setMetricas(data)
    } catch (e) {
      // Silencioso en el polling; el usuario ve datos antiguos y puede
      // forzar con pull-to-refresh (ahí sí notificamos).
      console.warn('Error cargando métricas IoT', e)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
    const timer = setInterval(() => void cargar(), INTERVALO_REFRESCO_MS)
    return () => clearInterval(timer)
  }, [cargar])

  const onRefresh = useCallback(async () => {
    setRefrescando(true)
    try {
      const data = await fetchMetricas(30)
      setMetricas(data)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudieron cargar las métricas.', 'error')
    } finally {
      setRefrescando(false)
    }
  }, [notify])

  const maquinas = useMemo(() => ultimasPorMaquina(metricas), [metricas])

  const handleExportar = async () => {
    setExportando(true)
    try {
      await descargarReporteCsv()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Error al descargar el reporte.', 'error')
    } finally {
      setExportando(false)
    }
  }

  if (cargando) return <Cargando />

  return (
    <Pantalla onRefresh={onRefresh} refrescando={refrescando}>
      <Encabezado
        titulo="Estado de máquinas"
        subtitulo="Última lectura de cada máquina. Se actualiza automáticamente."
      />

      {maquinas.length === 0 ? (
        <Card>
          <Vacio mensaje="Sin lecturas de sensores por ahora." icono="hardware-chip-outline" />
        </Card>
      ) : (
        maquinas.map((m) => {
          const temp = num(m.temperatura)
          return (
            <Card key={m.maquina}>
              <View style={styles.maquinaCabecera}>
                <View style={styles.maquinaIcono}>
                  <Ionicons name="cog-outline" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.maquinaNombre}>{m.maquina}</Text>
                  <Text style={styles.maquinaFecha}>{formatearFechaHora(m.timestamp)}</Text>
                </View>
              </View>
              <View style={styles.sensores}>
                <ValorSensor
                  icono="thermometer-outline"
                  valor={temp}
                  unidad="°C"
                  alerta={temp >= 80}
                />
                <ValorSensor icono="water-outline" valor={num(m.humedad)} unidad="%" />
                <ValorSensor icono="flash-outline" valor={num(m.consumo_kw)} unidad="kW" />
              </View>
            </Card>
          )
        })
      )}

      {/* Historial reciente */}
      <Card>
        <CardTitulo>Lecturas recientes</CardTitulo>
        {metricas.length === 0 ? (
          <Vacio mensaje="Sin historial disponible." />
        ) : (
          metricas.slice(0, 15).map((m) => (
            <View key={m.id} style={styles.filaHistorial}>
              <View style={{ flex: 1 }}>
                <Text style={styles.histMaquina}>{m.maquina}</Text>
                <Text style={styles.histFecha}>{formatearFechaHora(m.timestamp)}</Text>
              </View>
              <Text style={styles.histValores}>
                {num(m.temperatura).toFixed(1)}°C · {num(m.humedad).toFixed(0)}% ·{' '}
                {num(m.consumo_kw).toFixed(1)} kW
              </Text>
            </View>
          ))
        )}
      </Card>

      <Boton
        titulo="Exportar histórico CSV"
        icono="download-outline"
        variante="secundario"
        onPress={handleExportar}
        cargando={exportando}
      />
    </Pantalla>
  )
}

const styles = StyleSheet.create({
  maquinaCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    marginBottom: space.s3,
  },
  maquinaIcono: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  maquinaNombre: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  maquinaFecha: { fontSize: fontSize.xs, color: colors.text3 },
  sensores: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: space.s3,
  },
  valorSensor: { flexDirection: 'row', alignItems: 'center', gap: space.s1 + 2 },
  valorTexto: { fontSize: fontSize.md, fontWeight: '700' },
  unidad: { fontSize: fontSize.xs, fontWeight: '400', color: colors.text3 },

  filaHistorial: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    paddingVertical: space.s2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  histMaquina: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  histFecha: { fontSize: fontSize.xs, color: colors.text3 },
  histValores: { fontSize: fontSize.xs, color: colors.text2, fontWeight: '600' },
})
