// src/features/auditoria/Auditoria.tsx
// Registro de cambios (auditoría, Ley 21.719): quién cambió qué y cuándo.
// Lo ven RRHH y Admin. Los datos los escriben triggers de la BD; aquí se leen.

import { useCallback, useEffect, useState } from 'react'
import '../../styles/App.css'
import { EmptyState } from '../../components/common/EmptyState'
import { getAuditoria, type RegistroAuditoria } from './api'

const TABLAS: { valor: string; label: string }[] = [
  { valor: '', label: 'Todas' },
  { valor: 'users', label: 'Usuarios' },
  { valor: 'rrhh_solicitudes', label: 'Solicitudes' },
  { valor: 'pedido', label: 'Pedidos' },
]

const LABEL_TABLA: Record<string, string> = {
  users: 'Usuario',
  rrhh_solicitudes: 'Solicitud',
  pedido: 'Pedido',
}

/** "12|ana@tmg.cl" -> "ana@tmg.cl"; null -> "Sistema / BD". */
function actor(actorApp?: string | null): string {
  if (!actorApp) return 'Sistema / BD'
  const partes = actorApp.split('|')
  return partes[1] || partes[0]
}

function badgeOperacion(op: string) {
  const clase =
    op === 'INSERT' ? 'badge-aprobada' : op === 'DELETE' ? 'badge-rechazada' : 'badge-pendiente'
  const texto = op === 'INSERT' ? 'Creación' : op === 'DELETE' ? 'Eliminación' : 'Edición'
  return <span className={`badge ${clase}`}>{texto}</span>
}

/** Lista de cambios legibles según la operación. */
function detalleCambios(r: RegistroAuditoria): { campo: string; texto: string }[] {
  const antes = r.datos_antes ?? {}
  const despues = r.datos_despues ?? {}
  const fmt = (v: unknown) => (v === null || v === undefined ? '∅' : String(v))

  if (r.operacion === 'UPDATE') {
    const claves = new Set([...Object.keys(antes), ...Object.keys(despues)])
    const cambios: { campo: string; texto: string }[] = []
    for (const k of claves) {
      if (k === 'actualizado_en') continue // ruido del trigger de tiempo
      if (fmt(antes[k]) !== fmt(despues[k])) {
        cambios.push({ campo: k, texto: `${fmt(antes[k])} → ${fmt(despues[k])}` })
      }
    }
    return cambios
  }
  const datos = r.operacion === 'DELETE' ? antes : despues
  return Object.entries(datos)
    .filter(([k]) => k !== 'password')
    .map(([k, v]) => ({ campo: k, texto: fmt(v) }))
}

export default function Auditoria() {
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([])
  const [tabla, setTabla] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<number | null>(null)

  const cargar = useCallback(async (t: string) => {
    setLoading(true)
    setError(null)
    try {
      setRegistros(await getAuditoria(t, 200))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el registro de cambios.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargar(tabla)
  }, [cargar, tabla])

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h2>Registro de cambios</h2>
          <p>
            Auditoría de quién creó, editó o eliminó datos (usuarios, solicitudes
            y pedidos). Trazabilidad según la Ley 21.719.
          </p>
        </div>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          Filtrar:
          <select
            value={tabla}
            onChange={(e) => setTabla(e.target.value)}
            className="input-dark"
            style={{ padding: '4px 8px', fontSize: 13 }}
          >
            {TABLAS.map((t) => (
              <option key={t.valor} value={t.valor}>{t.label}</option>
            ))}
          </select>
        </label>
      </header>

      <div className="card">
        <div className="table-container">
          {loading && registros.length === 0 ? (
            <p style={{ textAlign: 'center' }}>Cargando registro…</p>
          ) : error ? (
            <div className="banner banner--danger" role="alert">{error}</div>
          ) : registros.length === 0 ? (
            <EmptyState
              icon="escudo"
              title="Sin cambios registrados"
              description="Aún no hay movimientos auditados en el rango consultado."
            />
          ) : (
            <table className="rrhh-table">
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Qué</th>
                  <th>Acción</th>
                  <th>Quién</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => {
                  const cambios = detalleCambios(r)
                  const expandido = abierto === r.id
                  return (
                    <tr key={r.id}>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                        {new Date(r.ocurrido_en).toLocaleString('es-CL')}
                      </td>
                      <td>
                        {LABEL_TABLA[r.tabla] ?? r.tabla}
                        {r.registro_id ? (
                          <span style={{ color: '#6b7280' }}> #{r.registro_id}</span>
                        ) : null}
                      </td>
                      <td>{badgeOperacion(r.operacion)}</td>
                      <td style={{ fontSize: 13 }}>{actor(r.actor_app)}</td>
                      <td>
                        {cambios.length === 0 ? (
                          <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="action-btn btn-approve"
                              onClick={() => setAbierto(expandido ? null : r.id)}
                            >
                              {expandido ? 'Ocultar' : `Ver (${cambios.length})`}
                            </button>
                            {expandido && (
                              <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 12 }}>
                                {cambios.map((c) => (
                                  <li key={c.campo} style={{ marginBottom: 2 }}>
                                    <strong>{c.campo}:</strong> {c.texto}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
