// src/features/pedidos/GestionPedidos.tsx
// Usado por RRHH y Admin: ambos roles tienen exactamente las mismas
// capacidades sobre pedidos (crear, editar, eliminar, asignar encargado).
//
// Ciclo completo de la orden de trabajo:
//   1. Aquí se crea el pedido, se le asigna un CLIENTE (de la cartera o uno
//      nuevo creado en el momento) y un ENCARGADO (empleado).
//   2. El encargado avanza el estado hasta "terminado" desde su vista.
//   3. Aquí mismo RRHH lo CIERRA eligiendo destino:
//        Pagado    -> pasa a Trabajos realizados
//        Pendiente -> pasa a Pagos pendientes (factura por cobrar)
import { useEffect, useState, useCallback, useMemo } from 'react'
import '../../styles/App.css'
import type { User } from '../auth/api'
import { getUsuarios } from '../usuarios/api'
import { crearCliente, getClientesResumen, type ClienteResumen } from '../clientes/api'
import {
  type Pedido,
  type EstadoPedido,
  type TipoCierre,
  getPedidos,
  crearPedido,
  actualizarPedido,
  eliminarPedido,
  cerrarPedido,
} from './api'
import FotosPedido from './FotosPedido'
import Modal from '../../components/common/Modal'
import { useConfirm } from '../../components/common/ConfirmDialog'
import { useToast } from '../../components/common/Toast'
import { EmptyState } from '../../components/common/EmptyState'

/** El cliente del pedido se elige de la cartera o se crea en el momento. */
type ModoCliente = 'registrado' | 'nuevo'

interface FormState {
  pedido: string
  descripcion: string
  estado: EstadoPedido
  valor: string
  encargado_id: string
  // Cliente
  modoCliente: ModoCliente
  cliente_id: string
  // …o los datos del cliente nuevo (espejo de la tabla clientes)
  cliNombre: string
  cliEmail: string
  cliIngreso: string
  cliRut: string
  cliContacto: string
  cliTelefono: string
}

const FORM_VACIO: FormState = {
  pedido: '',
  descripcion: '',
  estado: 'pendiente',
  valor: '',
  encargado_id: '',
  modoCliente: 'registrado',
  cliente_id: '',
  cliNombre: '',
  cliEmail: '',
  cliIngreso: '',
  cliRut: '',
  cliContacto: '',
  cliTelefono: '',
}

interface CierreState {
  tipo: TipoCierre
  valor: string
  fecha: string
  numero: string
  nota: string
  detalle: string
}

const formatoCLP = new Intl.NumberFormat('es-CL')

