// src/features/pedidos/GestionPedidos.tsx
// Usado por RRHH y Admin: ambos roles tienen exactamente las mismas
// capacidades sobre pedidos (crear, editar, eliminar, asignar encargado).
import { useEffect, useState, useCallback, useMemo } from 'react'
import '../../styles/App.css'
import type { User } from '../auth/api'
import { getUsuarios } from '../usuarios/api'
import {
  type Pedido,
  type EstadoPedido,
  getPedidos,
  crearPedido,
  actualizarPedido,
  eliminarPedido,
} from './api'
import FotosPedido from './FotosPedido'
import { useConfirm } from '../../components/common/ConfirmDialog'
import { useToast } from '../../components/common/Toast'
import { EmptyState } from '../../components/common/EmptyState'

interface FormState {
  pedido: string
  descripcion: string
  estado: EstadoPedido
  valor: string
  encargado_id: string
}

const FORM_VACIO: FormState = {
  pedido: '',
  descripcion: '',
  estado: 'pendiente',
  valor: '',
  encargado_id: '',
}

const formatoCLP = new Intl.NumberFormat('es-CL')

function renderEstadoBadge(estado: EstadoPedido) {
  let clase = 'badge-pendiente'
  if (estado === 'en proceso') clase = 'badge-pendiente'
  if (estado === 'terminado') clase = 'badge-aprobada'
  return <span className={`badge ${clase}`}>{estado.toUpperCase()}</span>
}

