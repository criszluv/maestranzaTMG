// src/features/usuarios/EditarUsuarioModal.tsx
// Edición de un usuario en una ventana aparte (modal), separada del formulario
// de "crear cuenta" para no confundir. Registra el cambio en la auditoría de la
// BD (el backend fija el actor real).

import { useState } from 'react'
import Modal from '../../components/common/Modal'
import { useToast } from '../../components/common/Toast'
import type { User, UserRol, UserEstado } from '../auth/api'
import { actualizarUsuario, type UsuarioUpdate } from './api'
import { POLITICA_PASSWORD_TEXTO, validarPasswordCliente } from './passwordPolicy'

interface Props {
  usuario: User
  /** Roles que este gestor puede asignar (RRHH: sin admin; Admin: todos). */
  rolesPermitidos: UserRol[]
  onClose: () => void
  onGuardado: () => void
}

const LABEL_ROL: Record<UserRol, string> = {
  empleado: 'Empleado',
  rrhh: 'RRHH',
  admin: 'Admin',
}

export default function EditarUsuarioModal({
  usuario,
  rolesPermitidos,
  onClose,
  onGuardado,
}: Props) {
  const notify = useToast()

  const [nombre, setNombre] = useState(usuario.nombre)
  const [email, setEmail] = useState(usuario.email)
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<UserRol>(usuario.rol)
  const [estado, setEstado] = useState<UserEstado>(usuario.estado)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    // La contraseña solo se valida/envía si se escribió una nueva.
    if (password) {
      const errPass = validarPasswordCliente(password, email.trim())
      if (errPass) {
        setError(errPass)
        return
      }
    }

    const payload: UsuarioUpdate = {
      email: email.trim(),
      nombre: nombre.trim(),
      rol,
      estado,
      ...(password ? { password } : {}),
    }

    try {
      setGuardando(true)
      await actualizarUsuario(usuario.id, payload)
      notify('Cambios guardados.', 'success')
      onGuardado()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el usuario.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal title={`Editar usuario: ${usuario.nombre}`} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="form-group">
          <label>Nombre completo</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="input-dark"
            required
          />
        </div>

        <div className="form-group">
          <label>Correo electrónico</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-dark"
            required
          />
        </div>

        <div className="form-group">
          <label>
            Nueva contraseña{' '}
            <span style={{ fontSize: 11, opacity: 0.7 }}>(déjala vacía para no cambiarla)</span>
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-dark"
            autoComplete="new-password"
          />
          {password && (
            <small style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.4 }}>
              {POLITICA_PASSWORD_TEXTO}
            </small>
          )}
        </div>

        <div className="form-group">
          <label>Rol</label>
          <select
            value={rol}
            onChange={(e) => setRol(e.target.value as UserRol)}
            className="input-dark"
          >
            {rolesPermitidos.map((r) => (
              <option key={r} value={r}>{LABEL_ROL[r]}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Estado</label>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as UserEstado)}
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
              padding: 10,
              borderRadius: 8,
              fontSize: 13,
              border: '1px solid rgba(220,38,38,0.4)',
            }}
          >
            ⚠ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4, justifyContent: 'flex-end' }}>
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
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
