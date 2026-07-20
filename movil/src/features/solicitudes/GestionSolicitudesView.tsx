// src/features/solicitudes/GestionSolicitudesView.tsx
// Gestión de solicitudes del equipo (RRHH/Admin): filtrar por estado,
// revisar el detalle (con documento de respaldo) y aprobar/rechazar.
// Cualquier rrhh/admin puede aprobar, incluidas las propias (regla actual).

import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  getSolicitudes,
  updateEstadoSolicitud,
  type Solicitud,
} from '../../api/solicitudes'
import { useConfirm } from '../../components/Confirm'
import { useToast } from '../../components/Toast'
import {
  Badge,
  Boton,
  Card,
  Cargando,
  Encabezado,
  Pantalla,
  Pill,
  Selector,
  Vacio,
} from '../../components/ui'
import { formatearFecha } from '../../services/fechas'
import { colors, fontSize, space } from '../../theme/tokens'
import { AdjuntoSolicitud } from './AdjuntoSolicitud'

type Filtro = 'Todas' | 'Pendiente' | 'Aprobada' | 'Rechazada'

const FILTROS = [
  { valor: 'Todas' as Filtro, etiqueta: 'Todas' },
  { valor: 'Pendiente' as Filtro, etiqueta: 'Pendientes' },
  { valor: 'Aprobada' as Filtro, etiqueta: 'Aprobadas' },
  { valor: 'Rechazada' as Filtro, etiqueta: 'Rechazadas' },
]

export function GestionSolicitudesView() {
  const notify = useToast()
  const confirm = useConfirm()

  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('Pendiente')
  const [procesando, setProcesando] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    try {
      const data = await getSolicitudes()
      setSolicitudes(data)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudieron cargar las solicitudes.', 'error')
    } finally {
      setCargando(false)
    }
  }, [notify])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const onRefresh = useCallback(async () => {
    setRefrescando(true)
    await cargar()
    setRefrescando(false)
  }, [cargar])

  const visibles = useMemo(
    () => (filtro === 'Todas' ? solicitudes : solicitudes.filter((s) => s.estado === filtro)),
    [solicitudes, filtro],
  )

  const pendientes = solicitudes.filter((s) => s.estado === 'Pendiente').length

  const resolver = async (s: Solicitud, estado: 'Aprobada' | 'Rechazada') => {
    const ok = await confirm({
      titulo: estado === 'Aprobada' ? 'Aprobar solicitud' : 'Rechazar solicitud',
      mensaje: `${s.nombre_trabajador ?? `Trabajador #${s.trabajador_id}`} · ${s.tipo}\n${formatearFecha(s.fecha_inicio)} al ${formatearFecha(s.fecha_fin)}`,
      textoConfirmar: estado === 'Aprobada' ? 'Aprobar' : 'Rechazar',
      peligro: estado === 'Rechazada',
    })
    if (!ok) return

    setProcesando(s.id)
    try {
      await updateEstadoSolicitud(s.id, estado)
      notify(`Solicitud ${estado.toLowerCase()}.`, 'success')
      await cargar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo actualizar la solicitud.', 'error')
    } finally {
      setProcesando(null)
    }
  }

  if (cargando) return <Cargando />

  return (
    <Pantalla onRefresh={onRefresh} refrescando={refrescando}>
      <Encabezado
        titulo="Solicitudes del equipo"
        subtitulo="Aprueba o rechaza las solicitudes de días libres."
      />

      <View style={styles.fila}>
        <Pill etiqueta="Pendientes" valor={pendientes} tono={pendientes > 0 ? 'ambar' : 'verde'} />
        <Pill etiqueta="Total" valor={solicitudes.length} />
      </View>

      <View style={styles.filtros}>
        <View style={{ flex: 1 }}>
          <Selector valor={filtro} opciones={FILTROS} onChange={setFiltro} />
        </View>
        <Boton
          titulo="Saldos"
          icono="sunny-outline"
          variante="secundario"
          onPress={() => router.push('/saldos')}
        />
      </View>

      {visibles.length === 0 ? (
        <Card>
          <Vacio
            mensaje={
              filtro === 'Pendiente'
                ? 'No hay solicitudes pendientes por revisar.'
                : 'No hay solicitudes en esta categoría.'
            }
            icono="checkmark-done-outline"
          />
        </Card>
      ) : (
        visibles.map((s) => (
          <Card key={s.id}>
            <View style={styles.cabecera}>
              <View style={{ flex: 1 }}>
                <Text style={styles.trabajador}>
                  {s.nombre_trabajador ?? `Trabajador #${s.trabajador_id}`}
                </Text>
                <Text style={styles.tipo}>{s.tipo}</Text>
              </View>
              <Badge texto={s.estado} />
            </View>

            <Text style={styles.fechas}>
              {formatearFecha(s.fecha_inicio)} al {formatearFecha(s.fecha_fin)}
              {(s.dias_habiles ?? 0) > 0 ? ` · ${s.dias_habiles} día(s) hábiles` : ''}
            </Text>
            {!!s.motivo && <Text style={styles.motivo}>"{s.motivo}"</Text>}

            {s.tiene_adjunto && (
              <View style={{ marginTop: space.s2 }}>
                <AdjuntoSolicitud
                  solicitudId={s.id}
                  tieneAdjunto
                  puedeEditar={false}
                />
              </View>
            )}

            {s.estado === 'Pendiente' && (
              <View style={styles.acciones}>
                <Boton
                  titulo="Rechazar"
                  variante="secundario"
                  compacto
                  icono="close-outline"
                  onPress={() => resolver(s, 'Rechazada')}
                  deshabilitado={procesando === s.id}
                />
                <Boton
                  titulo="Aprobar"
                  compacto
                  icono="checkmark-outline"
                  onPress={() => resolver(s, 'Aprobada')}
                  cargando={procesando === s.id}
                />
              </View>
            )}
          </Card>
        ))
      )}
    </Pantalla>
  )
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  filtros: { flexDirection: 'row', gap: space.s3, alignItems: 'center' },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.s3,
    marginBottom: space.s2,
  },
  trabajador: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  tipo: { fontSize: fontSize.sm, color: colors.text2 },
  fechas: { fontSize: fontSize.sm, color: colors.text2 },
  motivo: { fontSize: fontSize.sm, color: colors.text3, fontStyle: 'italic', marginTop: 2 },
  acciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.s2,
    marginTop: space.s3,
  },
})
