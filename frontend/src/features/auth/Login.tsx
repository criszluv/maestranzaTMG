// src/features/auth/Login.tsx
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { rutaInicio } from '../../App'
import '../../styles/App.css'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { login, user } = useAuth()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await login({ email, password })
    } catch (err: unknown) {
      console.error(err)
      const message =
        err instanceof Error ? err.message : 'Error al iniciar sesión'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  // Con sesión activa no se muestra el formulario: se llega aquí con el
  // botón Atrás del navegador, y dejar un login "falso" a la vista confunde
  // (parece que cerraste sesión cuando en realidad sigue abierta).
  // `replace` evita que Atrás quede rebotando entre login y dashboard.
  if (user) return <Navigate to={rutaInicio(user.rol)} replace />

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'var(--sidebar-bg)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          padding: '32px 28px 28px',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 24px 60px rgba(2, 6, 23, 0.45)',
        }}
      >
        {/* Marca */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            aria-hidden="true"
            style={{
              width: 48,
              height: 48,
              borderRadius: 'var(--radius-md)',
              margin: '0 auto 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--brand)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: 0.5,
            }}
          >
            TMG
          </div>
          <h1 style={{ fontSize: 20, margin: 0, color: 'var(--text)', fontWeight: 650 }}>
            Portal MaestranzaTMG
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
            Accede al panel de control interno
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
        >
          <div className="form-group">
            <label htmlFor="login-email">Correo</label>
            <input
              id="login-email"
              className="input-dark"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="nombre@maestranzatmg.cl"
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Contraseña</label>
            <input
              id="login-password"
              className="input-dark"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="banner banner--danger" role="alert" style={{ marginBottom: 8 }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Entrando…' : 'Iniciar sesión'}
          </button>

          <p
            style={{
              margin: '14px 0 0',
              textAlign: 'center',
              fontSize: 12,
              color: 'var(--text-3)',
            }}
          >
            Usa las credenciales entregadas por el área de TI. Al ingresar,
            tus datos se tratan según la Ley 21.719 — revisa la sección
            «Privacidad» dentro del portal.
          </p>
        </form>
      </div>
    </div>
  )
}

export default Login
