// src/features/sensores/DashboardSensores.tsx
// Panel de planta (sensores IoT) con enfoque High-Performance HMI (ISA-101):
// la interfaz es NEUTRA cuando todo está normal; el color aparece solo para
// estados anómalos o accionables. El estado usa texto + color (nunca solo
// color) y las alertas críticas se resumen arriba, donde se mira primero.

import { useEffect, useMemo, useState } from 'react'
import '../../styles/App.css'
import { fetchMetricas, descargarReporteCsv, type IotMetrica } from './api'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../../components/common/Toast'
import { Icon } from '../../components/common/Icon'
import { EmptyState } from '../../components/common/EmptyState'

// Umbrales de temperatura (°C) — misma regla en toda la vista
const UMBRAL_CRITICO = 75
const UMBRAL_ADVERTENCIA = 50

type NivelEstado = 'critico' | 'advertencia' | 'normal'

function nivelDe(m: IotMetrica): NivelEstado {
  const t = Number(m.temperatura)
  if (t >= UMBRAL_CRITICO) return 'critico'
  if (t >= UMBRAL_ADVERTENCIA) return 'advertencia'
  return 'normal'
}

function BadgeEstado({ nivel }: { nivel: NivelEstado }) {
  if (nivel === 'critico') {
    return (
      <span className="badge badge-rechazada">
        <Icon name="alerta" size={12} /> Crítico
      </span>
    )
  }
  if (nivel === 'advertencia') {
    return <span className="badge badge-pendiente">Advertencia</span>
  }
  return <span className="badge badge-neutra">Normal</span>
}

export default function DashboardSensores() {
  const { user } = useAuth()
  const notify = useToast()
  const [metricas, setMetricas] = useState<IotMetrica[]>([])
  const [loading, setLoading] = useState(true)
  const [descargando, setDescargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false

    const cargar = async () => {
      try {
        const data = await fetchMetricas(8)
        if (!cancelado) {
          setMetricas(data)
          setError(null)
          setLoading(false)
        }
      } catch (err) {
        console.error(err)
        if (!cancelado) {
          setError('No se pudo cargar la información de los sensores.')
          setLoading(false)
        }
      }
    }

    void cargar()
    const id = setInterval(cargar, 5000)

    return () => {
      cancelado = true
      clearInterval(id)
    }
  }, [])

  const { criticas, advertencias, maquinasUnicas, ultima } = useMemo(() => {
    const criticas = metricas.filter((m) => nivelDe(m) === 'critico').length
    const advertencias = metricas.filter((m) => nivelDe(m) === 'advertencia').length
    const maquinasUnicas = new Set(metricas.map((m) => m.maquina)).size
    const ultima = metricas[0]?.timestamp
      ? new Date(metricas[0].timestamp).toLocaleTimeString('es-CL', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : '—'
    return { criticas, advertencias, maquinasUnicas, ultima }
  }, [metricas])

  const handleDownloadReport = async () => {
    try {
      setDescargando(true)
      await descargarReporteCsv()
      notify('Reporte descargado.', 'success')
    } catch (e) {
      console.error(e)
      notify('No se pudo generar el reporte. Intenta de nuevo.', 'error')
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h2>Panel de planta</h2>
          <p>
            {user ? `Hola, ${user.nombre.split(' ')[0]}. ` : ''}
            Monitoreo de máquinas en tiempo real · se actualiza cada 5 segundos.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleDownloadReport}
          disabled={descargando}
        >
          <Icon name="descarga" size={16} />
          {descargando ? 'Generando…' : 'Descargar histórico (CSV)'}
        </button>
      </header>

      {/* Resumen: lo importante primero (alertas) */}
      <div className="stat-grid">
        <div className={`stat-card ${criticas > 0 ? 'stat-card--danger' : 'stat-card--ok'}`}>
          <div className="stat-card__label">Alertas críticas</div>
          <div className="stat-card__value">{criticas}</div>
        </div>
        <div className={`stat-card ${advertencias > 0 ? 'stat-card--warning' : ''}`}>
          <div className="stat-card__label">Advertencias</div>
          <div className="stat-card__value">{advertencias}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Máquinas reportando</div>
          <div className="stat-card__value">{maquinasUnicas}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Última lectura</div>
          <div className="stat-card__value" style={{ fontSize: 18 }}>{ultima}</div>
        </div>
      </div>

      {criticas > 0 && (
        <div className="banner banner--danger" role="alert">
          <Icon name="alerta" size={18} />
          <div>
            <strong>{criticas === 1 ? '1 máquina supera' : `${criticas} máquinas superan`} los {UMBRAL_CRITICO} °C.</strong>{' '}
            Revisa el detalle en la tabla y coordina con mantención.
          </div>
        </div>
      )}

      {error && (
        <div className="banner banner--warning" role="alert">
          <Icon name="alerta" size={18} />
          {error}
        </div>
      )}

      <div className="card">
        <h3 className="card-title">Lecturas recientes</h3>
        <div className="table-container">
          {loading && metricas.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-3)' }}>
              Cargando datos del sistema…
            </p>
          ) : metricas.length === 0 ? (
            <EmptyState
              icon="sensores"
              title="Sin lecturas de sensores"
              description="Verifica que el simulador o los equipos estén reportando."
            />
          ) : (
            <table className="rrhh-table">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Hora</th>
                  <th>Máquina</th>
                  <th>Temperatura</th>
                  <th>Humedad</th>
                  <th>Consumo</th>
                </tr>
              </thead>
              <tbody>
                {metricas.map((m) => {
                  const nivel = nivelDe(m)
                  const temp = Number(m.temperatura)
                  return (
                    <tr key={m.id}>
                      <td><BadgeEstado nivel={nivel} /></td>
                      <td style={{ color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(m.timestamp).toLocaleTimeString('es-CL', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td style={{ fontWeight: 600 }}>{m.maquina}</td>
                      <td
                        style={{
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: nivel === 'normal' ? 400 : 700,
                          color:
                            nivel === 'critico'
                              ? 'var(--danger)'
                              : nivel === 'advertencia'
                                ? 'var(--warning)'
                                : 'var(--text)',
                        }}
                      >
                        {temp.toFixed(1)} °C
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {Number(m.humedad).toFixed(1)} %
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {Number(m.consumo_kw).toFixed(2)} kW
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
          Normal &lt; {UMBRAL_ADVERTENCIA} °C · Advertencia {UMBRAL_ADVERTENCIA}–{UMBRAL_CRITICO} °C · Crítico ≥ {UMBRAL_CRITICO} °C
        </p>
      </div>
    </div>
  )
}
