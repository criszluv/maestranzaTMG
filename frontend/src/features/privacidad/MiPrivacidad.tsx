// src/features/privacidad/MiPrivacidad.tsx
// Página de transparencia (Ley 21.719): qué datos se tratan, para qué, por
// cuánto tiempo y qué derechos tiene el trabajador. Incluye el derecho de
// acceso/portabilidad: descarga de los datos propios en JSON.

import { useEffect, useState } from 'react'
import '../../styles/App.css'
import { useToast } from '../../components/common/Toast'
import { Icon } from '../../components/common/Icon'
import { descargarMisDatos, getPolitica, type PoliticaTratamiento } from './api'

export default function MiPrivacidad() {
  const notify = useToast()
  const [politica, setPolitica] = useState<PoliticaTratamiento | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [descargando, setDescargando] = useState(false)

  useEffect(() => {
    let cancelado = false
    getPolitica()
      .then((p) => {
        if (!cancelado) setPolitica(p)
      })
      .catch((e) => {
        console.error('Error cargando política de tratamiento', e)
        if (!cancelado) {
          setError(
            e instanceof Error ? e.message : 'No se pudo cargar la política.',
          )
        }
      })
    return () => {
      cancelado = true
    }
  }, [])

  const handleDescargar = async () => {
    try {
      setDescargando(true)
      await descargarMisDatos()
      notify('Tus datos fueron descargados como archivo JSON.', 'success')
    } catch (e) {
      console.error(e)
      notify('No se pudieron descargar tus datos. Intenta de nuevo.', 'error')
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h2>Privacidad y datos personales</h2>
          <p>
            Cómo tratamos tus datos según la Ley 21.719 de Protección de Datos
            Personales.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          style={{ width: 'auto' }}
          onClick={handleDescargar}
          disabled={descargando}
        >
          <Icon name="descarga" size={16} />
          {descargando ? 'Preparando…' : 'Descargar mis datos (JSON)'}
        </button>
      </header>

      {error ? (
        <div className="banner banner--danger" role="alert">
          {error}
        </div>
      ) : !politica ? (
        <p style={{ textAlign: 'center', color: 'var(--text-3)' }}>
          Cargando política de tratamiento…
        </p>
      ) : (
        <div className="dashboard-grid">
          <div className="column">
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 className="card-title">Qué datos tratamos y por qué</h3>
              <div className="table-container">
                <table className="rrhh-table">
                  <thead>
                    <tr>
                      <th>Dato</th>
                      <th>Finalidad</th>
                      <th>Plazo de conservación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {politica.finalidades.map((f) => (
                      <tr key={f.dato}>
                        <td style={{ fontWeight: 600 }}>{f.dato}</td>
                        <td style={{ fontSize: 13, color: 'var(--text-2)' }}>
                          {f.finalidad}
                          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                            Base: {f.base_licitud}
                          </div>
                        </td>
                        <td style={{ fontSize: 13 }}>{f.plazo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h3 className="card-title">Tus derechos</h3>
              {Object.entries(politica.derechos).map(([clave, texto]) => (
                <div key={clave} className="history-item">
                  <div style={{ fontWeight: 600, textTransform: 'capitalize', marginBottom: 4 }}>
                    {clave.replaceAll('_', ' y ')}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{texto}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="column">
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 className="card-title">Responsable del tratamiento</h3>
              <p style={{ margin: '0 0 6px', fontWeight: 600 }}>{politica.responsable}</p>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>
                Contacto: {politica.contacto}
              </p>
              <ul style={{ fontSize: 13, color: 'var(--text-2)', paddingLeft: 18, marginBottom: 0 }}>
                {politica.marco_legal.map((m) => (
                  <li key={m} style={{ marginBottom: 4 }}>{m}</li>
                ))}
              </ul>
            </div>

            <div className="card">
              <h3 className="card-title">Cómo protegemos tus datos</h3>
              <ul style={{ fontSize: 13, color: 'var(--text-2)', paddingLeft: 18, margin: 0 }}>
                {politica.medidas_seguridad.map((m) => (
                  <li key={m} style={{ marginBottom: 6 }}>{m}</li>
                ))}
              </ul>
              <div className="banner banner--info" style={{ marginTop: 14, marginBottom: 0 }}>
                <Icon name="alerta" size={16} />
                <span style={{ fontSize: 13 }}>{politica.brechas}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
