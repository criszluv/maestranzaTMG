// src/features/solicitudes/SaldosVacaciones.tsx
// Días de vacaciones restantes por trabajador (15 hábiles/año). Lo ven RRHH y
// Admin. Embebido en la gestión de solicitudes.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSaldosVacaciones, type SaldoTrabajador } from './api'

const HOY = new Date()

export default function SaldosVacaciones() {
  const [anio, setAnio] = useState(HOY.getFullYear())
  const [filas, setFilas] = useState<SaldoTrabajador[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const anios = useMemo(
    () => Array.from({ length: 6 }, (_, i) => HOY.getFullYear() - i),
    [],
  )

  const cargar = useCallback(async (a: number) => {
    setLoading(true)
    setError(null)
    try {
      setFilas(await getSaldosVacaciones(a))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los saldos.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargar(anio)
  }, [cargar, anio])

  return (
    <div className="card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h3 className="card-title" style={{ margin: 0 }}>
          Días de vacaciones por trabajador
        </h3>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          Año:
          <select
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            className="input-dark"
            style={{ padding: '4px 8px', fontSize: 13 }}
          >
            {anios.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6, marginBottom: 12 }}>
        Cada trabajador tiene 15 días hábiles al año. Se descuentan solo las
        solicitudes de <strong>Vacaciones aprobadas</strong>.
      </p>

      <div className="table-container">
        {loading && filas.length === 0 ? (
          <p style={{ textAlign: 'center' }}>Cargando saldos…</p>
        ) : error ? (
          <div className="banner banner--danger" role="alert">{error}</div>
        ) : filas.length === 0 ? (
          <p style={{ textAlign: 'center', opacity: 0.6 }}>No hay trabajadores activos.</p>
        ) : (
          <table className="rrhh-table">
            <thead>
              <tr>
                <th>Trabajador</th>
                <th>Rol</th>
                <th>Usados</th>
                <th>Disponibles</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const sinDias = f.dias_disponibles <= 0
                const pocos = f.dias_disponibles > 0 && f.dias_disponibles <= 3
                return (
                  <tr key={f.trabajador_id}>
                    <td style={{ fontWeight: 600 }}>{f.nombre}</td>
                    <td style={{ fontSize: 12, textTransform: 'uppercase' }}>{f.rol}</td>
                    <td>{f.dias_usados}</td>
                    <td>
                      <span
                        className={`badge ${
                          sinDias ? 'badge-rechazada' : pocos ? 'badge-pendiente' : 'badge-aprobada'
                        }`}
                      >
                        {f.dias_disponibles} / {f.dias_anuales}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
