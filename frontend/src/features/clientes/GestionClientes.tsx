// src/features/clientes/GestionClientes.tsx
// Cartera de clientes (RRHH/Admin): buscar, crear, editar (en ventana modal),
// habilitar/deshabilitar. Los teléfonos y personas de contacto son datos
// personales (Ley 21.719): los cambios quedan en el Registro de cambios.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '../../styles/App.css'
import Modal from '../../components/common/Modal'
import { EmptyState } from '../../components/common/EmptyState'
import { useConfirm } from '../../components/common/ConfirmDialog'
import { useToast } from '../../components/common/Toast'
import {
  actualizarCliente,
  crearCliente,
  deshabilitarCliente,
  getClientes,
  habilitarCliente,
  type Cliente,
  type ClientePayload,
  type ContactoCliente,
  type EntidadCliente,
} from './api'

const MAX_CONTACTOS = 5
const MAX_ENTIDADES = 5

export default function GestionClientes() {
  const confirm = useConfirm()
  const notify = useToast()

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [buscar, setBuscar] = useState('')
  const [soloHabilitados, setSoloHabilitados] = useState(true)

  // null = modal cerrado; 'nuevo' = crear; Cliente = editar
  const [editando, setEditando] = useState<Cliente | 'nuevo' | null>(null)

  const timerRef = useRef<number | null>(null)

  const cargar = useCallback(async (q: string, habilitados: boolean) => {
    setLoading(true)
    setError(null)
    try {
      setClientes(await getClientes(q || undefined, habilitados ? 'habilitado' : undefined))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los clientes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargar('', true)
  }, [cargar])

  // Búsqueda con pequeño debounce para no disparar una petición por tecla.
  const onBuscar = (q: string) => {
    setBuscar(q)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => void cargar(q, soloHabilitados), 350)
  }

  const onToggleHabilitados = (v: boolean) => {
    setSoloHabilitados(v)
    void cargar(buscar, v)
  }

  const totales = useMemo(
    () => ({
      total: clientes.length,
      habilitados: clientes.filter((c) => c.estado === 'habilitado').length,
    }),
    [clientes],
  )

  const handleToggleEstado = async (c: Cliente) => {
    const deshabilitar = c.estado === 'habilitado'
    const ok = await confirm({
      title: deshabilitar ? 'Deshabilitar cliente' : 'Habilitar cliente',
      message: deshabilitar
        ? `"${c.nombre}" dejará de aparecer al registrar trabajos nuevos. Su historial se conserva. ¿Continuar?`
        : `"${c.nombre}" volverá a estar disponible para registrar trabajos. ¿Continuar?`,
      confirmText: deshabilitar ? 'Deshabilitar' : 'Habilitar',
      danger: deshabilitar,
    })
    if (!ok) return
    try {
      if (deshabilitar) await deshabilitarCliente(c.id)
      else await habilitarCliente(c.id)
      await cargar(buscar, soloHabilitados)
      notify(deshabilitar ? 'Cliente deshabilitado.' : 'Cliente habilitado.', 'success')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo cambiar el estado.', 'error')
    }
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h2>Clientes</h2>
          <p>Cartera de clientes de la maestranza: contactos, RUT de facturación y estado.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="pill pill--blue">Clientes: <strong>{totales.total}</strong></div>
          <button
            type="button"
            className="btn-primary"
            style={{ borderRadius: 999, fontWeight: 600, padding: '9px 20px' }}
            onClick={() => setEditando('nuevo')}
          >
            + Nuevo cliente
          </button>
        </div>
      </header>

      {/* Búsqueda y filtros */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input-dark"
            style={{ flex: 1, minWidth: 240 }}
            placeholder="Buscar por nombre, RUT, contacto o teléfono…"
            value={buscar}
            onChange={(e) => onBuscar(e.target.value)}
          />
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={soloHabilitados}
              onChange={(e) => onToggleHabilitados(e.target.checked)}
            />
            Solo habilitados
          </label>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          {loading && clientes.length === 0 ? (
            <p style={{ textAlign: 'center' }}>Cargando clientes…</p>
          ) : error ? (
            <div className="banner banner--danger" role="alert">{error}</div>
          ) : clientes.length === 0 ? (
            <EmptyState
              icon="usuarios"
              title="Sin clientes"
              description={buscar ? 'Prueba con otro término de búsqueda.' : 'Crea el primer cliente con el botón "+ Nuevo cliente".'}
            />
          ) : (
            <table className="rrhh-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>RUT</th>
                  <th>Contacto</th>
                  <th>Ingreso</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => {
                  const contacto = c.contactos[0]
                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.nombre}</div>
                        {c.email && (
                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{c.email}</div>
                        )}
                      </td>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                        {c.entidades.length === 0 ? '—' : c.entidades.map((e) => (
                          <div key={e.id ?? e.rut} title={e.nombre ?? undefined}>{e.rut}</div>
                        ))}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {contacto ? (
                          <>
                            <div>{contacto.nombre || '—'}{contacto.nota ? ` (${contacto.nota})` : ''}</div>
                            <div style={{ color: '#6b7280' }}>{contacto.telefono || ''}</div>
                            {c.contactos.length > 1 && (
                              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                                +{c.contactos.length - 1} contacto(s) más
                              </div>
                            )}
                          </>
                        ) : '—'}
                      </td>
                      <td style={{ fontSize: 13 }}>{c.fecha_ingreso || '—'}</td>
                      <td>
                        <span className={`badge ${c.estado === 'habilitado' ? 'badge-aprobada' : 'badge-rechazada'}`}>
                          {c.estado}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="action-btn btn-approve"
                            title="Editar este cliente"
                            onClick={() => setEditando(c)}
                          >
                            Editar
                          </button>
                          <button
                            className="action-btn btn-reject"
                            title={c.estado === 'habilitado' ? 'Deshabilitar cliente' : 'Habilitar cliente'}
                            onClick={() => void handleToggleEstado(c)}
                          >
                            {c.estado === 'habilitado' ? 'Deshabilitar' : 'Habilitar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editando !== null && (
        <ClienteModal
          cliente={editando === 'nuevo' ? null : editando}
          onClose={() => setEditando(null)}
          onGuardado={() => void cargar(buscar, soloHabilitados)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Modal de creación / edición (contactos y RUT como listas dinámicas)
// ---------------------------------------------------------------------------

function ClienteModal({
  cliente,
  onClose,
  onGuardado,
}: {
  cliente: Cliente | null
  onClose: () => void
  onGuardado: () => void
}) {
  const notify = useToast()

  const [nombre, setNombre] = useState(cliente?.nombre ?? '')
  const [email, setEmail] = useState(cliente?.email ?? '')
  const [fechaIngreso, setFechaIngreso] = useState(cliente?.fecha_ingreso ?? '')
  const [contactos, setContactos] = useState<ContactoCliente[]>(
    cliente?.contactos.map((c) => ({ nombre: c.nombre ?? '', telefono: c.telefono ?? '', nota: c.nota ?? '' })) ?? [],
  )
  const [entidades, setEntidades] = useState<EntidadCliente[]>(
    cliente?.entidades.map((e) => ({ rut: e.rut, nombre: e.nombre ?? '' })) ?? [],
  )
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setContacto = (i: number, campo: keyof ContactoCliente, valor: string) =>
    setContactos((prev) => prev.map((c, j) => (j === i ? { ...c, [campo]: valor } : c)))
  const setEntidad = (i: number, campo: keyof EntidadCliente, valor: string) =>
    setEntidades((prev) => prev.map((e, j) => (j === i ? { ...e, [campo]: valor } : e)))

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    const payload: ClientePayload = {
      nombre: nombre.trim(),
      email: email.trim() || null,
      fecha_ingreso: fechaIngreso || null,
      // Se descartan filas totalmente vacías antes de enviar.
      contactos: contactos
        .filter((c) => (c.nombre ?? '').trim() || (c.telefono ?? '').trim())
        .map((c) => ({
          nombre: (c.nombre ?? '').trim() || null,
          telefono: (c.telefono ?? '').trim() || null,
          nota: (c.nota ?? '').trim() || null,
        })),
      entidades: entidades
        .filter((en) => en.rut.trim())
        .map((en) => ({ rut: en.rut.trim(), nombre: (en.nombre ?? '').trim() || null })),
    }

    try {
      setGuardando(true)
      if (cliente) {
        await actualizarCliente(cliente.id, payload)
        notify('Cliente actualizado.', 'success')
      } else {
        await crearCliente(payload)
        notify('Cliente creado.', 'success')
      }
      onGuardado()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el cliente.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      title={cliente ? `Editar cliente: ${cliente.nombre}` : 'Nuevo cliente'}
      onClose={onClose}
      maxWidth={560}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="form-group">
          <label>Nombre del cliente</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="input-dark"
            required
            minLength={2}
            placeholder="AGRICOLA EJEMPLO LTDA"
          />
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 2, minWidth: 200 }}>
            <label>Correo(s) <span style={{ fontSize: 11, opacity: 0.7 }}>(opcional)</span></label>
            <input
              value={email ?? ''}
              onChange={(e) => setEmail(e.target.value)}
              className="input-dark"
              placeholder="contacto@cliente.cl"
            />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
            <label>Fecha de ingreso</label>
            <input
              type="date"
              value={fechaIngreso ?? ''}
              onChange={(e) => setFechaIngreso(e.target.value)}
              className="input-dark"
            />
          </div>
        </div>

        {/* Contactos (datos personales) */}
        <div className="form-group">
          <label>Personas de contacto</label>
          {contactos.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input
                className="input-dark"
                style={{ flex: 2 }}
                placeholder="Nombre"
                value={c.nombre ?? ''}
                onChange={(e) => setContacto(i, 'nombre', e.target.value)}
              />
              <input
                className="input-dark"
                style={{ flex: 2 }}
                placeholder="Teléfono"
                value={c.telefono ?? ''}
                onChange={(e) => setContacto(i, 'telefono', e.target.value)}
              />
              <input
                className="input-dark"
                style={{ flex: 1 }}
                placeholder="Nota (pagos…)"
                value={c.nota ?? ''}
                onChange={(e) => setContacto(i, 'nota', e.target.value)}
              />
              <button
                type="button"
                className="action-btn btn-reject"
                title="Quitar contacto"
                aria-label="Quitar contacto"
                onClick={() => setContactos((prev) => prev.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
          {contactos.length < MAX_CONTACTOS && (
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: 12, padding: '5px 12px', borderRadius: 999 }}
              onClick={() => setContactos((prev) => [...prev, { nombre: '', telefono: '', nota: '' }])}
            >
              + Agregar contacto
            </button>
          )}
        </div>

        {/* Entidades / RUT de facturación */}
        <div className="form-group">
          <label>RUT de facturación</label>
          {entidades.map((en, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input
                className="input-dark"
                style={{ flex: 1 }}
                placeholder="12.345.678-9"
                value={en.rut}
                onChange={(e) => setEntidad(i, 'rut', e.target.value)}
              />
              <input
                className="input-dark"
                style={{ flex: 2 }}
                placeholder="Razón social (opcional)"
                value={en.nombre ?? ''}
                onChange={(e) => setEntidad(i, 'nombre', e.target.value)}
              />
              <button
                type="button"
                className="action-btn btn-reject"
                title="Quitar RUT"
                aria-label="Quitar RUT"
                onClick={() => setEntidades((prev) => prev.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
          {entidades.length < MAX_ENTIDADES && (
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: 12, padding: '5px 12px', borderRadius: 999 }}
              onClick={() => setEntidades((prev) => [...prev, { rut: '', nombre: '' }])}
            >
              + Agregar RUT
            </button>
          )}
          <small style={{ fontSize: 11, opacity: 0.7 }}>
            El RUT se valida con su dígito verificador (formato 12.345.678-9).
          </small>
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
            {guardando ? 'Guardando…' : cliente ? 'Guardar cambios' : 'Crear cliente'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
