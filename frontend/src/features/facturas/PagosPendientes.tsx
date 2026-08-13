// src/features/facturas/PagosPendientes.tsx
// Pagos pendientes / facturas por cobrar (RRHH/Admin).
//   - Pendientes primero (más antiguas arriba: prioridad de cobranza).
//   - Antigüedad con semáforo (≤30 verde, 31–60 ámbar, >60 rojo).
//   - "Sin vincular" = factura cuyo nombre no calzó con la cartera de
//     clientes; se puede vincular al editar (el texto original se conserva).

import { useCallback, useEffect, useMemo, useState } from 'react'
import '../../styles/App.css'
import Modal from '../../components/common/Modal'
import { EmptyState } from '../../components/common/EmptyState'
import { useConfirm } from '../../components/common/ConfirmDialog'
import { useToast } from '../../components/common/Toast'
import { useAuth } from '../auth/AuthContext'
import { getClientesResumen, type ClienteResumen } from '../clientes/api'
import {
  actualizarFactura,
  crearFactura,
  eliminarFactura,
  getFacturas,
  pagarFactura,
  pasarFacturaATrabajo,
  reabrirFactura,
  type EstadoFactura,
  type Factura,
  type FacturaPayload,
} from './api'

function pesos(v?: number | null): string {
  if (v == null) return '—'
  return `$${v.toLocaleString('es-CL')}`
}

function diasDesde(fechaISO?: string | null): number | null {
  if (!fechaISO) return null
  const f = new Date(`${fechaISO}T00:00:00`)
  if (Number.isNaN(f.getTime())) return null
  return Math.floor((Date.now() - f.getTime()) / (24 * 60 * 60 * 1000))
}

function BadgeAntiguedad({ fecha }: { fecha?: string | null }) {
  const dias = diasDesde(fecha)
  if (dias == null) {
    return <span className="badge" style={{ background: '#f3f4f6', color: '#6b7280' }}>SIN FECHA</span>
  }
  const clase = dias <= 30 ? 'badge-aprobada' : dias <= 60 ? 'badge-pendiente' : 'badge-rechazada'
  return <span className={`badge ${clase}`}>{dias} día(s)</span>
}

type FiltroEstado = 'pendiente' | 'pagada' | 'todas'

