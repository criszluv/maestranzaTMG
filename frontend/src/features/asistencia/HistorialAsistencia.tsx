// src/features/asistencia/HistorialAsistencia.tsx
// Sección de marcaje: historial de asistencia provisto por la API de Workera.
// Vista COMPARTIDA por Admin (/admin/asistencia) y RRHH (/rrhh/asistencia).

import { useCallback, useEffect, useMemo, useState } from 'react'
import '../../styles/App.css'
import { EmptyState } from '../../components/common/EmptyState'
import { getHistorialAsistencia, type Jornada } from './api'
import ReporteAsistencia from './ReporteAsistencia'

/** Fecha local en formato YYYY-MM-DD (para <input type="date">). */
function fechaISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const HOY = new Date()
// Rango por defecto: ayer + hoy (consulta rápida a Workera).
const AYER = new Date(HOY.getTime() - 1 * 24 * 60 * 60 * 1000)

type Vista = 'historial' | 'reporte'

export default function HistorialAsistencia() {
  const [vista, setVista] = useState<Vista>('historial')

  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtros de fecha (default: ayer + hoy, respuesta rápida de Workera)
  const [desde, setDesde] = useState(fechaISO(AYER))
  const [hasta, setHasta] = useState(fechaISO(HOY))

  const rangoInvalido = useMemo(
    () => Boolean(desde && hasta && desde > hasta),
    [desde, hasta],
  )

  const cargar = useCallback(async (d: string, h: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await getHistorialAsistencia({ desde: d, hasta: h })
      setJornadas(data)
    } catch (err) {
      console.error('Error cargando historial de marcaje (Workera)', err)
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el historial de marcaje desde Workera.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  // Carga inicial con el rango por defecto
  useEffect(() => {
    void cargar(fechaISO(AYER), fechaISO(HOY))
  }, [cargar])

  const handleBuscar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (rangoInvalido) return
    void cargar(desde, hasta)
  }

  const jornadasCriticas = jornadas.filter((j) => (j.horas_trabajadas ?? 0) > 10).length
  const enCurso = jornadas.filter((j) => j.horas_trabajadas == null).length

  const formatHora = (valor?: string | null) => {
    if (!valor) return '—'
    const d = new Date(valor)
    if (Number.isNaN(d.getTime())) return valor
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const renderJornadaLegal = (horas: number | null | undefined) => {
    if (horas == null) {
      return <span className="badge" style={{ background: '#f3f4f6', color: '#6b7280' }}>EN CURSO</span>
    }
    let clase = 'badge-aprobada'
    let texto = 'NORMAL'
    if (horas > 10) {
      clase = 'badge-rechazada'
      texto = 'EXCEDE 10H'
    } else if (horas >= 9) {
      clase = 'badge-pendiente'
      texto = 'EXTRA'
    }
    return <span className={`badge ${clase}`}>{texto}</span>
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h2>Asistencia</h2>
          <p>
            Marcaje de los trabajadores directo desde Workera. Las horas son
            netas: se descuentan 2 h de colación por jornada.
          </p>
        </div>

        {vista === 'historial' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="pill">Jornadas: <strong>{jornadas.length}</strong></div>
            <div className={`pill${jornadasCriticas > 0 ? ' pill--red' : ''}`}>
              Exceden 10 h: <strong>{jornadasCriticas}</strong>
            </div>
            <div className="pill pill--blue">En curso: <strong>{enCurso}</strong></div>
          </div>
        )}
      </header>

      {/* Pestañas: historial diario vs. reporte mensual */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          type="button"
          className={vista === 'historial' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setVista('historial')}
          style={{ borderRadius: 999, padding: '8px 18px', fontSize: 13, fontWeight: 600 }}
        >
          Historial diario
        </button>
        <button
          type="button"
          className={vista === 'reporte' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setVista('reporte')}
          style={{ borderRadius: 999, padding: '8px 18px', fontSize: 13, fontWeight: 600 }}
        >
          Reporte mensual
        </button>
      </div>

      {vista === 'reporte' ? (
        <ReporteAsistencia />
      ) : (
      <>
      {/* Filtros de rango de fechas */}
      <div className="card" style={{ marginBottom: 20 }}>
        <form
          onSubmit={handleBuscar}
          style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}
        >
          <div className="form-group" style={{ margin: 0 }}>
            <label>Desde</label>
            <input
              type="date"
              value={desde}
              max={hasta}
              onChange={(e) => setDesde(e.target.value)}
              className="input-dark"
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="input-dark"
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || rangoInvalido}
            style={{
              borderRadius: 999,
              fontWeight: 600,
              padding: '9px 22px',
              opacity: loading || rangoInvalido ? 0.6 : 1,
              cursor: loading ? 'wait' : rangoInvalido ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Consultando…' : 'Consultar'}
          </button>
          <span style={{ fontSize: 12, color: rangoInvalido ? 'var(--danger)' : 'var(--text-3)' }}>
            {rangoInvalido
              ? '"Desde" no puede ser posterior a "Hasta".'
              : 'Consejo: usa rangos cortos, Workera responde más rápido.'}
          </span>
        </form>
      </div>

      <div className="card">
        <div className="table-container">
          {loading && jornadas.length === 0 ? (
            <p style={{ textAlign: 'center' }}>Cargando historial desde Workera…</p>
          ) : error ? (
            <div className="banner banner--danger" role="alert">
              {error}
            </div>
          ) : jornadas.length === 0 ? (
            <EmptyState
              icon="asistencia"
              title="No hay registros de marcaje en el rango"
              description="Prueba con otro rango de fechas."
            />
          ) : (
            <table className="rrhh-table">
              <thead>
                <tr>
                  <th>Trabajador</th>
                  <th>Fecha</th>
                  <th>Entrada</th>
                  <th>Salida</th>
                  <th>Total</th>
                  <th>Cumplimiento</th>
                </tr>
              </thead>
              <tbody>
                {jornadas.map((j, idx) => (
                  <tr key={`${j.trabajador_id ?? 'x'}-${j.fecha ?? idx}`}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {j.nombre_trabajador || j.trabajador_id || '—'}
                      </div>
                      {(j.sucursal || j.departamento) && (
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                          {[j.sucursal, j.departamento].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td>{j.fecha || '—'}</td>
                    <td>{formatHora(j.hora_entrada)}</td>
                    <td>{formatHora(j.hora_salida)}</td>
                    <td
                      style={{ fontWeight: 'bold' }}
                      title={
                        j.horas_brutas != null
                          ? `Bruto: ${j.horas_brutas.toFixed(2)} h (menos 2 h de colación)`
                          : undefined
                      }
                    >
                      {j.horas_trabajadas != null ? `${j.horas_trabajadas.toFixed(2)} h` : 'En curso'}
                    </td>
                    <td>{renderJornadaLegal(j.horas_trabajadas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  )
}
