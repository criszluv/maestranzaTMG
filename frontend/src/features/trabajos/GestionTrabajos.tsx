// src/features/trabajos/GestionTrabajos.tsx
// Trabajos realizados a clientes (RRHH/Admin): historial con filtros y
// registro/edición en ventana modal. Eliminar es solo Admin (auditado).

import { useCallback, useEffect, useMemo, useState } from 'react'
import '../../styles/App.css'
import Modal from '../../components/common/Modal'
import { EmptyState } from '../../components/common/EmptyState'
import { useConfirm } from '../../components/common/ConfirmDialog'
import { useToast } from '../../components/common/Toast'
import { useAuth } from '../auth/AuthContext'
import { getClientesResumen, type ClienteResumen } from '../clientes/api'
import {
  actualizarTrabajo,
  crearTrabajo,
  eliminarTrabajo,
  getTrabajos,
  pasarTrabajoAPendiente,
  type EstadoTrabajo,
  type Trabajo,
  type TrabajoPayload,
} from './api'

function pesos(v?: number | null): string {
  if (v == null) return '—'
  return `$${v.toLocaleString('es-CL')}`
}

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function GestionTrabajos() {
  const { user } = useAuth()
  const confirm = useConfirm()
  const notify = useToast()
  const esAdmin = user?.rol === 'admin'

  const [trabajos, setTrabajos] = useState<Trabajo[]>([])
  const [clientes, setClientes] = useState<ClienteResumen[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [buscar, setBuscar] = useState('')
  const [clienteId, setClienteId] = useState<number | ''>('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const [editando, setEditando] = useState<Trabajo | 'nuevo' | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setTrabajos(
        await getTrabajos({
          buscar: buscar.trim() || undefined,
          cliente_id: clienteId === '' ? undefined : clienteId,
          desde: desde || undefined,
          hasta: hasta || undefined,
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los trabajos.')
    } finally {
      setLoading(false)
    }
  }, [buscar, clienteId, desde, hasta])

  useEffect(() => {
    void cargar()
    getClientesResumen().then(setClientes).catch(() => {})
    // Solo al montar: los filtros se aplican con el botón "Filtrar".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totales = useMemo(
    () => ({
      cantidad: trabajos.length,
      suma: trabajos.reduce((s, t) => s + (t.valor ?? 0), 0),
    }),
    [trabajos],
  )

  // Corrige el cobro: el trabajo no estaba pagado -> pasa a Pagos pendientes.
  const handleAPendiente = async (t: Trabajo) => {
    const ok = await confirm({
      title: 'Marcar como pago pendiente',
      message: `"${t.detalle.slice(0, 60)}" de ${t.cliente_nombre ?? 'cliente'} saldrá de Trabajos realizados y quedará en Pagos pendientes como factura por cobrar${t.valor != null ? ` por $${t.valor.toLocaleString('es-CL')}` : ''}. ¿Continuar?`,
      confirmText: 'Pasar a pendiente',
    })
    if (!ok) return
    try {
      await pasarTrabajoAPendiente(t.id)
      await cargar()
      notify('Movido a Pagos pendientes.', 'success')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo mover el trabajo.', 'error')
    }
  }

  const handleEliminar = async (t: Trabajo) => {
    const ok = await confirm({
      title: 'Eliminar trabajo',
      message: `Se eliminará el registro "${t.detalle.slice(0, 60)}…" de ${t.cliente_nombre ?? 'cliente'}. Esta acción queda registrada en la auditoría. ¿Continuar?`,
      confirmText: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    try {
      await eliminarTrabajo(t.id)
      await cargar()
      notify('Trabajo eliminado (auditado).', 'success')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo eliminar.', 'error')
    }
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h2>Trabajos realizados</h2>
          <p>Historial de trabajos por cliente, con valor y detalle. Se conserva 6 años (normativa tributaria).</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="pill pill--blue">Trabajos: <strong>{totales.cantidad}</strong></div>
          <div className="pill pill--green">Total: <strong>{pesos(totales.suma)}</strong></div>
          <button
            type="button"
            className="btn-primary"
            style={{ borderRadius: 999, fontWeight: 600, padding: '9px 20px' }}
            onClick={() => setEditando('nuevo')}
          >
            + Registrar trabajo
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
              placeholder="Detalle o cliente…"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ margin: 0, flex: 2, minWidth: 200 }}>
            <label>Cliente</label>
            <select
              className="input-dark"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Desde</label>
            <input type="date" className="input-dark" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Hasta</label>
            <input type="date" className="input-dark" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
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
          {loading && trabajos.length === 0 ? (
            <p style={{ textAlign: 'center' }}>Cargando trabajos…</p>
          ) : error ? (
            <div className="banner banner--danger" role="alert">{error}</div>
          ) : trabajos.length === 0 ? (
            <EmptyState
              icon="pedidos"
              title="Sin trabajos en el filtro"
              description='Registra el primero con "+ Registrar trabajo".'
            />
          ) : (
            <table className="rrhh-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Detalle</th>
                  <th>Valor</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {trabajos.map((t) => (
                  <tr key={t.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                      {t.fecha}
                      {t.hora && (
                        <div style={{ color: '#6b7280', fontSize: 11 }}>{t.hora.slice(0, 5)}</div>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{t.cliente_nombre ?? `#${t.cliente_id}`}</td>
                    <td style={{ fontSize: 13, maxWidth: 380 }}>{t.detalle}</td>
                    <td style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{pesos(t.valor)}</td>
                    <td>
                      <span
                        className={`badge ${
                          t.estado === 'Finalizado'
                            ? 'badge-aprobada'
                            : t.estado === 'En proceso'
                              ? 'badge-pendiente'
                              : 'badge-rechazada'
                        }`}
                      >
                        {t.estado}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="action-btn btn-approve"
                          title="Editar este trabajo"
                          onClick={() => setEditando(t)}
                        >
                          Editar
                        </button>
                        <button
                          className="action-btn btn-approve"
                          title="No estaba pagado: moverlo a Pagos pendientes"
                          onClick={() => void handleAPendiente(t)}
                        >
                          A pendiente
                        </button>
                        {esAdmin && (
                          <button
                            className="action-btn btn-reject"
                            title="Eliminar (solo admin, queda auditado)"
                            onClick={() => void handleEliminar(t)}
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
        <TrabajoModal
          trabajo={editando === 'nuevo' ? null : editando}
          clientes={clientes}
          onClose={() => setEditando(null)}
          onGuardado={() => void cargar()}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Modal de registro / edición de un trabajo
// ---------------------------------------------------------------------------

function TrabajoModal({
  trabajo,
  clientes,
  onClose,
  onGuardado,
}: {
  trabajo: Trabajo | null
  clientes: ClienteResumen[]
  onClose: () => void
  onGuardado: () => void
}) {
  const notify = useToast()

  const [clienteId, setClienteId] = useState<number | ''>(trabajo?.cliente_id ?? '')
  const [fecha, setFecha] = useState(trabajo?.fecha ?? hoyISO())
  const [hora, setHora] = useState(trabajo?.hora?.slice(0, 5) ?? '')
  const [estado, setEstado] = useState<EstadoTrabajo>((trabajo?.estado as EstadoTrabajo) ?? 'Finalizado')
  const [valor, setValor] = useState<string>(trabajo?.valor != null ? String(trabajo.valor) : '')
  const [detalle, setDetalle] = useState(trabajo?.detalle ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    if (clienteId === '') {
      setError('Selecciona el cliente.')
      return
    }
    const valorNum = valor.trim() === '' ? null : Number(valor)
    if (valorNum !== null && (!Number.isInteger(valorNum) || valorNum < 0)) {
      setError('El valor debe ser un monto en pesos (número entero, 0 o más).')
      return
    }

    const payload: TrabajoPayload = {
      cliente_id: clienteId,
      fecha,
      hora: hora ? `${hora}:00` : null,
      estado,
      valor: valorNum,
      detalle: detalle.trim(),
    }
    try {
      setGuardando(true)
      if (trabajo) {
        await actualizarTrabajo(trabajo.id, payload)
        notify('Trabajo actualizado.', 'success')
      } else {
        await crearTrabajo(payload)
        notify('Trabajo registrado.', 'success')
      }
      onGuardado()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el trabajo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      title={trabajo ? 'Editar trabajo' : 'Registrar trabajo'}
      onClose={onClose}
      maxWidth={520}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="form-group">
          <label>Cliente</label>
          <select
            className="input-dark"
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value ? Number(e.target.value) : '')}
            required
          >
            <option value="">— Selecciona un cliente —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <small style={{ fontSize: 11, opacity: 0.7 }}>
            ¿No aparece? Créalo primero en el módulo Clientes.
          </small>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 130 }}>
            <label>Fecha</label>
            <input type="date" className="input-dark" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 110 }}>
            <label>Hora <span style={{ fontSize: 11, opacity: 0.7 }}>(opcional)</span></label>
            <input type="time" className="input-dark" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 130 }}>
            <label>Estado</label>
            <select className="input-dark" value={estado} onChange={(e) => setEstado(e.target.value as EstadoTrabajo)}>
              <option>Finalizado</option>
              <option>En proceso</option>
              <option>Pendiente</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Valor (CLP) <span style={{ fontSize: 11, opacity: 0.7 }}>(0 = sin cargo)</span></label>
          <input
            className="input-dark"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="48000"
            value={valor}
            onChange={(e) => setValor(e.target.value.replace(/[^\d]/g, ''))}
          />
        </div>

        <div className="form-group">
          <label>Detalle del trabajo</label>
          <textarea
            className="input-dark"
            rows={3}
            required
            maxLength={2000}
            placeholder="Ej: Soldar oreja a tiro de carro"
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
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
            {guardando ? 'Guardando…' : trabajo ? 'Guardar cambios' : 'Registrar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
