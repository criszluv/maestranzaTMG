// src/features/solicitudes/GestionSolicitudesRRHH.tsx
// Vista de RRHH: aprueba/rechaza solicitudes de días libres y visualiza el
// calendario de ausencias. El historial de marcaje vive en su propia
// sección (/rrhh/asistencia), enlazada desde el encabezado y el navbar.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import '../../styles/App.css'
import {
  getSolicitudes,
  updateEstadoSolicitud,
  type Solicitud,
} from './api'
import AdjuntoSolicitud from './AdjuntoSolicitud'
import SaldosVacaciones from './SaldosVacaciones'
import Paginador from '../../components/common/Paginador'
import { useConfirm } from '../../components/common/ConfirmDialog'
import { useToast } from '../../components/common/Toast'

type CalendarView = 'month' | 'year' | 'decade' | 'century'
type EstadoSolicitud = 'Pendiente' | 'Aprobada' | 'Rechazada'
type FiltroEstado = 'Todas' | EstadoSolicitud

/** El historial completo es largo: se pagina para que la vista sea usable. */
const POR_PAGINA = 5
const FILTROS: FiltroEstado[] = ['Todas', 'Pendiente', 'Aprobada', 'Rechazada']

export default function GestionSolicitudesRRHH() {
  const confirm = useConfirm()
  const notify = useToast()

  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<FiltroEstado>('Todas')
  const [pagina, setPagina] = useState(1)

  const cargarSolicitudes = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getSolicitudes()
      setSolicitudes(data)
    } catch (error) {
      console.error('Error cargando solicitudes', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargarSolicitudes()
  }, [cargarSolicitudes])

  const handleEstado = async (s: Solicitud, nuevoEstado: EstadoSolicitud) => {
    const nombre = s.nombre_trabajador || 'este trabajador'
    const verbo = nuevoEstado === 'Aprobada' ? 'Aprobar' : 'Rechazar'

    const confirmado = await confirm({
      title: `${verbo} solicitud de ${s.tipo.toLowerCase()}`,
      message: `${nombre} pidió ${s.tipo.toLowerCase()} del ${s.fecha_inicio} al ${s.fecha_fin}. ¿Confirmas marcarla como "${nuevoEstado}"?`,
      confirmText: verbo,
      danger: nuevoEstado === 'Rechazada',
    })
    if (!confirmado) return

    try {
      await updateEstadoSolicitud(s.id, nuevoEstado)
      await cargarSolicitudes()
      notify(`Solicitud de ${nombre} marcada como "${nuevoEstado}".`, 'success')
    } catch (error) {
      console.error('Error al actualizar estado de solicitud', error)
      notify(
        error instanceof Error
          ? error.message
          : 'No se pudo actualizar el estado de la solicitud. Intenta de nuevo.',
        'error',
      )
    }
  }

  // --- MÉTRICAS DERIVADAS SOLO PARA UI ---
  const totalSolicitudes = solicitudes.length
  const pendientes = solicitudes.filter((s) => s.estado === 'Pendiente').length
  const aprobadas = solicitudes.filter((s) => s.estado === 'Aprobada').length

  // --- FILTRO + PAGINACIÓN (el calendario sigue usando la lista completa) ---
  const filtradas = useMemo(
    () => (filtro === 'Todas' ? solicitudes : solicitudes.filter((s) => s.estado === filtro)),
    [solicitudes, filtro],
  )

  // Si al aprobar/filtrar la página actual se queda sin filas, se retrocede.
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)
  const visibles = filtradas.slice(
    (paginaActual - 1) * POR_PAGINA,
    paginaActual * POR_PAGINA,
  )

  const cambiarFiltro = (nuevo: FiltroEstado) => {
    setFiltro(nuevo)
    setPagina(1)
  }

  const renderBadge = (estado: EstadoSolicitud) => {
    let clase = 'badge-pendiente'
    if (estado === 'Aprobada') clase = 'badge-aprobada'
    if (estado === 'Rechazada') clase = 'badge-rechazada'
    return <span className={`badge ${clase}`}>{estado}</span>
  }

  // Renderizado de contenido del Calendario
  const tileContent = ({ date, view }: { date: Date; view: CalendarView }) => {
    if (view !== 'month') return null

    const gente = solicitudes
      .filter((s) => {
        if (s.estado !== 'Aprobada') return false

        const d1 = new Date(`${s.fecha_inicio}T00:00:00`)
        const d2 = new Date(`${s.fecha_fin}T00:00:00`)
        const current = new Date(date)

        current.setHours(0, 0, 0, 0)
        d1.setHours(0, 0, 0, 0)
        d2.setHours(0, 0, 0, 0)

        return current >= d1 && current <= d2
      })
      .map((s) =>
        s.nombre_trabajador ? s.nombre_trabajador.split(' ')[0] : 'Anon',
      )

    if (gente.length === 0) return null

    return (
      <div className="calendar-names">
        {gente.length > 2 ? `${gente.length} Ausentes` : gente.join(', ')}
      </div>
    )
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h2>Gestión de solicitudes</h2>
          <p>
            Administra las solicitudes de días libres. El marcaje está en{' '}
            <Link to="/rrhh/asistencia" style={{ color: 'var(--primary)', fontWeight: 600 }}>
              Asistencia →
            </Link>
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div className="pill pill--blue">Total: <strong>{totalSolicitudes}</strong></div>
          <div className="pill pill--green">Aprobadas: <strong>{aprobadas}</strong></div>
          <div className="pill pill--amber">Pendientes: <strong>{pendientes}</strong></div>
        </div>
      </header>

      <div className="dashboard-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        {/* COLUMNA IZQUIERDA: Solicitudes */}
        <div className="column">
          <div className="card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 12,
              }}
            >
              <h3 className="card-title" style={{ margin: 0 }}>Solicitudes</h3>

              {/* Filtro rápido: el historial completo crece sin parar */}
              <div style={{ display: 'flex', gap: 4 }}>
                {FILTROS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => cambiarFiltro(f)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 'var(--radius-full)',
                      border: `1px solid ${filtro === f ? 'var(--primary)' : 'var(--border)'}`,
                      background: filtro === f ? 'var(--primary-soft)' : 'var(--surface)',
                      color: filtro === f ? 'var(--primary)' : 'var(--text-3)',
                      fontSize: 12,
                      fontWeight: filtro === f ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="table-container">
              {loading && solicitudes.length === 0 ? (
                <p style={{ textAlign: 'center' }}>Cargando datos...</p>
              ) : filtradas.length === 0 ? (
                <p style={{ textAlign: 'center', opacity: 0.5 }}>
                  {solicitudes.length === 0
                    ? 'No hay solicitudes registradas.'
                    : `No hay solicitudes en "${filtro}".`}
                </p>
              ) : (
                <table className="rrhh-table">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th>Tipo / Motivo</th>
                      <th>Fechas</th>
                      <th>Estado</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 'bold' }}>
                          {s.nombre_trabajador || 'Usuario desconocido'}
                        </td>
                        <td>
                          <div>{s.tipo}</div>
                          <div
                            style={{
                              fontSize: '12px',
                              opacity: 0.6,
                              marginTop: '2px',
                              fontStyle: 'italic',
                            }}
                          >
                            {s.motivo}
                          </div>
                          <div style={{ marginTop: 6 }}>
                            <AdjuntoSolicitud
                              solicitudId={s.id}
                              tieneAdjunto={!!s.tiene_adjunto}
                            />
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: '13px' }}>Desde: {s.fecha_inicio}</div>
                          <div style={{ fontSize: '13px' }}>Hasta: {s.fecha_fin}</div>
                          {s.tipo === 'Vacaciones' && (s.dias_habiles ?? 0) > 0 && (
                            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                              {s.dias_habiles} día(s) hábiles
                            </div>
                          )}
                        </td>
                        <td>{renderBadge(s.estado as EstadoSolicitud)}</td>
                        <td>
                          {s.estado === 'Pendiente' && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className="action-btn btn-approve"
                                onClick={() => handleEstado(s, 'Aprobada')}
                                title="Aprobar esta solicitud"
                              >
                                Aprobar
                              </button>
                              <button
                                className="action-btn btn-reject"
                                onClick={() => handleEstado(s, 'Rechazada')}
                                title="Rechazar esta solicitud"
                              >
                                Rechazar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <Paginador
              pagina={paginaActual}
              totalItems={filtradas.length}
              porPagina={POR_PAGINA}
              onCambiar={setPagina}
              etiqueta="solicitudes"
            />
          </div>
        </div>

        {/* COLUMNA DERECHA: Calendario Global */}
        <div className="column">
          <div className="card" style={{ position: 'sticky', top: 20 }}>
            <h3 className="card-title">Calendario de ausencias</h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 0, marginBottom: 15 }}>
              Visualiza quién estará ausente (solicitudes aprobadas).
            </p>
            <div>
              <Calendar tileContent={tileContent} />
            </div>
          </div>
        </div>
      </div>

      {/* Saldos de vacaciones por trabajador */}
      <div style={{ marginTop: 20 }}>
        <SaldosVacaciones />
      </div>
    </div>
  )
}
