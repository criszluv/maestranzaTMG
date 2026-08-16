// src/App.tsx
// Enrutado de la SPA. Las vistas viven en features/<módulo>/ (dominio):
//   auth · usuarios · solicitudes (días libres) · asistencia (marcaje
//   vía Workera) · pedidos · sensores (IoT + reportería)
import type { ReactNode, FC } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

// Vistas por módulo
import Login from './features/auth/Login'
import DashboardSensores from './features/sensores/DashboardSensores'
import MisSolicitudes from './features/solicitudes/MisSolicitudes'
import GestionSolicitudesRRHH from './features/solicitudes/GestionSolicitudesRRHH'
import SolicitudesAdmin from './features/solicitudes/SolicitudesAdmin'
import GestionUsuariosAdmin from './features/usuarios/GestionUsuariosAdmin'
import GestionUsuariosRRHH from './features/usuarios/GestionUsuariosRRHH'
import HistorialAsistencia from './features/asistencia/HistorialAsistencia'
import MiPrivacidad from './features/privacidad/MiPrivacidad'
import GestionPedidos from './features/pedidos/GestionPedidos'
import MisPedidosEmpleado from './features/pedidos/MisPedidosEmpleado'
import Auditoria from './features/auditoria/Auditoria'
import GestionMaquinas from './features/maquinas/GestionMaquinas'
import GestionClientes from './features/clientes/GestionClientes'
import GestionTrabajos from './features/trabajos/GestionTrabajos'
import PagosPendientes from './features/facturas/PagosPendientes'

// Navegación principal
import Sidebar from './components/layout/Sidebar'

// Contexto de autenticación
import { AuthProvider, useAuth } from './features/auth/AuthContext'

// UI compartida: reemplazan alert()/confirm() nativos del navegador
import { ConfirmProvider } from './components/common/ConfirmDialog'
import { ToastProvider } from './components/common/Toast'

// Tipamos el rol igual que en el backend/usuario
type Rol = 'admin' | 'rrhh' | 'empleado'

interface ProtectedRouteProps {
  children: ReactNode
  rolRequerido?: Rol
}

/**
 * Pantalla de aterrizaje de cada rol. El Panel de planta es de operaciones
 * (admin y empleados); RRHH trabaja con personas, así que su inicio son las
 * solicitudes. Sin esto, un RRHH enviado a /dashboard rebotaría en bucle.
 */
export function rutaInicio(rol: Rol): string {
  return rol === 'rrhh' ? '/rrhh/gestion' : '/dashboard'
}

/**
 * Segunda línea de defensa para la UX: la AUTORIZACIÓN real está en el
 * backend (JWT + require_roles); esto solo evita mostrar pantallas que el
 * usuario no podría usar.
 */
const ProtectedRoute: FC<ProtectedRouteProps> = ({ children, rolRequerido }) => {
  const { user } = useAuth()

  // 1. Si no hay usuario, lo botamos al login
  if (!user) {
    return <Navigate to="/" replace />
  }

  // 2. Si hay rol requerido y el usuario no lo cumple (y no es admin), lo
  //    mandamos al inicio que SÍ le corresponde.
  if (rolRequerido && user.rol !== rolRequerido && user.rol !== 'admin') {
    return <Navigate to={rutaInicio(user.rol)} replace />
  }

  // 3. Usuario autenticado y autorizado -> renderizamos la vista
  return <>{children}</>
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <div className="app-shell">
            {/* La Sidebar decide internamente qué mostrar según el rol */}
            <Sidebar />

            <main className="app-main">
              <Routes>
              {/* Login (ruta pública) */}
              <Route path="/" element={<Login />} />

              {/* Panel de planta (sensores IoT): operaciones, no RRHH */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute rolRequerido="empleado">
                    <DashboardSensores />
                  </ProtectedRoute>
                }
              />

              {/* Privacidad (Ley 21.719): todos los roles autenticados */}
              <Route
                path="/privacidad"
                element={
                  <ProtectedRoute>
                    <MiPrivacidad />
                  </ProtectedRoute>
                }
              />

              {/* Rutas Empleado */}
              <Route
                path="/empleado/mis-solicitudes"
                element={
                  <ProtectedRoute rolRequerido="empleado">
                    <MisSolicitudes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/empleado/mis-pedidos"
                element={
                  <ProtectedRoute rolRequerido="empleado">
                    <MisPedidosEmpleado />
                  </ProtectedRoute>
                }
              />

              {/* Rutas RRHH */}
              <Route
                path="/rrhh/gestion"
                element={
                  <ProtectedRoute rolRequerido="rrhh">
                    <GestionSolicitudesRRHH />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/rrhh/mis-solicitudes"
                element={
                  <ProtectedRoute rolRequerido="rrhh">
                    <MisSolicitudes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/rrhh/auditoria"
                element={
                  <ProtectedRoute rolRequerido="rrhh">
                    <Auditoria />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/rrhh/clientes"
                element={
                  <ProtectedRoute rolRequerido="rrhh">
                    <GestionClientes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/rrhh/trabajos"
                element={
                  <ProtectedRoute rolRequerido="rrhh">
                    <GestionTrabajos />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/rrhh/pagos"
                element={
                  <ProtectedRoute rolRequerido="rrhh">
                    <PagosPendientes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/rrhh/usuarios"
                element={
                  <ProtectedRoute rolRequerido="rrhh">
                    <GestionUsuariosRRHH />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/rrhh/asistencia"
                element={
                  <ProtectedRoute rolRequerido="rrhh">
                    <HistorialAsistencia />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/rrhh/pedidos"
                element={
                  <ProtectedRoute rolRequerido="rrhh">
                    <GestionPedidos />
                  </ProtectedRoute>
                }
              />

              {/* Rutas Admin */}
              <Route
                path="/admin/usuarios"
                element={
                  <ProtectedRoute rolRequerido="admin">
                    <GestionUsuariosAdmin />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/solicitudes"
                element={
                  <ProtectedRoute rolRequerido="admin">
                    <SolicitudesAdmin />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/asistencia"
                element={
                  <ProtectedRoute rolRequerido="admin">
                    <HistorialAsistencia />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/pedidos"
                element={
                  <ProtectedRoute rolRequerido="admin">
                    <GestionPedidos />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/empleado/maquinas"
                element={
                  <ProtectedRoute rolRequerido="empleado">
                    <GestionMaquinas />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/maquinas"
                element={
                  <ProtectedRoute rolRequerido="rrhh">
                    <GestionMaquinas />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/auditoria"
                element={
                  <ProtectedRoute rolRequerido="admin">
                    <Auditoria />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/clientes"
                element={
                  <ProtectedRoute rolRequerido="admin">
                    <GestionClientes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/trabajos"
                element={
                  <ProtectedRoute rolRequerido="admin">
                    <GestionTrabajos />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/pagos"
                element={
                  <ProtectedRoute rolRequerido="admin">
                    <PagosPendientes />
                  </ProtectedRoute>
                }
              />

                {/* Fallback 404 -> redirige al login */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  )
}
