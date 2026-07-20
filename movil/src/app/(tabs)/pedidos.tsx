// src/app/(tabs)/pedidos.tsx
// Pestaña Pedidos: contenido según rol.
//  - empleado: sus pedidos asignados (estado + fotos de avance).
//  - rrhh/admin: gestión completa de pedidos.

import { useAuth } from '../../auth/AuthContext'
import { GestionPedidosView } from '../../features/pedidos/GestionPedidosView'
import { MisPedidosView } from '../../features/pedidos/MisPedidosView'

export default function TabPedidos() {
  const { user } = useAuth()
  if (!user) return null
  return user.rol === 'empleado' ? <MisPedidosView /> : <GestionPedidosView />
}
