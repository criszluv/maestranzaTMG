// src/features/solicitudes/MisSolicitudesView.tsx
// Vista personal de solicitudes de días libres (espejo móvil de
// features/solicitudes/MisSolicitudes.tsx de la web): saldo de vacaciones,
// formulario de nueva solicitud (con foto-documento opcional) e historial.
// La usan la pestaña Solicitudes (empleado) y "Mis días libres" (rrhh/admin).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  createSolicitud,
  getMisSolicitudes,
  getMisVacaciones,
  subirAdjunto,
  type SaldoVacaciones,
  type Solicitud,
} from '../../api/solicitudes'
import { useAuth } from '../../auth/AuthContext'
import { CampoFecha } from '../../components/CampoFecha'
import { useToast } from '../../components/Toast'
import {
  Badge,
  Boton,
  Campo,
  Card,
  CardTitulo,
  Encabezado,
  Entrada,
  Pantalla,
  Pill,
  Selector,
  Vacio,
} from '../../components/ui'
import { diasHabiles, formatearFecha } from '../../services/fechas'
import type { ArchivoLocal } from '../../services/http'
import { elegirDeGaleria, tomarFoto } from '../../services/imagenes'
import { colors, fontSize, radius, space } from '../../theme/tokens'
import { AdjuntoSolicitud } from './AdjuntoSolicitud'

const TIPO_VACACIONES = 'Vacaciones'

const TIPOS = [
  { valor: 'Vacaciones', etiqueta: 'Vacaciones' },
  { valor: 'Permiso Administrativo', etiqueta: 'Permiso Administrativo' },
  { valor: 'Licencia Médica', etiqueta: 'Licencia Médica' },
]

