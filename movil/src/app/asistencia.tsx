// src/app/asistencia.tsx
// Asistencia (RRHH/Admin): historial de jornadas y reporte mensual.
// Los datos vienen del backend, que consulta Workera y agrega las marcas
// (colación de 2 h descontada según regla vigente). Solo lectura.

import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  getHistorialAsistencia,
  getReporteMensual,
  type Jornada,
  type ReporteMensual,
} from '../api/asistencia'
import { Protegido } from '../auth/Protegido'
import { CampoFecha } from '../components/CampoFecha'
import { useToast } from '../components/Toast'
import {
  Boton,
  Campo,
  Card,
  Cargando,
  Encabezado,
  Pantalla,
  Selector,
  Vacio,
} from '../components/ui'
import { MESES, formatearFecha } from '../services/fechas'
import { colors, fontSize, radius, space } from '../theme/tokens'

type Vista = 'historial' | 'reporte'

function horaCorta(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
}

function AsistenciaContenido() {
  const notify = useToast()
  const hoy = new Date()

  const [vista, setVista] = useState<Vista>('historial')
  const [cargando, setCargando] = useState(false)

  // Historial
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [jornadas, setJornadas] = useState<Jornada[] | null>(null)

  // Reporte mensual
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [reporte, setReporte] = useState<ReporteMensual[] | null>(null)

  const cargarHistorial = useCallback(async () => {
    setCargando(true)
    try {
      const data = await getHistorialAsistencia({
        desde: desde || undefined,
        hasta: hasta || undefined,
      })
      setJornadas(data)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo cargar el historial.', 'error')
    } finally {
      setCargando(false)
    }
  }, [desde, hasta, notify])

  const cargarReporte = useCallback(async () => {
    setCargando(true)
    try {
      const data = await getReporteMensual(anio, mes)
      setReporte(data)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo cargar el reporte.', 'error')
    } finally {
      setCargando(false)
    }
  }, [anio, mes, notify])

  // Primera carga del historial (últimos días según backend).
  useEffect(() => {
    void cargarHistorial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const anios = [hoy.getFullYear(), hoy.getFullYear() - 1].map((a) => ({
    valor: a,
    etiqueta: String(a),
  }))
  const meses = MESES.map((m, i) => ({ valor: i + 1, etiqueta: m }))

  return (
    <Pantalla>
      <Encabezado
        titulo="Asistencia"
        subtitulo="Marcaje del personal vía Workera. Horas netas descuentan colación."
      />

      {/* Alternador Historial / Reporte */}
      <View style={styles.segmentos}>
        {(['historial', 'reporte'] as Vista[]).map((v) => (
          <Pressable
            key={v}
            onPress={() => setVista(v)}
            style={[styles.segmento, vista === v && styles.segmentoActivo]}
          >
            <Text style={[styles.segmentoTexto, vista === v && styles.segmentoTextoActivo]}>
              {v === 'historial' ? 'Historial' : 'Reporte mensual'}
            </Text>
          </Pressable>
        ))}
      </View>

      {vista === 'historial' ? (
        <>
          <Card>
            <View style={styles.filtros}>
              <View style={{ flex: 1 }}>
                <Campo etiqueta="Desde">
                  <CampoFecha valor={desde} onChange={setDesde} limpiable />
                </Campo>
              </View>
              <View style={{ flex: 1 }}>
                <Campo etiqueta="Hasta">
                  <CampoFecha valor={hasta} onChange={setHasta} limpiable />
                </Campo>
              </View>
            </View>
            <Boton titulo="Consultar" icono="search" onPress={() => void cargarHistorial()} />
          </Card>

          {cargando ? (
            <Cargando />
          ) : jornadas === null ? null : jornadas.length === 0 ? (
            <Card>
              <Vacio mensaje="Sin jornadas en el rango consultado." icono="time-outline" />
            </Card>
          ) : (
            jornadas.map((j, i) => (
              <Card key={`${j.trabajador_id}-${j.fecha}-${i}`}>
                <View style={styles.jornadaCabecera}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jornadaNombre}>
                      {j.nombre_trabajador ?? j.identificacion ?? '—'}
                    </Text>
                    <Text style={styles.jornadaMeta}>
                      {formatearFecha(j.fecha)}
                      {j.sucursal ? ` · ${j.sucursal}` : ''}
                    </Text>
                  </View>
                  <View style={styles.horas}>
                    <Text style={styles.horasValor}>
                      {j.horas_trabajadas === null || j.horas_trabajadas === undefined
                        ? 'En curso'
                        : `${j.horas_trabajadas.toFixed(1)} h`}
                    </Text>
                    <Text style={styles.horasEtiqueta}>netas</Text>
                  </View>
                </View>
                <View style={styles.marcas}>
                  <Text style={styles.marca}>Entrada: {horaCorta(j.hora_entrada)}</Text>
                  <Text style={styles.marca}>Salida: {horaCorta(j.hora_salida)}</Text>
                  {j.horas_brutas !== null && j.horas_brutas !== undefined && (
                    <Text style={styles.marca}>Brutas: {j.horas_brutas.toFixed(1)} h</Text>
                  )}
                </View>
              </Card>
            ))
          )}
        </>
      ) : (
        <>
          <Card>
            <View style={styles.filtros}>
              <View style={{ flex: 1 }}>
                <Campo etiqueta="Año">
                  <Selector valor={anio} opciones={anios} onChange={setAnio} />
                </Campo>
              </View>
              <View style={{ flex: 1 }}>
                <Campo etiqueta="Mes">
                  <Selector valor={mes} opciones={meses} onChange={setMes} />
                </Campo>
              </View>
            </View>
            <Boton
              titulo="Generar reporte"
              icono="stats-chart-outline"
              onPress={() => void cargarReporte()}
            />
          </Card>

          {cargando ? (
            <Cargando />
          ) : reporte === null ? null : reporte.length === 0 ? (
            <Card>
              <Vacio mensaje="Sin datos para ese mes." icono="stats-chart-outline" />
            </Card>
          ) : (
            reporte.map((r, i) => (
              <Card key={`${r.trabajador_id}-${i}`}>
                <Text style={styles.jornadaNombre}>
                  {r.nombre_trabajador ?? r.identificacion ?? '—'}
                </Text>
                <View style={styles.reporteGrid}>
                  <View style={styles.reporteDato}>
                    <Text style={styles.reporteValor}>{r.dias_asistidos}</Text>
                    <Text style={styles.reporteEtiqueta}>días asistidos</Text>
                  </View>
                  <View style={styles.reporteDato}>
                    <Text style={styles.reporteValor}>{r.horas_trabajadas.toFixed(1)}</Text>
                    <Text style={styles.reporteEtiqueta}>horas netas</Text>
                  </View>
                  <View style={styles.reporteDato}>
                    <Text style={styles.reporteValor}>{r.jornadas_completas}</Text>
                    <Text style={styles.reporteEtiqueta}>completas</Text>
                  </View>
                  <View style={styles.reporteDato}>
                    <Text
                      style={[
                        styles.reporteValor,
                        r.jornadas_incompletas > 0 && { color: colors.warning },
                      ]}
                    >
                      {r.jornadas_incompletas}
                    </Text>
                    <Text style={styles.reporteEtiqueta}>incompletas</Text>
                  </View>
                </View>
                {r.horas_promedio !== null && r.horas_promedio !== undefined && (
                  <Text style={styles.jornadaMeta}>
                    Promedio por jornada completa: {r.horas_promedio.toFixed(1)} h
                  </Text>
                )}
              </Card>
            ))
          )}
        </>
      )}
    </Pantalla>
  )
}

export default function AsistenciaScreen() {
  return (
    <Protegido rolRequerido="rrhh">
      <AsistenciaContenido />
    </Protegido>
  )
}

const styles = StyleSheet.create({
  segmentos: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmento: {
    flex: 1,
    paddingVertical: space.s2 + 2,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  segmentoActivo: { backgroundColor: colors.surface },
  segmentoTexto: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text3 },
  segmentoTextoActivo: { color: colors.primary },

  filtros: { flexDirection: 'row', gap: space.s3 },

  jornadaCabecera: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  jornadaNombre: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  jornadaMeta: { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },
  horas: { alignItems: 'flex-end' },
  horasValor: { fontSize: fontSize.md, fontWeight: '700', color: colors.primary },
  horasEtiqueta: { fontSize: 10, color: colors.text3 },
  marcas: { flexDirection: 'row', gap: space.s4, marginTop: space.s3, flexWrap: 'wrap' },
  marca: { fontSize: fontSize.sm, color: colors.text2 },

  reporteGrid: {
    flexDirection: 'row',
    marginVertical: space.s3,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: space.s3,
  },
  reporteDato: { flex: 1, alignItems: 'center' },
  reporteValor: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  reporteEtiqueta: { fontSize: 10, color: colors.text3, textAlign: 'center' },
})
