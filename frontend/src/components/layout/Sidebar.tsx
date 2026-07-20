// src/components/layout/Sidebar.tsx
// Navegación principal: sidebar oscura con secciones por dominio.
// Arquitectura de información: los módulos se agrupan en PRINCIPAL /
// PERSONAS / OPERACIÓN según el rol, en vez de una lista plana.

import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthContext'
import { Icon, type IconName } from '../common/Icon'

interface ItemNav {
  to: string
  label: string
  icon: IconName
}

interface SeccionNav {
  titulo: string | null
  items: ItemNav[]
}

const INICIO: ItemNav = { to: '/dashboard', label: 'Panel de planta', icon: 'panel' }

// Ley 21.719 (deber de información): visible para todos los roles.
const PRIVACIDAD: SeccionNav = {
  titulo: 'Transparencia',
  items: [{ to: '/privacidad', label: 'Privacidad', icon: 'escudo' }],
}

/** Menú por rol: solo se muestran módulos que el usuario puede usar. */
function seccionesPara(rol: 'admin' | 'rrhh' | 'empleado'): SeccionNav[] {
  if (rol === 'empleado') {
    return [
      { titulo: null, items: [INICIO] },
      {
        titulo: 'Mi trabajo',
        items: [
          { to: '/empleado/mis-solicitudes', label: 'Mis solicitudes', icon: 'solicitudes' },
          { to: '/empleado/mis-pedidos', label: 'Mis pedidos', icon: 'pedidos' },
        ],
      },
      PRIVACIDAD,
    ]
  }
  if (rol === 'rrhh') {
    return [
      { titulo: null, items: [INICIO] },
      {
        titulo: 'Personas',
        items: [
          { to: '/rrhh/gestion', label: 'Solicitudes', icon: 'solicitudes' },
          { to: '/rrhh/asistencia', label: 'Asistencia', icon: 'asistencia' },
          { to: '/rrhh/usuarios', label: 'Usuarios', icon: 'usuarios' },
        ],
      },
      {
        titulo: 'Mi trabajo',
        items: [
          { to: '/rrhh/mis-solicitudes', label: 'Mis días libres', icon: 'solicitudes' },
        ],
      },
      {
        titulo: 'Operación',
        items: [
          { to: '/rrhh/clientes', label: 'Clientes', icon: 'usuarios' },
          { to: '/rrhh/trabajos', label: 'Trabajos', icon: 'pedidos' },
          { to: '/rrhh/pagos', label: 'Pagos pendientes', icon: 'solicitudes' },
          { to: '/rrhh/pedidos', label: 'Pedidos', icon: 'pedidos' },
          { to: '/rrhh/auditoria', label: 'Registro de cambios', icon: 'escudo' },
        ],
      },
      PRIVACIDAD,
    ]
  }
  // admin
  return [
    { titulo: null, items: [INICIO] },
    {
      titulo: 'Personas',
      items: [
        { to: '/admin/usuarios', label: 'Usuarios', icon: 'usuarios' },
        { to: '/admin/solicitudes', label: 'Solicitudes', icon: 'solicitudes' },
        { to: '/admin/asistencia', label: 'Asistencia', icon: 'asistencia' },
      ],
    },
    {
      titulo: 'Operación',
      items: [
        { to: '/admin/clientes', label: 'Clientes', icon: 'usuarios' },
        { to: '/admin/trabajos', label: 'Trabajos', icon: 'pedidos' },
        { to: '/admin/pagos', label: 'Pagos pendientes', icon: 'solicitudes' },
        { to: '/admin/pedidos', label: 'Pedidos', icon: 'pedidos' },
        { to: '/admin/auditoria', label: 'Registro de cambios', icon: 'escudo' },
      ],
    },
    PRIVACIDAD,
  ]
}

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Sin sesión o en el login no hay navegación
  if (!user || location.pathname === '/') return null

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <aside className="sidebar" aria-label="Navegación principal">
      <div className="sidebar__brand">
        <div className="sidebar__logo" aria-hidden="true">TMG</div>
        <div>
          <div className="sidebar__brand-name">MaestranzaTMG</div>
          <div className="sidebar__brand-sub">Portal interno</div>
        </div>
      </div>

      <nav className="sidebar__nav">
        {seccionesPara(user.rol).map((seccion, i) => (
          <div key={seccion.titulo ?? `seccion-${i}`}>
            {seccion.titulo && (
              <div className="sidebar__section">{seccion.titulo}</div>
            )}
            {seccion.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `sidebar__link${isActive ? ' sidebar__link--activo' : ''}`
                }
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__avatar" aria-hidden="true">
          {iniciales(user.nombre)}
        </div>
        <div className="sidebar__user">
          <div className="sidebar__user-nombre" title={user.nombre}>
            {user.nombre}
          </div>
          <div className="sidebar__user-rol">{user.rol}</div>
        </div>
        <button
          type="button"
          className="sidebar__logout"
          onClick={handleLogout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
        >
          <Icon name="salir" size={17} />
        </button>
      </div>
    </aside>
  )
}
