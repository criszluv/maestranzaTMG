// src/features/asistencia/ReporteAsistencia.tsx
// Reporte mensual de asistencia por trabajador (Workera): días asistidos,
// jornadas completas/incompletas y horas netas trabajadas del mes elegido.
// Compartido por Admin y RRHH (embebido en HistorialAsistencia).

import { useCallback, useEffect, useMemo, useState } from 'react'
import '../../styles/App.css'
import { EmptyState } from '../../components/common/EmptyState'
import { getReporteMensual, type ReporteMensual } from './api'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const HOY = new Date()

/** Neutraliza celdas que Excel interpretaría como fórmula (CSV injection). */
function celdaCSVSegura(valor: unknown): string {
  const texto = valor == null ? '' : String(valor)
  const peligrosa = /^[=+\-@\t\r]/.test(texto)
  const escapada = texto.replace(/"/g, '""')
  return `"${peligrosa ? "'" + escapada : escapada}"`
}

export default function ReporteAsistencia() {
  const [anio, setAnio] = useState(HOY.getFullYear())
  const [mes, setMes] = useState(HOY.getMonth() + 1) // 1-12
  const [filas, setFilas] = useState<ReporteMensual[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const anios = useMemo(() => {
    const actual = HOY.getFullYear()
    return Array.from({ length: 6 }, (_, i) => actual - i) // últimos 6 años
  }, [])

  const cargar = useCallback(async (a: number, m: number) => {
    setLoading(true)
    setError(null)
    try {
      setFilas(await getReporteMensual(a, m))
    } catch (err) {
      console.error('Error cargando reporte mensual (Workera)', err)
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo generar el reporte mensual desde Workera.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargar(HOY.getFullYear(), HOY.getMonth() + 1)
  }, [cargar])

  const totales = useMemo(() => {
    const horas = filas.reduce((s, f) => s + (f.horas_trabajadas || 0), 0)
    const incompletas = filas.reduce((s, f) => s + (f.jornadas_incompletas || 0), 0)
    return { horas: Math.round(horas * 100) / 100, incompletas }
  }, [filas])

  const handleBuscar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    void cargar(anio, mes)
  }

  const exportarCSV = () => {
    const cabecera = [
      'Trabajador', 'Ficha', 'Identificación', 'Sucursal', 'Departamento',
      'Días asistidos', 'Jornadas completas', 'Jornadas incompletas',
      'Horas trabajadas (neto)', 'Promedio por jornada',
    ]
    const lineas = filas.map((f) =>
      [
        f.nombre_trabajador ?? '',
        f.trabajador_id ?? '',
        f.identificacion ?? '',
        f.sucursal ?? '',
        f.departamento ?? '',
        f.dias_asistidos,
        f.jornadas_completas,
        f.jornadas_incompletas,
        f.horas_trabajadas,
        f.horas_promedio ?? '',
      ]
        .map(celdaCSVSegura)
        .join(','),
    )
    const contenido = '﻿' + [cabecera.map(celdaCSVSegura).join(','), ...lineas].join('\r\n')
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte_asistencia_${anio}-${String(mes).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* Filtros mes/año + exportar */}
      <div className="card" style={{ marginBottom: 20 }}>
        <form
          onSubmit={handleBuscar}
          style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}
        >
          <div className="form-group" style={{ margin: 0 }}>
            <label>Mes</label>
            <select
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              className="input-dark"
            >
              {MESES.map((nombre, i) => (
                <option key={i} value={i + 1}>{nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Año</label>
            <select
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              className="input-dark"
            >
              {anios.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{
              borderRadius: 999,
              fontWeight: 600,
              padding: '9px 22px',
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Generando…' : 'Generar reporte'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={exportarCSV}
            disabled={loading || filas.length === 0}
            style={{ borderRadius: 999, padding: '9px 18px', fontSize: 13 }}
          >
            Exportar CSV
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Horas netas: se descuentan 2 h de colación por jornada.
          </span>
        </form>
      </div>

      {/* Resumen */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="pill pill--blue">Trabajadores: <strong>{filas.length}</strong></div>
        <div className="pill pill--green">Horas del mes: <strong>{totales.horas} h</strong></div>
        <div className={`pill${totales.incompletas > 0 ? ' pill--red' : ''}`}>
          Jornadas incompletas: <strong>{totales.incompletas}</strong>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          {loading && filas.length === 0 ? (
            <p style={{ textAlign: 'center' }}>Generando reporte desde Workera…</p>
          ) : error ? (
            <div className="banner banner--danger" role="alert">{error}</div>
          ) : filas.length === 0 ? (
            <EmptyState
              icon="asistencia"
              title="Sin datos de asistencia en el mes"
              description="Prueba con otro mes o año."
            />
          ) : (
            <table className="rrhh-table">
              <thead>
                <tr>
                  <th>Trabajador</th>
                  <th>Días asistidos</th>
                  <th>Jornadas completas</th>
                  <th>Sin marcar entrada/salida</th>
                  <th>Horas trabajadas</th>
                  <th>Promedio/jornada</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, idx) => (
                  <tr key={`${f.trabajador_id ?? 'x'}-${idx}`}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {f.nombre_trabajador || f.trabajador_id || '—'}
                      </div>
                      {(f.sucursal || f.departamento) && (
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                          {[f.sucursal, f.departamento].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td>{f.dias_asistidos}</td>
                    <td>{f.jornadas_completas}</td>
                    <td>
                      {f.jornadas_incompletas > 0 ? (
                        <span className="badge badge-pendiente">{f.jornadas_incompletas}</span>
                      ) : (
                        <span style={{ color: '#6b7280' }}>0</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 'bold' }}>{f.horas_trabajadas.toFixed(2)} h</td>
                    <td>{f.horas_promedio != null ? `${f.horas_promedio.toFixed(2)} h` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
