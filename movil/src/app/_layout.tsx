// src/app/_layout.tsx
// Raíz de la app: providers globales (sesión, toasts, confirmaciones) y
// el stack de navegación. Las pantallas de módulo (solo RRHH/Admin) viven
// en el stack; las 4 pestañas principales en (tabs).

import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from '../auth/AuthContext'
import { ConfirmProvider } from '../components/Confirm'
import { ToastProvider } from '../components/Toast'
import { colors } from '../theme/tokens'

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.surface },
                headerTintColor: colors.text,
                headerTitleStyle: { fontWeight: '700' },
                headerBackButtonDisplayMode: 'minimal',
                contentStyle: { backgroundColor: colors.bg },
              }}
            >
              <Stack.Screen name="login" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="pedido/[id]" options={{ title: 'Detalle del pedido' }} />
              <Stack.Screen name="mis-solicitudes" options={{ title: 'Mis días libres' }} />
              <Stack.Screen name="saldos" options={{ title: 'Saldos de vacaciones' }} />
              <Stack.Screen name="asistencia" options={{ title: 'Asistencia' }} />
              <Stack.Screen name="usuarios" options={{ title: 'Usuarios' }} />
              <Stack.Screen name="clientes" options={{ title: 'Clientes' }} />
              <Stack.Screen name="trabajos" options={{ title: 'Trabajos' }} />
              <Stack.Screen name="pagos" options={{ title: 'Pagos pendientes' }} />
              <Stack.Screen name="auditoria" options={{ title: 'Registro de cambios' }} />
              <Stack.Screen name="privacidad" options={{ title: 'Privacidad' }} />
            </Stack>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </SafeAreaProvider>
  )
}
