// src/app/(tabs)/menu.tsx
// Menú principal: espejo móvil de la Sidebar web. Agrupa los módulos por
// dominio (Personas / Mi trabajo / Operación / Transparencia) según rol,
// más la ficha del usuario y el cierre de sesión.

import { router, type Href } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../auth/AuthContext'
import { useConfirm } from '../../components/Confirm'
import { Card, Pantalla } from '../../components/ui'
import { API_BASE_URL } from '../../services/http'
import { colors, fontSize, radius, space } from '../../theme/tokens'

interface ItemNav {
  href: Href
  label: string
  icono: keyof typeof Ionicons.glyphMap
  detalle?: string
}

interface SeccionNav {
  titulo: string
  items: ItemNav[]
}

const PRIVACIDAD: SeccionNav = {
  titulo: 'Transparencia',
  items: [
    {
      href: '/privacidad',
      label: 'Privacidad',
      icono: 'shield-checkmark-outline',
      detalle: 'Tus datos y derechos (Ley 21.719)',
    },
  ],
}

/** Menú por rol: solo módulos que el usuario puede usar (espejo de la web). */
function seccionesPara(rol: 'admin' | 'rrhh' | 'empleado'): SeccionNav[] {
  if (rol === 'empleado') {
    return [PRIVACIDAD]
  }
  // rrhh y admin comparten módulos de gestión; el backend igual re-valida.
  const secciones: SeccionNav[] = [
    {
      titulo: 'Personas',
      items: [
        {
          href: '/asistencia',
          label: 'Asistencia',
          icono: 'time-outline',
          detalle: 'Marcaje Workera: jornadas y reporte mensual',
        },
        {
          href: '/usuarios',
          label: 'Usuarios',
          icono: 'people-outline',
          detalle: 'Cuentas, roles y estados',
        },
        {
          href: '/saldos',
          label: 'Saldos de vacaciones',
          icono: 'sunny-outline',
          detalle: '15 días hábiles por año',
        },
      ],
    },
    {
      titulo: 'Mi trabajo',
      items: [
        {
          href: '/mis-solicitudes',
          label: 'Mis días libres',
          icono: 'calendar-clear-outline',
          detalle: 'Tus propias solicitudes',
        },
      ],
    },
    {
      titulo: 'Operación',
      items: [
        { href: '/clientes', label: 'Clientes', icono: 'business-outline' },
        { href: '/trabajos', label: 'Trabajos', icono: 'hammer-outline' },
        { href: '/pagos', label: 'Pagos pendientes', icono: 'cash-outline' },
        {
          href: '/auditoria',
          label: 'Registro de cambios',
          icono: 'document-lock-outline',
          detalle: 'Auditoría Ley 21.719',
        },
      ],
    },
    PRIVACIDAD,
  ]
  return secciones
}

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

const NOMBRE_ROL: Record<string, string> = {
  admin: 'Administrador',
  rrhh: 'RRHH',
  empleado: 'Empleado',
}

export default function Menu() {
  const { user, logout } = useAuth()
  const confirm = useConfirm()

  if (!user) return null

  const handleLogout = async () => {
    const ok = await confirm({
      titulo: 'Cerrar sesión',
      mensaje: '¿Quieres salir del portal?',
      textoConfirmar: 'Salir',
      peligro: true,
    })
    if (ok) await logout()
  }

  return (
    <Pantalla>
      {/* Ficha del usuario */}
      <Card style={styles.ficha}>
        <View style={styles.avatar}>
          <Text style={styles.avatarTexto}>{iniciales(user.nombre)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nombre}>{user.nombre}</Text>
          <Text style={styles.correo}>{user.email}</Text>
          <Text style={styles.rol}>{NOMBRE_ROL[user.rol] ?? user.rol}</Text>
        </View>
      </Card>

      {/* Secciones de navegación */}
      {seccionesPara(user.rol).map((seccion) => (
        <View key={seccion.titulo} style={{ gap: space.s2 }}>
          <Text style={styles.seccionTitulo}>{seccion.titulo.toUpperCase()}</Text>
          <Card style={{ padding: 0 }}>
            {seccion.items.map((item, i) => (
              <Pressable
                key={item.label}
                onPress={() => router.push(item.href)}
                style={({ pressed }) => [
                  styles.item,
                  i > 0 && styles.itemBorde,
                  pressed && { backgroundColor: colors.surface2 },
                ]}
              >
                <View style={styles.itemIcono}>
                  <Ionicons name={item.icono} size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemLabel}>{item.label}</Text>
                  {!!item.detalle && <Text style={styles.itemDetalle}>{item.detalle}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.text3} />
              </Pressable>
            ))}
          </Card>
        </View>
      ))}

      {/* Cerrar sesión */}
      <Card style={{ padding: 0 }}>
        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.dangerSoft }]}
        >
          <View style={[styles.itemIcono, { backgroundColor: colors.dangerSoft }]}>
            <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          </View>
          <Text style={[styles.itemLabel, { color: colors.danger }]}>Cerrar sesión</Text>
        </Pressable>
      </Card>

      {/* Info técnica discreta (útil para soporte) */}
      <Text style={styles.infoApi}>Conectado a {API_BASE_URL}</Text>
    </Pantalla>
  )
}

const styles = StyleSheet.create({
  ficha: { flexDirection: 'row', alignItems: 'center', gap: space.s4 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: { color: '#fff', fontWeight: '700', fontSize: fontSize.md },
  nombre: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  correo: { fontSize: fontSize.sm, color: colors.text3 },
  rol: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '700', marginTop: 2 },

  seccionTitulo: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.text3,
    letterSpacing: 0.8,
    paddingHorizontal: space.s1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    paddingVertical: space.s3,
    paddingHorizontal: space.s4,
  },
  itemBorde: { borderTopWidth: 1, borderTopColor: colors.border },
  itemIcono: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  itemDetalle: { fontSize: fontSize.xs, color: colors.text3, marginTop: 1 },
  infoApi: { fontSize: fontSize.xs, color: colors.text3, textAlign: 'center' },
})
