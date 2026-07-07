import { useEffect, useState, useMemo } from 'react'
import '../../styles/App.css'
import { useAuth } from '../auth/AuthContext'
import type { User, UserRol } from '../auth/api'
import {
  getUsuarios,
  crearUsuario,
  deshabilitarUsuario,
  habilitarUsuario,
  type UsuarioCreate,
} from './api'
import EditarUsuarioModal from './EditarUsuarioModal'
import { useConfirm } from '../../components/common/ConfirmDialog'
import { useToast } from '../../components/common/Toast'
import { POLITICA_PASSWORD_TEXTO, validarPasswordCliente } from './passwordPolicy'

const ROLES_RRHH: UserRol[] = ['empleado', 'rrhh']

// Alias local solo por legibilidad
type Usuario = User

type FiltroEstado = 'todos' | 'activos' | 'inactivos'

interface UsuarioFormState {
  email: string
  nombre: string
  password: string
  rol: 'empleado' | 'rrhh'
  estado: 'activo' | 'inactivo'
}

export default function GestionUsuariosRRHH() {
  const { user } = useAuth()
  const confirm = useConfirm()
  const notify = useToast()

  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('activos')

  // Usuario en edición: abre la ventana modal (null = cerrada).
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null)

  const [form, setForm] = useState<UsuarioFormState>({
    email: '',
    nombre: '',
    password: '',
    rol: 'empleado',
    estado: 'activo',
  })

  const [guardando, setGuardando] = useState(false)

  // ---------- Helpers de permisos ----------

  const puedeModificar = (u: Usuario): boolean => {
    if (!user) return false
    // RRHH SOLO puede tocar empleados, nunca admin ni su propia cuenta
    if (u.rol !== 'empleado') return false
    if (u.id === user.id) return false
    return true
  }

  // ---------- Carga de datos ----------

  const cargar = async () => {
    try {
      setError(null)
      setLoading(true)
      const data = await getUsuarios()
      setUsuarios(data)
    } catch (e) {
      console.error(e)
      setError('No se pudieron cargar los usuarios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  // ---------- Derivados para UI ----------

  const usuariosFiltrados = useMemo(
    () =>
      usuarios.filter((u) => {
        // solo mostrar empleados en esta vista
        if (u.rol !== 'empleado') return false

        if (filtroEstado === 'activos') return u.estado === 'activo'
        if (filtroEstado === 'inactivos') return u.estado === 'inactivo'
        return true
      }),
    [usuarios, filtroEstado],
  )

  const total = usuariosFiltrados.length
  const activos = usuariosFiltrados.filter((u) => u.estado === 'activo').length
  const inactivos = usuariosFiltrados.filter((u) => u.estado === 'inactivo').length

  // ---------- Manejo de formulario ----------

  const resetForm = () => {
    setForm({
      email: '',
      nombre: '',
      password: '',
      rol: 'empleado',
      estado: 'activo',
    })
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  // El formulario de la izquierda SOLO crea. La edición ocurre en un modal.
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // Validación previa de contraseña: feedback inmediato (el servidor revalida).
    const errPass = validarPasswordCliente(form.password, form.email.trim())
    if (errPass) {
      setError(errPass)
      return
    }

    setGuardando(true)
    setError(null)

    try {
      const payload: UsuarioCreate = {
        email: form.email.trim(),
        nombre: form.nombre.trim(),
        password: form.password,
        rol: form.rol,
        estado: form.estado,
      }
      await crearUsuario(payload)
      await cargar()
      resetForm()
      notify('Cuenta de empleado creada.', 'success')
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'No se pudo guardar el usuario')
    } finally {
      setGuardando(false)
    }
  }

  // Abre la ventana de edición.
  const handleEditar = (u: Usuario) => {
    if (!puedeModificar(u)) return
    setUsuarioEditando(u)
  }

  const handleToggleEstado = async (u: Usuario) => {
    if (!puedeModificar(u)) return

    const vaADeshabilitar = u.estado === 'activo'

    const confirmado = await confirm({
      title: vaADeshabilitar ? 'Deshabilitar cuenta' : 'Habilitar cuenta',
      message: vaADeshabilitar
        ? `"${u.nombre}" no podrá iniciar sesión en el portal hasta que vuelvas a habilitar su cuenta. ¿Continuar?`
        : `"${u.nombre}" podrá volver a iniciar sesión en el portal. ¿Continuar?`,
      confirmText: vaADeshabilitar ? 'Deshabilitar' : 'Habilitar',
      danger: vaADeshabilitar,
    })
    if (!confirmado) return

    try {
      if (vaADeshabilitar) {
        await deshabilitarUsuario(u.id)
      } else {
        await habilitarUsuario(u.id)
      }
      await cargar()
      notify(
        vaADeshabilitar
          ? `Cuenta de ${u.nombre} deshabilitada.`
          : `Cuenta de ${u.nombre} habilitada.`,
        'success',
      )
    } catch (e) {
      console.error(e)
      notify(
        e instanceof Error
          ? e.message
          : 'No se pudo cambiar el estado del usuario. Intenta de nuevo.',
        'error',
      )
    }
  }

  // ---------- Render ----------

  return (
    <div className="page-container page-container--blue">
      {/* ENCABEZADO */}
      <header className="page-header">
        <div>
          <h2>Gestión de colaboradores</h2>
          <p>
            RRHH puede crear, editar y deshabilitar cuentas de empleados. Los
            administradores y tu propia cuenta quedan protegidos.
          </p>
        </div>

        {/* Resumen rápido */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="pill pill--blue">
            Empleados: <strong>{total}</strong>
          </div>
          <div className="pill pill--green">
            Activos: <strong>{activos}</strong>
          </div>
          <div className="pill pill--amber">
            Inactivos: <strong>{inactivos}</strong>
          </div>
        </div>
      </header>

      <div
        className="dashboard-grid"
        style={{ gridTemplateColumns: '1.1fr 1.9fr' }}
      >
        {/* COLUMNA 1: Formulario */}
        <div className="column">
          <div
            className="card"
            style={{
              background: '#ffffff',
            }}
          >
            <h3 className="card-title">Nueva cuenta de empleado</h3>

            <form
              onSubmit={handleSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div className="form-group">
                <label>Nombre completo</label>
                <input
                  name="nombre"
                  value={form.nombre}
                  onChange={handleChange}
                  className="input-dark"
                  required
                />
              </div>

              <div className="form-group">
                <label>Correo electrónico</label>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  className="input-dark"
                  required
                />
              </div>

              <div className="form-group">
                <label>Contraseña</label>
                <input
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleChange}
                  className="input-dark"
                  autoComplete="new-password"
                  required
                />
                <small style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.4 }}>
                  {POLITICA_PASSWORD_TEXTO}
                </small>
              </div>

              <div className="form-group">
                <label>Rol</label>
                <select
                  name="rol"
                  value={form.rol}
                  onChange={handleChange}
                  className="input-dark"
                >
                  <option value="empleado">Empleado</option>
                  <option value="rrhh">RRHH</option>
                </select>
              </div>

              <div className="form-group">
                <label>Estado</label>
                <select
                  name="estado"
                  value={form.estado}
                  onChange={handleChange}
                  className="input-dark"
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </div>

              {error && (
                <div
                  style={{
                    backgroundColor: 'rgba(220,38,38,0.06)',
                    color: '#b91c1c',
                    padding: '10px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    border: '1px solid rgba(220,38,38,0.4)',
                  }}
                >
                  {error}
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
                  {guardando ? 'Guardando...' : 'Crear cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* COLUMNA 2: Tabla de usuarios */}
        <div className="column">
          <div className="card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <h3 className="card-title">Empleados registrados</h3>

              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  fontSize: 12,
                  backgroundColor: '#f9fafb',
                  padding: '4px',
                  borderRadius: 999,
                  border: '1px solid #e5e7eb',
                }}
              >
                <FiltroChip
                  label="Activos"
                  activo={filtroEstado === 'activos'}
                  onClick={() => setFiltroEstado('activos')}
                />
                <FiltroChip
                  label="Inactivos"
                  activo={filtroEstado === 'inactivos'}
                  onClick={() => setFiltroEstado('inactivos')}
                />
                <FiltroChip
                  label="Todos"
                  activo={filtroEstado === 'todos'}
                  onClick={() => setFiltroEstado('todos')}
                />
              </div>
            </div>

            <div className="table-container">
              {loading && usuariosFiltrados.length === 0 ? (
                <p style={{ textAlign: 'center' }}>Cargando usuarios…</p>
              ) : usuariosFiltrados.length === 0 ? (
                <p style={{ textAlign: 'center', opacity: 0.6 }}>
                  No hay empleados que coincidan con el filtro.
                </p>
              ) : (
                <table className="rrhh-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Correo</th>
                      <th>Rol</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuariosFiltrados.map((u) => {
                      const editable = puedeModificar(u)
                      return (
                        <tr key={u.id}>
                          <td style={{ fontWeight: 600 }}>{u.nombre}</td>
                          <td style={{ fontSize: 13, opacity: 0.85 }}>
                            {u.email}
                          </td>
                          <td style={{ fontSize: 12, textTransform: 'uppercase' }}>
                            {u.rol}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                u.estado === 'activo'
                                  ? 'badge-aprobada'
                                  : 'badge-rechazada'
                              }`}
                            >
                              {u.estado}
                            </span>
                          </td>
                          <td>
                            {editable ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  className="action-btn btn-approve"
                                  title="Editar los datos de este empleado"
                                  onClick={() => handleEditar(u)}
                                >
                                  Editar
                                </button>
                                <button
                                  className="action-btn btn-reject"
                                  title={
                                    u.estado === 'activo'
                                      ? 'Deshabilitar: no podrá iniciar sesión'
                                      : 'Habilitar: podrá volver a iniciar sesión'
                                  }
                                  onClick={() => void handleToggleEstado(u)}
                                >
                                  {u.estado === 'activo' ? 'Deshabilitar' : 'Habilitar'}
                                </button>
                              </div>
                            ) : (
                              <span
                                style={{
                                  fontSize: 11,
                                  opacity: 0.6,
                                  fontStyle: 'italic',
                                }}
                              >
                                No editable
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <p
              style={{
                marginTop: 10,
                fontSize: 11,
                opacity: 0.6,
                textAlign: 'right',
              }}
            >
              Nota: RRHH solo puede editar empleados distintos a su propia cuenta.
            </p>
          </div>
        </div>
      </div>

      {usuarioEditando && (
        <EditarUsuarioModal
          usuario={usuarioEditando}
          rolesPermitidos={ROLES_RRHH}
          onClose={() => setUsuarioEditando(null)}
          onGuardado={() => void cargar()}
        />
      )}
    </div>
  )
}

// Pequeño componente interno para el filtro de chips
function FiltroChip({
  label,
  activo,
  onClick,
}: {
  label: string
  activo: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 999,
        border: 'none',
        fontSize: 11,
        cursor: 'pointer',
        background: activo ? '#dc2626' : 'transparent',
        color: activo ? '#ffffff' : '#6b7280',
        fontWeight: activo ? 600 : 500,
      }}
    >
      {label}
    </button>
  )
}
