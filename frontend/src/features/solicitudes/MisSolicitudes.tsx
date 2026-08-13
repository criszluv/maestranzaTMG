import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import '../../styles/App.css'
import {
  type Solicitud,
  type SaldoVacaciones,
  getMisSolicitudes,
  createSolicitud,
  getMisVacaciones,
  subirAdjunto,
} from './api'
import AdjuntoSolicitud from './AdjuntoSolicitud'

import { useAuth } from '../auth/AuthContext'
import { useToast } from '../../components/common/Toast'

type CalendarView = 'month' | 'year' | 'decade' | 'century'

const TIPO_VACACIONES = 'Vacaciones'
const MAX_ADJUNTO_MB = 50

/** Días hábiles (lun-vie) en [inicio, fin]; espeja el backend. */
function diasHabiles(inicioISO: string, finISO: string): number {
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

export default function MisSolicitudes() {
  const { user } = useAuth()
  const notify = useToast()

  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [saldo, setSaldo] = useState<SaldoVacaciones | null>(null)

  // Formulario de Solicitudes
  const [tipo, setTipo] = useState('Vacaciones')
  const [motivo, setMotivo] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Archivo (foto-documento) a adjuntar junto con la solicitud (opcional)
  const [archivo, setArchivo] = useState<File | null>(null)
  const archivoRef = useRef<HTMLInputElement>(null)

  // --- FUNCIONES ASÍNCRONAS ---

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
      console.error('Error cargando solicitudes', error)
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    let cancelado = false
    getMisSolicitudes(user.id)
      .then((data) => {
        if (!cancelado) setSolicitudes(data)
      })
      .catch((error) => console.error('Error cargando solicitudes', error))
    getMisVacaciones()
      .then((s) => {
        if (!cancelado) setSaldo(s)
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [user])

  // --- VALIDACION DE SOLAPAMIENTO (estado derivado, sin efectos) ---
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

  // --------- SOLICITUDES: CREAR ---------

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!user || errorValidacion || enviando) return

    try {
      setEnviando(true)
      const creada = await createSolicitud({
        trabajador_id: user.id,
        tipo,
        motivo,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      })
      // Adjuntar la foto-documento, si el trabajador seleccionó una.
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
      if (archivoRef.current) archivoRef.current.value = ''
      void cargarDatos()
    } catch (e) {
      console.error(e)
      notify(
        e instanceof Error
          ? e.message
          : 'No se pudo enviar la solicitud. Intenta de nuevo.',
        'error',
      )
    } finally {
      setEnviando(false)
    }
  }

  // --- DERIVADOS PARA UI (solo lectura) ---
  const totalSolicitudes = solicitudes.length
  const aprobadas = solicitudes.filter((s) => s.estado === 'Aprobada').length
  const pendientes = solicitudes.filter((s) => s.estado === 'Pendiente').length

  // --- UTILITIES DE RENDERIZADO ---

  const tileClassName = ({
    date,
    view,
  }: {
    date: Date
    view: CalendarView
  }) => {
    if (view !== 'month') return undefined

    const found = solicitudes.find((s) => {
      if (s.estado !== 'Aprobada') return false

      const dInicio = new Date(`${s.fecha_inicio}T00:00:00`)
      const dFin = new Date(`${s.fecha_fin}T00:00:00`)

      const current = new Date(date)
      current.setHours(0, 0, 0, 0)
      dInicio.setHours(0, 0, 0, 0)
      dFin.setHours(0, 0, 0, 0)

      return current >= dInicio && current <= dFin
    })

    return found ? 'dia-aprobado' : undefined
  }

  const getStatusBadge = (estado: string) => {
    const baseStyle = {
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: 'bold',
      textTransform: 'uppercase' as const,
    }

    if (estado === 'Aprobada') {
      return (
        <span
          style={{
            ...baseStyle,
            background: 'rgba(76, 175, 80, 0.2)',
            color: '#4caf50',
          }}
        >
          Aprobada
        </span>
      )
    }
    if (estado === 'Rechazada') {
      return (
        <span
          style={{
            ...baseStyle,
            background: 'rgba(244, 67, 54, 0.2)',
            color: '#f44336',
          }}
        >
          Rechazada
        </span>
      )
    }
    return (
      <span
        style={{
          ...baseStyle,
          background: 'rgba(255, 152, 0, 0.2)',
          color: '#ff9800',
        }}
      >
        Pendiente
      </span>
    )
  }

  return (
    <div className="page-container">
      {/* ENCABEZADO */}
      <header className="page-header">
        <div>
          <h2>Hola, {user?.nombre?.split(' ')[0]}</h2>
          <p>Solicita días libres y revisa el estado de tus solicitudes.</p>
        </div>

        {/* Resumen de métricas personales */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {saldo && (
            <div
              className={`pill${saldo.dias_disponibles <= 0 ? ' pill--red' : ' pill--blue'}`}
              title={`Vacaciones ${saldo.anio}: ${saldo.dias_usados} usados de ${saldo.dias_anuales}`}
            >
              Vacaciones: <strong>{saldo.dias_disponibles}</strong> / {saldo.dias_anuales} días
            </div>
          )}
          <div className="pill">Total: <strong>{totalSolicitudes}</strong></div>
          <div className="pill pill--green">Aprobadas: <strong>{aprobadas}</strong></div>
          <div className="pill pill--amber">Pendientes: <strong>{pendientes}</strong></div>
        </div>
      </header>

      {/* GRID DE FORMULARIO Y CALENDARIO */}
      <div className="dashboard-grid">
        {/* COLUMNA 1: Formulario */}
        <div className="column">
          <div className="card">
            <h3 className="card-title">Nueva solicitud</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Tipo de solicitud</label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  className="input-dark"
                >
                  <option>Vacaciones</option>
                  <option>Permiso Administrativo</option>
                  <option>Licencia Médica</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '15px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Desde</label>
                  <input
                    type="date"
                    required
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="input-dark"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Hasta</label>
                  <input
                    type="date"
                    required
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                    className="input-dark"
                  />
                </div>
              </div>

              {errorValidacion && (
                <div
                  style={{
                    backgroundColor: 'rgba(220,38,38,0.06)',
                    color: '#b91c1c',
                    padding: '10px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    marginBottom: '15px',
                    border: '1px solid rgba(220,38,38,0.4)',
                  }}
                >
                  {errorValidacion}
                </div>
              )}

              <div className="form-group">
                <label>Motivo / Comentarios</label>
                <textarea
                  required
                  rows={4}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="input-dark"
                  placeholder="Describe brevemente la razón..."
                />
              </div>

              {/* Foto-documento opcional (respaldo de la solicitud) */}
              <div className="form-group">
                <label>Documento de respaldo (opcional)</label>
                <input
                  ref={archivoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                  className="input-dark"
                />
                <small style={{ fontSize: 11, opacity: 0.7 }}>
                  Foto del documento · JPG, PNG o WebP · máx. {MAX_ADJUNTO_MB} MB.
                  {archivo ? ` Seleccionado: ${archivo.name}` : ''}
                </small>
              </div>

              {tipo === TIPO_VACACIONES && diasSolicitud > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>
                  Esta solicitud usa <strong>{diasSolicitud}</strong> día(s) hábiles.
                </div>
              )}

              {advertenciaVacaciones && (
                <div
                  style={{
                    backgroundColor: 'rgba(245,158,11,0.08)',
                    color: '#92400e',
                    padding: '10px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    marginBottom: '15px',
                    border: '1px solid rgba(245,158,11,0.4)',
                  }}
                >
                  ⚠ {advertenciaVacaciones}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary"
                disabled={!!errorValidacion || enviando}
                style={{
                  opacity: errorValidacion || enviando ? 0.5 : 1,
                  cursor: errorValidacion ? 'not-allowed' : enviando ? 'wait' : 'pointer',
                  borderRadius: 999,
                  fontWeight: 600,
                }}
              >
                {enviando ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </form>
          </div>
        </div>

        {/* COLUMNA 2: Historial */}
        <div className="column">
          <div className="card" style={{ height: '100%' }}>
            <h3 className="card-title">Historial reciente</h3>
            {solicitudes.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100px',
                  opacity: 0.5,
                  fontSize: 13,
                }}
              >
                No tienes solicitudes registradas.
              </div>
            ) : (
              <div>
                {solicitudes.map((s) => (
                  <div key={s.id} className="history-item">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 'bold',
                          fontSize: '15px',
                          color: '#111827',
                        }}
                      >
                        {s.tipo}
                      </span>
                      {getStatusBadge(s.estado)}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                      {s.fecha_inicio} al {s.fecha_fin}
                      {s.tipo === TIPO_VACACIONES && (s.dias_habiles ?? 0) > 0 && (
                        <span style={{ color: '#6b7280' }}>
                          {' '}· {s.dias_habiles} día(s) hábiles
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: '13px',
                        color: '#6b7280',
                        marginTop: '4px',
                        fontStyle: 'italic',
                      }}
                    >
                      "{s.motivo}"
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <AdjuntoSolicitud
                        solicitudId={s.id}
                        tieneAdjunto={!!s.tiene_adjunto}
                        puedeEditar={s.estado === 'Pendiente'}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA 3: Calendario */}
        <div className="column">
          <div className="card">
            <h3 className="card-title">Calendario</h3>
            <div>
              <Calendar tileClassName={tileClassName} />
            </div>
            <div
              style={{
                marginTop: '15px',
                fontSize: '12px',
                color: '#6b7280',
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  background: '#2e7d32',
                  borderRadius: '50%',
                }}
              />
              Días aprobados
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