/** Fecha local de hoy en YYYY-MM-DD (sin sorpresas de zona horaria). */
function hoyISO(): string {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

function renderEstadoBadge(estado: EstadoPedido) {
  let clase = 'badge-pendiente'
  if (estado === 'en proceso') clase = 'badge-pendiente'
  if (estado === 'terminado') clase = 'badge-aprobada'
  return <span className={`badge ${clase}`}>{estado.toUpperCase()}</span>
}

/** Resultado comercial del pedido una vez cerrado. */
function renderCierreBadge(p: Pedido) {
  if (!p.cerrado_en) return null
  return p.cierre_tipo === 'pagado' ? (
    <span className="badge badge-aprobada" title="Registrado en Trabajos realizados">
      PAGADO
    </span>
  ) : (
    <span className="badge badge-pendiente" title="Registrado en Pagos pendientes">
      POR COBRAR
    </span>
  )
}

export default function GestionPedidos() {
  const confirm = useConfirm()
  const notify = useToast()

  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [empleados, setEmpleados] = useState<User[]>([])
  const [clientes, setClientes] = useState<ClienteResumen[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modo, setModo] = useState<'crear' | 'editar'>('crear')
  const [fotosDe, setFotosDe] = useState<Pedido | null>(null)
  const [pedidoEditando, setPedidoEditando] = useState<Pedido | null>(null)
  const [form, setForm] = useState<FormState>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  // Cierre comercial
  const [pedidoCerrando, setPedidoCerrando] = useState<Pedido | null>(null)
  const [cierre, setCierre] = useState<CierreState | null>(null)
  const [cerrandoEnCurso, setCerrandoEnCurso] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [dataPedidos, dataUsuarios, dataClientes] = await Promise.all([
        getPedidos(),
        getUsuarios(),
        getClientesResumen(),
      ])
      setPedidos(dataPedidos)
      setEmpleados(dataUsuarios.filter((u) => u.rol === 'empleado' && u.estado === 'activo'))
      setClientes(dataClientes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los pedidos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const { total, pendientes, enProceso, terminados, porCerrar } = useMemo(
    () => ({
      total: pedidos.length,
      pendientes: pedidos.filter((p) => p.estado === 'pendiente').length,
      enProceso: pedidos.filter((p) => p.estado === 'en proceso').length,
      terminados: pedidos.filter((p) => p.estado === 'terminado').length,
      porCerrar: pedidos.filter((p) => p.estado === 'terminado' && !p.cerrado_en).length,
    }),
    [pedidos],
  )

  // Un pedido ya derivado a trabajos/facturas queda congelado: el backend
  // rechaza cambios de estado y de cliente (409), así que aquí se bloquean.
  const edicionCongelada = modo === 'editar' && pedidoEditando?.cerrado_en != null

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

    try {
      // 1. Cliente: el elegido de la cartera, o uno nuevo creado ahora.
      //    Si la creación falla (RUT inválido, nombre repetido…), abortamos
      //    antes de tocar el pedido y el mensaje del backend guía al usuario.
      let clienteId: number | null = form.cliente_id ? Number(form.cliente_id) : null

      if (form.modoCliente === 'nuevo') {
        if (!form.cliNombre.trim()) {
          setError('Escribe el nombre del cliente nuevo.')
          setGuardando(false)
          return
        }
        const creado = await crearCliente({
          nombre: form.cliNombre.trim(),
          email: form.cliEmail.trim() || null,
          fecha_ingreso: form.cliIngreso || null,
          contactos: form.cliContacto.trim() || form.cliTelefono.trim()
            ? [{
                nombre: form.cliContacto.trim() || null,
                telefono: form.cliTelefono.trim() || null,
              }]
            : [],
          entidades: form.cliRut.trim() ? [{ rut: form.cliRut.trim() }] : [],
        })
        clienteId = creado.id
        setClientes((prev) =>
          [...prev, { id: creado.id, nombre: creado.nombre, estado: creado.estado }]
            .sort((a, b) => a.nombre.localeCompare(b.nombre)),
        )
        notify(`Cliente "${creado.nombre}" creado.`, 'success')
      }

      // 2. Pedido
      const payload = {
        pedido: form.pedido.trim(),
        descripcion: form.descripcion.trim() || null,
        estado: form.estado,
        valor: form.valor ? Number(form.valor) : null,
        encargado_id: form.encargado_id ? Number(form.encargado_id) : null,
        cliente_id: clienteId,
      }

      if (modo === 'crear') {
        await crearPedido(payload)
        notify(`Pedido "${payload.pedido}" creado.`, 'success')
      } else if (pedidoEditando) {
        // En un pedido cerrado no se reenvían estado ni cliente (el backend
        // los rechaza y no tiene sentido cambiarlos).
        const { estado, cliente_id, ...resto } = payload
        await actualizarPedido(
          pedidoEditando.id,
          edicionCongelada ? resto : { ...resto, estado, cliente_id },
        )
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
      ...FORM_VACIO,
      pedido: p.pedido,
      descripcion: p.descripcion ?? '',
      estado: p.estado,
      valor: p.valor != null ? String(p.valor) : '',
      encargado_id: p.encargado_id != null ? String(p.encargado_id) : '',
      cliente_id: p.cliente_id != null ? String(p.cliente_id) : '',
    })
  }

  const handleEliminar = async (p: Pedido) => {
    const confirmado = await confirm({
      title: 'Eliminar pedido',
      message: p.cerrado_en
        ? `El pedido "${p.pedido}" ya fue cerrado como ${p.cierre_tipo}. Al borrarlo se pierde su trazabilidad, pero el registro comercial se mantiene. ¿Continuar?`
        : `Esto borrará el pedido "${p.pedido}" para siempre, no se puede deshacer. ¿Continuar?`,
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

  // --------- CIERRE COMERCIAL ---------

  const abrirCierre = (p: Pedido) => {
    if (!p.cliente_id) {
      notify(
        'Este pedido no tiene cliente asignado. Edítalo y asígnale uno antes de cerrarlo.',
        'error',
      )
      return
    }
    setPedidoCerrando(p)
    setCierre({
      tipo: 'pagado',
      valor: p.valor != null ? String(p.valor) : '',
      fecha: hoyISO(),
      numero: '',
      nota: '',
      detalle: '',
    })
  }

  const handleCerrar = async () => {
    if (!pedidoCerrando || !cierre) return
    setCerrandoEnCurso(true)
    try {
      await cerrarPedido(pedidoCerrando.id, {
        tipo: cierre.tipo,
        valor: cierre.valor ? Number(cierre.valor) : null,
        fecha: cierre.fecha || null,
        numero: cierre.tipo === 'pendiente' && cierre.numero ? Number(cierre.numero) : null,
        nota: cierre.tipo === 'pendiente' ? cierre.nota.trim() || null : null,
        detalle: cierre.detalle.trim() || null,
      })
      notify(
        cierre.tipo === 'pagado'
          ? 'Pedido cerrado: quedó registrado en Trabajos realizados.'
          : 'Pedido cerrado: quedó registrado en Pagos pendientes.',
        'success',
      )
      setPedidoCerrando(null)
      setCierre(null)
      await cargar()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo cerrar el pedido.', 'error')
    } finally {
      setCerrandoEnCurso(false)
    }
  }

  // El cliente del pedido en edición puede estar deshabilitado (fuera del
  // resumen): lo añadimos para no perderlo al guardar.
  const opcionesCliente = useMemo(() => {
    const lista = [...clientes]
    const actual = form.cliente_id ? Number(form.cliente_id) : null
    if (actual && !lista.some((c) => c.id === actual)) {
      lista.unshift({
        id: actual,
        nombre: pedidoEditando?.cliente_nombre ?? `Cliente #${actual}`,
        estado: 'deshabilitado',
      })
    }
    return lista
  }, [clientes, form.cliente_id, pedidoEditando])

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h2>Gestión de pedidos</h2>
          <p>
            Crea pedidos, asigna cliente y encargado, y cierra los terminados
            enviándolos a Trabajos realizados o a Pagos pendientes.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="pill pill--blue">Total: <strong>{total}</strong></div>
          <div className="pill pill--amber">Pendientes: <strong>{pendientes}</strong></div>
          <div className="pill pill--blue">En proceso: <strong>{enProceso}</strong></div>
          <div className="pill pill--green">Terminados: <strong>{terminados}</strong></div>
          {porCerrar > 0 && (
            <div className="pill pill--red" title="Terminados que aún no se cierran">
              Por cerrar: <strong>{porCerrar}</strong>
            </div>
          )}
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

              {/* ---------- CLIENTE ---------- */}
              <fieldset
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '10px 12px 4px',
                  margin: 0,
                }}
              >
                <legend style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', padding: '0 6px' }}>
                  Cliente
                </legend>

                {edicionCongelada ? (
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 10px' }}>
                    {pedidoEditando?.cliente_nombre ?? '—'} · no se puede cambiar
                    porque el pedido ya fue cerrado.
                  </p>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 14, marginBottom: 10, fontSize: 13 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="modoCliente"
                          value="registrado"
                          checked={form.modoCliente === 'registrado'}
                          onChange={handleChange}
                        />
                        Cliente ya registrado
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="modoCliente"
                          value="nuevo"
                          checked={form.modoCliente === 'nuevo'}
                          onChange={handleChange}
                        />
                        Cliente nuevo
                      </label>
                    </div>

                    {form.modoCliente === 'registrado' ? (
                      <div className="form-group">
                        <select
                          name="cliente_id"
                          value={form.cliente_id}
                          onChange={handleChange}
                          className="input-dark"
                        >
                          <option value="">Sin cliente (asignar después)</option>
                          {opcionesCliente.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nombre}
                              {c.estado !== 'habilitado' ? ' (deshabilitado)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <>
                        <div className="form-group">
                          <label>Nombre / razón social</label>
                          <input
                            name="cliNombre"
                            value={form.cliNombre}
                            onChange={handleChange}
                            className="input-dark"
                            placeholder="Ej: AGRICOLA LOS ROBLES LTDA"
                          />
                        </div>
                        <div className="form-group">
                          <label>RUT (opcional)</label>
                          <input
                            name="cliRut"
                            value={form.cliRut}
                            onChange={handleChange}
                            className="input-dark"
                            placeholder="12.345.678-9"
                          />
                        </div>
                        <div className="form-group">
                          <label>Correo (opcional)</label>
                          <input
                            name="cliEmail"
                            value={form.cliEmail}
                            onChange={handleChange}
                            className="input-dark"
                            placeholder="contacto@cliente.cl"
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <div className="form-group" style={{ flex: 1 }}>
                            <label>Contacto (opcional)</label>
                            <input
                              name="cliContacto"
                              value={form.cliContacto}
                              onChange={handleChange}
                              className="input-dark"
                              placeholder="Nombre"
                            />
                          </div>
                          <div className="form-group" style={{ flex: 1 }}>
                            <label>Teléfono (opcional)</label>
                            <input
                              name="cliTelefono"
                              value={form.cliTelefono}
                              onChange={handleChange}
                              className="input-dark"
                              placeholder="+56 9 1234 5678"
                            />
                          </div>
                        </div>
                        <div className="form-group">
                          <label>Fecha de ingreso (opcional)</label>
                          <input
                            name="cliIngreso"
                            type="date"
                            value={form.cliIngreso}
                            onChange={handleChange}
                            className="input-dark"
                          />
                        </div>
                      </>
                    )}
                  </>
                )}
              </fieldset>

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
                <select
                  name="estado"
                  value={form.estado}
                  onChange={handleChange}
                  className="input-dark"
                  disabled={edicionCongelada}
                  title={edicionCongelada ? 'El pedido ya fue cerrado' : undefined}
                >
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
                      <th>Cliente</th>
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
                        <td style={{ fontSize: 13 }}>
                          {p.cliente_nombre || (
                            <span style={{ color: 'var(--text-3)' }}>Sin cliente</span>
                          )}
                        </td>
                        <td style={{ fontSize: 13 }}>{p.encargado_nombre || 'Sin asignar'}</td>
                        <td style={{ fontSize: 13 }}>
                          {p.valor != null ? `$ ${formatoCLP.format(p.valor)}` : '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                            {renderEstadoBadge(p.estado)}
                            {renderCierreBadge(p)}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              className="action-btn btn-approve"
                              title="Ver fotos de avance del empleado"
                              onClick={() => setFotosDe(fotosDe?.id === p.id ? null : p)}
                            >
                              {fotosDe?.id === p.id ? 'Ocultar fotos' : 'Fotos'}
                            </button>
                            {p.estado === 'terminado' && !p.cerrado_en && (
                              <button
                                className="action-btn btn-approve"
                                title="Marcar como pagado o pendiente de pago"
                                onClick={() => abrirCierre(p)}
                                style={{ fontWeight: 700 }}
                              >
                                Cerrar
                              </button>
                            )}
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

      {/* ---------- MODAL DE CIERRE ---------- */}
      {pedidoCerrando && cierre && (
        <Modal
          title={`Cerrar: ${pedidoCerrando.pedido}`}
          onClose={() => {
            setPedidoCerrando(null)
            setCierre(null)
          }}
          maxWidth={520}
        >
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 0 }}>
            Cliente: <strong>{pedidoCerrando.cliente_nombre}</strong>. Elige qué
            pasa con el cobro de este trabajo terminado.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <label
              style={{
                display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer',
                border: `1px solid ${cierre.tipo === 'pagado' ? 'var(--success)' : 'var(--border)'}`,
                borderRadius: 10, padding: 10,
                background: cierre.tipo === 'pagado' ? 'var(--success-soft)' : 'transparent',
              }}
            >
              <input
                type="radio"
                name="tipoCierre"
                checked={cierre.tipo === 'pagado'}
                onChange={() => setCierre({ ...cierre, tipo: 'pagado' })}
                style={{ marginTop: 3 }}
              />
              <span>
                <strong style={{ fontSize: 14 }}>Pagado</strong>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  El cliente ya pagó. Se registra en <strong>Trabajos realizados</strong>.
                </div>
              </span>
            </label>

            <label
              style={{
                display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer',
                border: `1px solid ${cierre.tipo === 'pendiente' ? 'var(--warning)' : 'var(--border)'}`,
                borderRadius: 10, padding: 10,
                background: cierre.tipo === 'pendiente' ? 'var(--warning-soft)' : 'transparent',
              }}
            >
              <input
                type="radio"
                name="tipoCierre"
                checked={cierre.tipo === 'pendiente'}
                onChange={() => setCierre({ ...cierre, tipo: 'pendiente' })}
                style={{ marginTop: 3 }}
              />
              <span>
                <strong style={{ fontSize: 14 }}>Pendiente de pago</strong>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  Queda por cobrar. Se registra en <strong>Pagos pendientes</strong>.
                </div>
              </span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Monto (CLP)</label>
              <input
                type="number"
                min={0}
                value={cierre.valor}
                onChange={(e) => setCierre({ ...cierre, valor: e.target.value })}
                className="input-dark"
                placeholder="Valor del pedido"
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Fecha</label>
              <input
                type="date"
                value={cierre.fecha}
                onChange={(e) => setCierre({ ...cierre, fecha: e.target.value })}
                className="input-dark"
              />
            </div>
          </div>

          {cierre.tipo === 'pendiente' ? (
            <>
              <div className="form-group">
                <label>N° de factura (opcional)</label>
                <input
                  type="number"
                  min={0}
                  value={cierre.numero}
                  onChange={(e) => setCierre({ ...cierre, numero: e.target.value })}
                  className="input-dark"
                  placeholder="Ej: 2450"
                />
              </div>
              <div className="form-group">
                <label>Nota (opcional)</label>
                <input
                  value={cierre.nota}
                  onChange={(e) => setCierre({ ...cierre, nota: e.target.value })}
                  className="input-dark"
                  placeholder="Ej: pago a 30 días"
                />
              </div>
            </>
          ) : (
            <div className="form-group">
              <label>Detalle del trabajo (opcional)</label>
              <textarea
                rows={2}
                value={cierre.detalle}
                onChange={(e) => setCierre({ ...cierre, detalle: e.target.value })}
                className="input-dark"
                placeholder={`Por defecto: ${pedidoCerrando.pedido}`}
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setPedidoCerrando(null)
                setCierre(null)
              }}
              disabled={cerrandoEnCurso}
              style={{ borderRadius: 999, padding: '0 16px', fontSize: 13 }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleCerrar}
              disabled={cerrandoEnCurso}
              style={{ borderRadius: 999, fontWeight: 600, opacity: cerrandoEnCurso ? 0.7 : 1 }}
            >
              {cerrandoEnCurso
                ? 'Cerrando…'
                : cierre.tipo === 'pagado'
                  ? 'Registrar como pagado'
                  : 'Registrar por cobrar'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
