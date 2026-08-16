// src/app/(tabs)/_layout.tsx
// Pestañas principales. Las 4 pestañas son las mismas para todos los
// roles, pero su CONTENIDO cambia: Solicitudes y Pedidos muestran la
// vista personal (empleado) o la de gestión (rrhh/admin).

import { Redirect, Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../auth/AuthContext'
import { Cargando } from '../../components/ui'
import { colors, fontSize } from '../../theme/tokens'

export default function TabsLayout() {
  const { user, cargando } = useAuth()

  if (cargando) return <Cargando />
  if (!user) return <Redirect href="/login" />

  const esGestion = user.rol === 'rrhh' || user.rol === 'admin'
  // El Panel de planta es de operaciones (admin y empleados). RRHH gestiona
  // personas: el backend le responde 403, así que se le oculta la pestaña.
  const veLaPlanta = user.rol !== 'rrhh'

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.text3,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: fontSize.xs - 1, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Panel de planta',
          tabBarLabel: 'Inicio',
          href: veLaPlanta ? undefined : null,   // null = pestaña oculta
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="speedometer-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="solicitudes"
        options={{
          title: esGestion ? 'Solicitudes del equipo' : 'Mis solicitudes',
          tabBarLabel: 'Solicitudes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pedidos"
        options={{
          title: esGestion ? 'Gestión de pedidos' : 'Mis pedidos',
          tabBarLabel: 'Pedidos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="construct-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menú',
          tabBarLabel: 'Menú',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="menu-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
