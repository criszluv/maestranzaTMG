// src/app/(tabs)/solicitudes.tsx
// Pestaña Solicitudes: contenido según rol.
//  - empleado: sus propias solicitudes (crear + historial).
//  - rrhh/admin: gestión de solicitudes del equipo (sus propias
//    solicitudes viven en Menú > Mis días libres).

import { useAuth } from '../../auth/AuthContext'
import { GestionSolicitudesView } from '../../features/solicitudes/GestionSolicitudesView'
import { MisSolicitudesView } from '../../features/solicitudes/MisSolicitudesView'

export default function TabSolicitudes() {
  const { user } = useAuth()
  if (!user) return null
  return user.rol === 'empleado' ? <MisSolicitudesView /> : <GestionSolicitudesView />
}