export function MisSolicitudesView() {
  const { user } = useAuth()
  const notify = useToast()

  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [saldo, setSaldo] = useState<SaldoVacaciones | null>(null)
  const [refrescando, setRefrescando] = useState(false)

  // Formulario
  const [tipo, setTipo] = useState('Vacaciones')
  const [motivo, setMotivo] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [archivo, setArchivo] = useState<ArchivoLocal | null>(null)
  const [enviando, setEnviando] = useState(false)

  const cargarDatos = useCallback(async () => {
    if (!user) return
    try {
      const [data, saldoData] = await Promise.all([
        getMisSolicitudes(user.id),
        getMisVacaciones().catch(() => null),
      ])
      setSolicitudes(data)
      if (saldoData) setSaldo(saldoData)
    } catch (error) {
      console.warn('Error cargando solicitudes', error)
    }
  }, [user])

  useEffect(() => {
    void cargarDatos()
  }, [cargarDatos])

  const onRefresh = useCallback(async () => {
    setRefrescando(true)
    await cargarDatos()
    setRefrescando(false)
  }, [cargarDatos])

  // --- Validación de solapamiento (igual que la web) ---
  const errorValidacion = useMemo<string | null>(() => {
    if (!fechaInicio || !fechaFin) return null

    const dInicio = new Date(`${fechaInicio}T00:00:00`)
    const dFin = new Date(`${fechaFin}T00:00:00`)

    if (dFin < dInicio) {
      return 'La fecha de fin no puede ser anterior a la de inicio.'
    }

    const traslapa = solicitudes.some((s) => {
      if (s.estado !== 'Aprobada') return false
      const sInicio = new Date(`${s.fecha_inicio}T00:00:00`)
      const sEnd = new Date(`${s.fecha_fin}T00:00:00`)
      return dInicio <= sEnd && sInicio <= dFin
    })

    return traslapa ? 'Ya tienes una solicitud aprobada en estas fechas.' : null
  }, [fechaInicio, fechaFin, solicitudes])

  // Días hábiles de la solicitud actual (solo cuentan para Vacaciones)
  const diasSolicitud = useMemo(
    () => (tipo === TIPO_VACACIONES ? diasHabiles(fechaInicio, fechaFin) : 0),
    [tipo, fechaInicio, fechaFin],
  )

  // Advertencia (NO bloquea): días de vacaciones sobre el saldo disponible.
  const advertenciaVacaciones = useMemo<string | null>(() => {
    if (tipo !== TIPO_VACACIONES || !saldo || diasSolicitud === 0) return null
    if (diasSolicitud > saldo.dias_disponibles) {
      return `Atención: esta solicitud usa ${diasSolicitud} día(s) hábiles y solo te quedan ${saldo.dias_disponibles} de ${saldo.dias_anuales}. Puedes enviarla igual; RRHH decidirá.`
    }
    return null
  }, [tipo, saldo, diasSolicitud])

  const elegirArchivo = async (origen: 'camara' | 'galeria') => {
    try {
      const a = origen === 'camara' ? await tomarFoto() : await elegirDeGaleria()
      if (a) setArchivo(a)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo seleccionar la imagen.', 'error')
    }
  }

  const handleSubmit = async () => {
    if (!user || errorValidacion || enviando) return
    if (!fechaInicio || !fechaFin || !motivo.trim()) {
      notify('Completa tipo, fechas y motivo antes de enviar.', 'error')
      return
    }

    try {
      setEnviando(true)
      const creada = await createSolicitud({
        trabajador_id: user.id,
        tipo,
        motivo: motivo.trim(),
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      })
      if (archivo) {
        try {
          await subirAdjunto(creada.id, archivo)
        } catch (err) {
          notify(
            err instanceof Error
              ? `Solicitud enviada, pero el documento no se pudo adjuntar: ${err.message}`
              : 'Solicitud enviada, pero el documento no se pudo adjuntar.',
            'error',
          )
        }
      }
      notify('Tu solicitud fue enviada. RRHH la revisará pronto.', 'success')
      setMotivo('')
      setFechaInicio('')
      setFechaFin('')
      setArchivo(null)
      void cargarDatos()
    } catch (e) {
      notify(
        e instanceof Error ? e.message : 'No se pudo enviar la solicitud. Intenta de nuevo.',
        'error',
      )
    } finally {
      setEnviando(false)
    }
  }

  const totalSolicitudes = solicitudes.length
  const aprobadas = solicitudes.filter((s) => s.estado === 'Aprobada').length
  const pendientes = solicitudes.filter((s) => s.estado === 'Pendiente').length

  return (
    <Pantalla onRefresh={onRefresh} refrescando={refrescando}>
      <Encabezado
        titulo={`Hola, ${user?.nombre?.split(' ')[0] ?? ''}`}
        subtitulo="Solicita días libres y revisa el estado de tus solicitudes."
      />

      {/* Resumen */}
      <View style={styles.pills}>
        {saldo && (
          <Pill
            etiqueta={`Vacaciones ${saldo.anio}`}
            valor={`${saldo.dias_disponibles} / ${saldo.dias_anuales}`}
            tono={saldo.dias_disponibles <= 0 ? 'rojo' : 'azul'}
          />
        )}
        <Pill etiqueta="Total" valor={totalSolicitudes} />
        <Pill etiqueta="Aprobadas" valor={aprobadas} tono="verde" />
        <Pill etiqueta="Pendientes" valor={pendientes} tono="ambar" />
      </View>

      {/* Nueva solicitud */}
      <Card>
        <CardTitulo>Nueva solicitud</CardTitulo>

        <Campo etiqueta="Tipo de solicitud">
          <Selector valor={tipo} opciones={TIPOS} onChange={setTipo} />
        </Campo>

        <View style={styles.fechas}>
          <View style={{ flex: 1 }}>
            <Campo etiqueta="Desde">
              <CampoFecha valor={fechaInicio} onChange={setFechaInicio} />
            </Campo>
          </View>
          <View style={{ flex: 1 }}>
            <Campo etiqueta="Hasta">
              <CampoFecha valor={fechaFin} onChange={setFechaFin} />
            </Campo>
          </View>
        </View>

        {errorValidacion && (
          <View style={styles.avisoError}>
            <Text style={styles.avisoErrorTexto}>{errorValidacion}</Text>
          </View>
        )}

        <Campo etiqueta="Motivo / Comentarios">
          <Entrada
            value={motivo}
            onChangeText={setMotivo}
            placeholder="Describe brevemente la razón..."
            multiline
          />
        </Campo>

        {/* Foto-documento opcional */}
        <Campo etiqueta="Documento de respaldo (opcional)">
          <View style={styles.adjuntoFila}>
            <Boton
              titulo="Cámara"
              icono="camera-outline"
              variante="secundario"
              compacto
              onPress={() => elegirArchivo('camara')}
            />
            <Boton
              titulo="Galería"
              icono="images-outline"
              variante="secundario"
              compacto
              onPress={() => elegirArchivo('galeria')}
            />
            {archivo && (
              <Boton
                titulo="Quitar"
                icono="close-outline"
                variante="fantasma"
                compacto
                onPress={() => setArchivo(null)}
              />
            )}
          </View>
          <Text style={styles.ayuda}>
            Foto del documento · JPG, PNG o WebP · máx. 5 MB.
            {archivo ? ` Seleccionado: ${archivo.nombre}` : ''}
          </Text>
        </Campo>

        {tipo === TIPO_VACACIONES && diasSolicitud > 0 && (
          <Text style={styles.diasInfo}>
            Esta solicitud usa <Text style={{ fontWeight: '700' }}>{diasSolicitud}</Text> día(s)
            hábiles.
          </Text>
        )}

        {advertenciaVacaciones && (
          <View style={styles.avisoAdvertencia}>
            <Text style={styles.avisoAdvertenciaTexto}>⚠ {advertenciaVacaciones}</Text>
          </View>
        )}

        <Boton
          titulo={enviando ? 'Enviando…' : 'Enviar solicitud'}
          onPress={handleSubmit}
          deshabilitado={!!errorValidacion}
          cargando={enviando}
        />
      </Card>

      {/* Historial */}
      <Card>
        <CardTitulo>Historial reciente</CardTitulo>
        {solicitudes.length === 0 ? (
          <Vacio mensaje="No tienes solicitudes registradas." icono="calendar-outline" />
        ) : (
          solicitudes.map((s) => (
            <View key={s.id} style={styles.item}>
              <View style={styles.itemCabecera}>
                <Text style={styles.itemTipo}>{s.tipo}</Text>
                <Badge texto={s.estado} />
              </View>
              <Text style={styles.itemFechas}>
                {formatearFecha(s.fecha_inicio)} al {formatearFecha(s.fecha_fin)}
                {s.tipo === TIPO_VACACIONES && (s.dias_habiles ?? 0) > 0
                  ? ` · ${s.dias_habiles} día(s) hábiles`
                  : ''}
              </Text>
              <Text style={styles.itemMotivo}>"{s.motivo}"</Text>
              <View style={{ marginTop: space.s2 }}>
                <AdjuntoSolicitud
                  solicitudId={s.id}
                  tieneAdjunto={!!s.tiene_adjunto}
                  puedeEditar={s.estado === 'Pendiente'}
                  onCambio={() => void cargarDatos()}
                />
              </View>
            </View>
          ))
        )}
      </Card>
    </Pantalla>
  )
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  fechas: { flexDirection: 'row', gap: space.s3 },
  adjuntoFila: { flexDirection: 'row', gap: space.s2, flexWrap: 'wrap' },
  ayuda: { fontSize: fontSize.xs, color: colors.text3, marginTop: space.s1 },
  diasInfo: { fontSize: fontSize.xs, color: colors.text2, marginBottom: space.s2 },

  avisoError: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    padding: space.s3,
    marginBottom: space.s4,
  },
  avisoErrorTexto: { color: colors.danger, fontSize: fontSize.sm },
  avisoAdvertencia: {
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.md,
    padding: space.s3,
    marginBottom: space.s4,
  },
  avisoAdvertenciaTexto: { color: colors.warning, fontSize: fontSize.sm },

  item: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: space.s3,
    gap: 3,
  },
  itemCabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTipo: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  itemFechas: { fontSize: fontSize.sm, color: colors.text2 },
  itemMotivo: { fontSize: fontSize.sm, color: colors.text3, fontStyle: 'italic' },
})
