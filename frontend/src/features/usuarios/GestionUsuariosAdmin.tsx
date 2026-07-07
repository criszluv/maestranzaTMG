// src/features/usuarios/GestionUsuariosAdmin.tsx
// Vista de ADMIN: gestiona cuentas de todos los roles.
import { useEffect, useState, useCallback, useMemo } from 'react'
import '../../styles/App.css'
import type {
  User as Usuario,
  UserRol as Rol,
  UserEstado as EstadoUsuario,
} from '../auth/api'
import {
  type UsuarioCreate,
  getUsuarios,
  crearUsuario,
  actualizarUsuario,
  deshabilitarUsuario,
  habilitarUsuario,
} from './api'
import EditarUsuarioModal from './EditarUsuarioModal'
import { useConfirm } from '../../components/common/ConfirmDialog'
import { useToast } from '../../components/common/Toast'
import { EmptyState } from '../../components/common/EmptyState'
import { POLITICA_PASSWORD_TEXTO, validarPasswordCliente } from './passwordPolicy'

const ROLES_ADMIN: Rol[] = ['empleado', 'rrhh', 'admin']

interface FormState {
  email: string
  nombre: string
  password: string
  rol: Rol
  estado: EstadoUsuario
}

const FORM_VACIO: FormState = {
  email: '',
  nombre: '',
  password: '',
  rol: 'empleado',
  estado: 'activo',
}

export default function GestionUsuariosAdmin() {
  const confirm = useConfirm()
  const notify = useToast()

  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Usuario en edición: abre la ventana modal (null = cerrada).
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null)
  const [form, setForm] = useState<FormState>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getUsuarios()
      setUsuarios(data)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo cargar la lista de usuarios',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const { total, admins, rrhh, empleados } = useMemo(
    () => ({
      total: usuarios.length,
      admins: usuarios.filter((u) => u.rol === 'admin').length,
      rrhh: usuarios.filter((u) => u.rol === 'rrhh').length,
      empleados: usuarios.filter((u) => u.rol === 'empleado').length,
    }),
    [usuarios],
  )

  const resetForm = () => {
    setForm(FORM_VACIO)
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
      notify(`Usuario "${form.nombre}" creado.`, 'success')
      await cargar()
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el usuario')
    } finally {
      setGuardando(false)
    }
  }

  // Abre la ventana de edición.
  const handleEditar = (u: Usuario) => {
    setUsuarioEditando(u)
  }

  const handleCambiarRol = async (u: Usuario, nuevoRol: Rol) => {
    if (nuevoRol === u.rol) return

    const confirmado = await confirm({
      title: 'Cambiar rol de usuario',
      message: `"${u.nombre}" pasará de "${u.rol}" a "${nuevoRol}". Esto cambia a qué partes del sistema puede entrar. ¿Continuar?`,
      confirmText: 'Cambiar rol',
      danger: true,
    })
    if (!confirmado) return

    try {
      await actualizarUsuario(u.id, { rol: nuevoRol })
      await cargar()
      notify(`"${u.nombre}" ahora tiene el rol "${nuevoRol}".`, 'success')
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'No se pudo cambiar el rol del usuario.',
        'error',
      )
    }
  }

  const handleToggleEstado = async (u: Usuario) => {
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
        vaADeshabilitar ? `Cuenta de ${u.nombre} deshabilitada.` : `Cuenta de ${u.nombre} habilitada.`,
        'success',
      )
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'No se pudo cambiar el estado del usuario.',
        'error',
      )
    }
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h2>Gestión de usuarios</h2>
          <p>Crea cuentas y administra el rol/estado de todos los usuarios: empleados, RRHH y administradores.</p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div className="pill pill--blue">Total: <strong>{total}</strong></div>
          <div className="pill pill--green">RRHH: <strong>{rrhh}</strong></div>
          <div className="pill pill--amber">Admins: <strong>{admins}</strong></div>
          <div className="pill pill--blue">Empleados: <strong>{empleados}</strong></div>
        </div>
      </header>

      <div className="dashboard-grid" style={{ gridTemplateColumns: '1.1fr 1.9fr' }}>
        {/* COLUMNA 1: Formulario */}
        <div className="column">
          <div className="card">
            <h3 className="card-title">Nueva cuenta</h3>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                <select name="rol" value={form.rol} onChange={handleChange} className="input-dark">
                  <option value="empleado">Empleado</option>
                  <option value="rrhh">RRHH</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="form-group">
                <label>Estado</label>
                <select name="estado" value={form.estado} onChange={handleChange} className="input-dark">
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
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
                  {guardando ? 'Guardando...' : 'Crear cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* COLUMNA 2: Tabla de usuarios */}
        <div className="column">
          <div className="card">
            <h3 className="card-title">Usuarios registrados</h3>

            <div className="table-container">
              {loading && usuarios.length === 0 ? (
                <p style={{ textAlign: 'center' }}>Cargando usuarios…</p>
              ) : usuarios.length === 0 ? (
                <EmptyState icon="usuarios" title="No hay usuarios registrados" />
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
                    {usuarios.map((u) => (
                      <tr key={u.id}>
                        <td style={{ fontWeight: 600 }}>{u.nombre}</td>
                        <td style={{ fontSize: 13, opacity: 0.85 }}>{u.email}</td>
                        <td>
                          <select
                            value={u.rol}
                            onChange={(e) => handleCambiarRol(u, e.target.value as Rol)}
                            className="input-dark"
                            style={{ padding: '4px 8px', fontSize: 12 }}
                          >
                            <option value="empleado">Empleado</option>
                            <option value="rrhh">RRHH</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td>
                          <span className={`badge ${u.estado === 'activo' ? 'badge-aprobada' : 'badge-rechazada'}`}>
                            {u.estado}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="action-btn btn-approve"
                              title="Editar los datos de este usuario"
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
                              onClick={() => handleToggleEstado(u)}
                            >
                              {u.estado === 'activo' ? 'Deshabilitar' : 'Habilitar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {usuarioEditando && (
        <EditarUsuarioModal
          usuario={usuarioEditando}
          rolesPermitidos={ROLES_ADMIN}
          onClose={() => setUsuarioEditando(null)}
          onGuardado={() => void cargar()}
        />
      )}
    </div>
  )
}
