// src/features/solicitudes/SolicitudesAdmin.tsx
// Vista de ADMIN: aprueba/rechaza solicitudes de todos los trabajadores.
import { useEffect, useState, useCallback } from 'react'
import '../../styles/App.css'
import { getSolicitudes, updateEstadoSolicitud, type Solicitud } from './api'
import AdjuntoSolicitud from './AdjuntoSolicitud'
import SaldosVacaciones from './SaldosVacaciones'
import { useConfirm } from '../../components/common/ConfirmDialog'
import { useToast } from '../../components/common/Toast'
import { EmptyState } from '../../components/common/EmptyState'

type EstadoSolicitud = 'Pendiente' | 'Aprobada' | 'Rechazada'

export default function SolicitudesAdmin() {
  const confirm = useConfirm()
  const notify = useToast()

  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
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
    void cargar()
  }, [cargar])

  const total = solicitudes.length
  const aprobadas = solicitudes.filter((s) => s.estado === 'Aprobada').length
  const pendientes = solicitudes.filter((s) => s.estado === 'Pendiente').length

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
      await cargar()
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

  const renderBadge = (estado: EstadoSolicitud) => {
    let clase = 'badge-pendiente'
    if (estado === 'Aprobada') clase = 'badge-aprobada'
    if (estado === 'Rechazada') clase = 'badge-rechazada'
    return <span className={`badge ${clase}`}>{estado}</span>
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h2>Solicitudes RRHH</h2>
          <p>Aprueba o rechaza solicitudes de vacaciones, permisos y licencias de todos los trabajadores.</p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div className="pill pill--blue">Total: <strong>{total}</strong></div>
          <div className="pill pill--green">Aprobadas: <strong>{aprobadas}</strong></div>
          <div className="pill pill--amber">Pendientes: <strong>{pendientes}</strong></div>
        </div>
      </header>

      <div className="card">
        <div className="table-container">
          {loading && solicitudes.length === 0 ? (
            <p style={{ textAlign: 'center' }}>Cargando solicitudes…</p>
          ) : solicitudes.length === 0 ? (
            <EmptyState icon="solicitudes" title="No hay solicitudes registradas" />
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
                {solicitudes.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 'bold' }}>{s.nombre_trabajador || 'Usuario desconocido'}</td>
                    <td>
                      <div>{s.tipo}</div>
                      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2, fontStyle: 'italic' }}>
                        {s.motivo}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <AdjuntoSolicitud solicitudId={s.id} tieneAdjunto={!!s.tiene_adjunto} />
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>Desde: {s.fecha_inicio}</div>
                      <div style={{ fontSize: 13 }}>Hasta: {s.fecha_fin}</div>
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
      </div>

      {/* Saldos de vacaciones por trabajador */}
      <div style={{ marginTop: 20 }}>
        <SaldosVacaciones />
      </div>
    </div>
  )
}