export default function PagosPendientes() {
  const { user } = useAuth()
  const confirm = useConfirm()
  const notify = useToast()
  const esAdmin = user?.rol === 'admin'

  const [facturas, setFacturas] = useState<Factura[]>([])
  const [clientes, setClientes] = useState<ClienteResumen[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [buscar, setBuscar] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('pendiente')
  const [soloSinVincular, setSoloSinVincular] = useState(false)

  const [editando, setEditando] = useState<Factura | 'nueva' | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setFacturas(
        await getFacturas({
          estado: filtroEstado === 'todas' ? undefined : (filtroEstado as EstadoFactura),
          buscar: buscar.trim() || undefined,
          solo_sin_vincular: soloSinVincular || undefined,
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las facturas.')
    } finally {
      setLoading(false)
    }
  }, [buscar, filtroEstado, soloSinVincular])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    getClientesResumen().then(setClientes).catch(() => {})
  }, [])

  const totales = useMemo(() => {
    const pendientes = facturas.filter((f) => f.estado === 'pendiente')
    return {
      pendientes: pendientes.length,
      montoPendiente: pendientes.reduce((s, f) => s + (f.monto ?? 0), 0),
      vencidas60: pendientes.filter((f) => (diasDesde(f.fecha_emision) ?? 0) > 60).length,
      sinVincular: facturas.filter((f) => f.cliente_id == null).length,
    }
  }, [facturas])

  const handlePagar = async (f: Factura) => {
    const ok = await confirm({
      title: 'Marcar factura como pagada',
      message: `Factura ${f.numero ? `N°${f.numero} ` : ''}de ${f.cliente_nombre || f.cliente_texto} por ${pesos(f.monto)}. Se registrará pagada con fecha de hoy. ¿Continuar?`,
      confirmText: 'Marcar pagada',
    })
    if (!ok) return
    try {
      await pagarFactura(f.id)
      await cargar()
      notify('Factura marcada como pagada.', 'success')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo marcar como pagada.', 'error')
    }
  }

  const handleReabrir = async (f: Factura) => {
    const ok = await confirm({
      title: 'Volver a pendiente',
      message: `La factura ${f.numero ? `N°${f.numero} ` : ''}volverá a la lista de pagos pendientes. ¿Continuar?`,
      confirmText: 'Reabrir',
      danger: true,
    })
    if (!ok) return
    try {
      await reabrirFactura(f.id)
      await cargar()
      notify('Factura reabierta como pendiente.', 'success')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo reabrir.', 'error')
    }
  }

  // El cobro se concretó: la factura sale de aquí y pasa al historial de
  // Trabajos realizados (necesita el cliente de la cartera vinculado).
  const handleATrabajo = async (f: Factura) => {
    const ok = await confirm({
      title: 'Pasar a trabajos realizados',
      message: `${f.cliente_nombre ?? f.cliente_texto}${f.numero ? ` · N°${f.numero}` : ''} saldrá de Pagos pendientes y quedará registrada como trabajo realizado (pagado). ¿Continuar?`,
      confirmText: 'Pasar a trabajos',
    })
    if (!ok) return
    try {
      await pasarFacturaATrabajo(f.id)
      await cargar()
      notify('Movida a Trabajos realizados.', 'success')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo mover la factura.', 'error')
    }
  }

  const handleEliminar = async (f: Factura) => {
    const ok = await confirm({
      title: 'Eliminar factura',
      message: `Se eliminará el registro ${f.numero ? `N°${f.numero} ` : ''}de ${f.cliente_nombre || f.cliente_texto}. Esta acción queda en la auditoría. ¿Continuar?`,
      confirmText: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    try {
      await eliminarFactura(f.id)
      await cargar()
      notify('Factura eliminada (auditado).', 'success')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo eliminar.', 'error')
    }
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h2>Pagos pendientes</h2>
          <p>Facturas por cobrar de clientes. Las más antiguas aparecen primero.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="pill pill--amber">Pendientes: <strong>{totales.pendientes}</strong></div>
          <div className="pill pill--red">Por cobrar: <strong>{pesos(totales.montoPendiente)}</strong></div>
          <div className={`pill${totales.vencidas60 > 0 ? ' pill--red' : ''}`}>
            +60 días: <strong>{totales.vencidas60}</strong>
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ borderRadius: 999, fontWeight: 600, padding: '9px 20px' }}
            onClick={() => setEditando('nueva')}
          >
            + Registrar factura
          </button>
        </div>
      </header>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 20 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void cargar()
          }}
          style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}
        >
          <div className="form-group" style={{ margin: 0, flex: 2, minWidth: 200 }}>
            <label>Buscar</label>
            <input
              className="input-dark"
              placeholder="Cliente o N° de factura…"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Estado</label>
            <select
              className="input-dark"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)}
            >
              <option value="pendiente">Pendientes</option>
              <option value="pagada">Pagadas</option>
              <option value="todas">Todas</option>
            </select>
          </div>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 10 }}>
            <input
              type="checkbox"
              checked={soloSinVincular}
              onChange={(e) => setSoloSinVincular(e.target.checked)}
            />
            Solo sin vincular ({totales.sinVincular})
          </label>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ borderRadius: 999, fontWeight: 600, padding: '9px 22px' }}
          >
            {loading ? 'Buscando…' : 'Filtrar'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="table-container">
          {loading && facturas.length === 0 ? (
            <p style={{ textAlign: 'center' }}>Cargando facturas…</p>
          ) : error ? (
            <div className="banner banner--danger" role="alert">{error}</div>
          ) : facturas.length === 0 ? (
            <EmptyState
              icon="pedidos"
              title="Sin facturas en el filtro"
              description='Registra una con "+ Registrar factura".'
            />
          ) : (
            <table className="rrhh-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>N° factura</th>
                  <th>Emisión</th>
                  <th>Antigüedad</th>
                  <th>Monto</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {f.cliente_nombre || f.cliente_texto}
                      </div>
                      {f.cliente_id == null ? (
                        <span
                          className="badge badge-pendiente"
                          style={{ fontSize: 10 }}
                          title="Este nombre no calzó con la cartera; vincúlalo al editar"
                        >
                          sin vincular
                        </span>
                      ) : (
                        f.cliente_nombre && f.cliente_texto !== f.cliente_nombre && (
                          <div style={{ fontSize: 11, color: '#9ca3af' }} title="Nombre tal como se digitó">
                            "{f.cliente_texto}"
                          </div>
                        )
                      )}
                      {f.nota && (
                        <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>⚠ {f.nota}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>{f.numero ?? '—'}</td>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{f.fecha_emision ?? '—'}</td>
                    <td>
                      {f.estado === 'pendiente' ? (
                        <BadgeAntiguedad fecha={f.fecha_emision} />
                      ) : (
                        <span style={{ fontSize: 12, color: '#6b7280' }}>
                          pagada {f.pagada_en ?? ''}
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{pesos(f.monto)}</td>
                    <td>
                      <span className={`badge ${f.estado === 'pagada' ? 'badge-aprobada' : 'badge-pendiente'}`}>
                        {f.estado}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {f.estado === 'pendiente' ? (
                          <button
                            className="action-btn btn-approve"
                            title="Marcar como pagada"
                            onClick={() => void handlePagar(f)}
                          >
                            Pagada
                          </button>
                        ) : (
                          <button
                            className="action-btn btn-reject"
                            title="Volver a pendiente"
                            onClick={() => void handleReabrir(f)}
                          >
                            Reabrir
                          </button>
                        )}
                        <button
                          className="action-btn btn-approve"
                          title="Ya se cobró: moverla a Trabajos realizados"
                          onClick={() => void handleATrabajo(f)}
                        >
                          A trabajos
                        </button>
                        <button
                          className="action-btn btn-approve"
                          title="Editar / vincular cliente"
                          onClick={() => setEditando(f)}
                        >
                          Editar
                        </button>
                        {esAdmin && (
                          <button
                            className="action-btn btn-reject"
                            title="Eliminar (solo admin, queda auditado)"
                            onClick={() => void handleEliminar(f)}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editando !== null && (
        <FacturaModal
          factura={editando === 'nueva' ? null : editando}
          clientes={clientes}
          onClose={() => setEditando(null)}
          onGuardado={() => void cargar()}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Modal de registro / edición (vincular cliente conservando el texto)
// ---------------------------------------------------------------------------

function FacturaModal({
  factura,
  clientes,
  onClose,
  onGuardado,
}: {
  factura: Factura | null
  clientes: ClienteResumen[]
  onClose: () => void
  onGuardado: () => void
}) {
  const notify = useToast()

  const [clienteId, setClienteId] = useState<number | ''>(factura?.cliente_id ?? '')
  const [clienteTexto, setClienteTexto] = useState(factura?.cliente_texto ?? '')
  const [numero, setNumero] = useState(factura?.numero != null ? String(factura.numero) : '')
  const [monto, setMonto] = useState(factura?.monto != null ? String(factura.monto) : '')
  const [fecha, setFecha] = useState(factura?.fecha_emision ?? '')
  const [nota, setNota] = useState(factura?.nota ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    if (clienteId === '' && !clienteTexto.trim()) {
      setError('Selecciona un cliente de la cartera o escribe su nombre.')
      return
    }

    const payload: FacturaPayload = {
      cliente_id: clienteId === '' ? null : clienteId,
      cliente_texto: clienteTexto.trim() || null,
      numero: numero.trim() === '' ? null : Number(numero),
      monto: monto.trim() === '' ? null : Number(monto),
      fecha_emision: fecha || null,
      nota: nota.trim() || null,
    }
    try {
      setGuardando(true)
      if (factura) {
        await actualizarFactura(factura.id, payload)
        notify('Factura actualizada.', 'success')
      } else {
        await crearFactura(payload)
        notify('Factura registrada.', 'success')
      }
      onGuardado()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la factura.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      title={factura ? `Editar factura${factura.numero ? ` N°${factura.numero}` : ''}` : 'Registrar factura'}
      onClose={onClose}
      maxWidth={520}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="form-group">
          <label>Cliente de la cartera <span style={{ fontSize: 11, opacity: 0.7 }}>(recomendado)</span></label>
          <select
            className="input-dark"
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">— Sin vincular —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>
            Nombre escrito{' '}
            <span style={{ fontSize: 11, opacity: 0.7 }}>
              (obligatorio si no vinculas; se conserva como respaldo)
            </span>
          </label>
          <input
            className="input-dark"
            value={clienteTexto}
            onChange={(e) => setClienteTexto(e.target.value)}
            maxLength={200}
            placeholder="Como aparece en la factura"
          />
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 110 }}>
            <label>N° factura</label>
            <input
              className="input-dark"
              inputMode="numeric"
              value={numero}
              onChange={(e) => setNumero(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="2946"
            />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 130 }}>
            <label>Monto (CLP)</label>
            <input
              className="input-dark"
              inputMode="numeric"
              value={monto}
              onChange={(e) => setMonto(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="130900"
            />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
            <label>Fecha de emisión</label>
            <input type="date" className="input-dark" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>Nota <span style={{ fontSize: 11, opacity: 0.7 }}>(opcional)</span></label>
          <input
            className="input-dark"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            maxLength={500}
            placeholder="Observaciones, aclaraciones de fecha, etc."
          />
        </div>

        {error && (
          <div
            style={{
              backgroundColor: 'rgba(220,38,38,0.06)',
              color: '#b91c1c',
              padding: 10,
              borderRadius: 8,
              fontSize: 13,
              border: '1px solid rgba(220,38,38,0.4)',
            }}
          >
            ⚠ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            style={{ borderRadius: 999, padding: '0 16px', fontSize: 13 }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={guardando}
            style={{
              borderRadius: 999,
              fontWeight: 600,
              opacity: guardando ? 0.7 : 1,
              cursor: guardando ? 'wait' : 'pointer',
            }}
          >
            {guardando ? 'Guardando…' : factura ? 'Guardar cambios' : 'Registrar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