export default function GestionPedidos() {
  const confirm = useConfirm()
  const notify = useToast()

  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [empleados, setEmpleados] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modo, setModo] = useState<'crear' | 'editar'>('crear')
  const [fotosDe, setFotosDe] = useState<Pedido | null>(null)
  const [pedidoEditando, setPedidoEditando] = useState<Pedido | null>(null)
  const [form, setForm] = useState<FormState>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [dataPedidos, dataUsuarios] = await Promise.all([getPedidos(), getUsuarios()])
      setPedidos(dataPedidos)
      setEmpleados(dataUsuarios.filter((u) => u.rol === 'empleado' && u.estado === 'activo'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los pedidos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const { total, pendientes, enProceso, terminados } = useMemo(
    () => ({
      total: pedidos.length,
      pendientes: pedidos.filter((p) => p.estado === 'pendiente').length,
      enProceso: pedidos.filter((p) => p.estado === 'en proceso').length,
      terminados: pedidos.filter((p) => p.estado === 'terminado').length,
    }),
    [pedidos],
  )

  const resetForm = () => {
    setModo('crear')
    setPedidoEditando(null)
    setForm(FORM_VACIO)
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setGuardando(true)
    setError(null)

    const payload = {
      pedido: form.pedido.trim(),
      descripcion: form.descripcion.trim() || null,
      estado: form.estado,
      valor: form.valor ? Number(form.valor) : null,
      encargado_id: form.encargado_id ? Number(form.encargado_id) : null,
    }

    try {
      if (modo === 'crear') {
        await crearPedido(payload)
        notify(`Pedido "${payload.pedido}" creado.`, 'success')
      } else if (pedidoEditando) {
        await actualizarPedido(pedidoEditando.id, payload)
        notify('Cambios guardados.', 'success')
      }

      await cargar()
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el pedido')
    } finally {
      setGuardando(false)
    }
  }

  const handleEditar = (p: Pedido) => {
    setModo('editar')
    setPedidoEditando(p)
    setForm({
      pedido: p.pedido,
      descripcion: p.descripcion ?? '',
      estado: p.estado,
      valor: p.valor != null ? String(p.valor) : '',
      encargado_id: p.encargado_id != null ? String(p.encargado_id) : '',
    })
  }

  const handleEliminar = async (p: Pedido) => {
    const confirmado = await confirm({
      title: 'Eliminar pedido',
      message: `Esto borrará el pedido "${p.pedido}" para siempre, no se puede deshacer. ¿Continuar?`,
      confirmText: 'Eliminar',
      danger: true,
    })
    if (!confirmado) return

    try {
      await eliminarPedido(p.id)
      await cargar()
      notify(`Pedido "${p.pedido}" eliminado.`, 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo eliminar el pedido.', 'error')
    }
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h2>Gestión de pedidos</h2>
          <p>Crea, edita y asigna pedidos de trabajo a los empleados.</p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div className="pill pill--blue">Total: <strong>{total}</strong></div>
          <div className="pill pill--amber">Pendientes: <strong>{pendientes}</strong></div>
          <div className="pill pill--blue">En proceso: <strong>{enProceso}</strong></div>
          <div className="pill pill--green">Terminados: <strong>{terminados}</strong></div>
        </div>
      </header>

      <div className="dashboard-grid" style={{ gridTemplateColumns: '1.1fr 1.9fr' }}>
        {/* COLUMNA 1: Formulario */}
        <div className="column">
          <div className="card">
            <h3 className="card-title">
              {modo === 'crear' ? 'Nuevo pedido' : 'Editar pedido'}
            </h3>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label>Nombre del pedido</label>
                <input
                  name="pedido"
                  value={form.pedido}
                  onChange={handleChange}
                  className="input-dark"
                  placeholder="Ej: Fabricación de soporte metálico"
                  required
                />
              </div>

              <div className="form-group">
                <label>Descripción</label>
                <textarea
                  name="descripcion"
                  value={form.descripcion}
                  onChange={handleChange}
                  className="input-dark"
                  rows={3}
                  placeholder="Detalles del trabajo a realizar..."
                />
              </div>

              <div className="form-group">
                <label>Valor (CLP)</label>
                <input
                  name="valor"
                  type="number"
                  min={0}
                  value={form.valor}
                  onChange={handleChange}
                  className="input-dark"
                  placeholder="Ej: 150000"
                />
              </div>

              <div className="form-group">
                <label>Encargado</label>
                <select
                  name="encargado_id"
                  value={form.encargado_id}
                  onChange={handleChange}
                  className="input-dark"
                >
                  <option value="">Sin asignar</option>
                  {empleados.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Estado</label>
                <select name="estado" value={form.estado} onChange={handleChange} className="input-dark">
                  <option value="pendiente">Pendiente</option>
                  <option value="en proceso">En proceso</option>
                  <option value="terminado">Terminado</option>
                </select>
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

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={guardando}
                  style={{
                    borderRadius: 999,
                    fontWeight: 600,
                    flex: 1,
                    opacity: guardando ? 0.7 : 1,
                    cursor: guardando ? 'wait' : 'pointer',
                  }}
                >
                  {guardando ? 'Guardando...' : modo === 'crear' ? 'Crear pedido' : 'Guardar cambios'}
                </button>

                {modo === 'editar' && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="btn-secondary"
                    style={{ borderRadius: 999, padding: '0 16px', fontSize: 13 }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* COLUMNA 2: Tabla de pedidos */}
        <div className="column">
          <div className="card">
            <h3 className="card-title">Pedidos registrados</h3>

            <div className="table-container">
              {loading && pedidos.length === 0 ? (
                <p style={{ textAlign: 'center' }}>Cargando pedidos…</p>
              ) : pedidos.length === 0 ? (
                <EmptyState icon="pedidos" title="No hay pedidos registrados" />
              ) : (
                <table className="rrhh-table">
                  <thead>
                    <tr>
                      <th>Pedido</th>
                      <th>Encargado</th>
                      <th>Valor</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidos.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.pedido}</div>
                          {p.descripcion && (
                            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2, fontStyle: 'italic' }}>
                              {p.descripcion}
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: 13 }}>{p.encargado_nombre || 'Sin asignar'}</td>
                        <td style={{ fontSize: 13 }}>
                          {p.valor != null ? `$ ${formatoCLP.format(p.valor)}` : '—'}
                        </td>
                        <td>{renderEstadoBadge(p.estado)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="action-btn btn-approve"
                              title="Ver fotos de avance del empleado"
                              onClick={() => setFotosDe(fotosDe?.id === p.id ? null : p)}
                            >
                              {fotosDe?.id === p.id ? 'Ocultar fotos' : 'Fotos'}
                            </button>
                            <button
                              className="action-btn btn-approve"
                              title="Editar este pedido"
                              onClick={() => handleEditar(p)}
                            >
                              Editar
                            </button>
                            <button
                              className="action-btn btn-reject"
                              title="Eliminar este pedido"
                              onClick={() => handleEliminar(p)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {fotosDe && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                  Avance de: {fotosDe.pedido}
                  {fotosDe.encargado_nombre ? ` · ${fotosDe.encargado_nombre}` : ''}
                </div>
                <FotosPedido pedidoId={fotosDe.id} puedeBorrar />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
