// src/components/ui.tsx
// Kit de UI compartido de la app móvil: tarjetas, botones, badges,
// campos de formulario, selector (picker modal), estados vacíos y carga.
// Mantiene el mismo lenguaje visual del portal web (tokens ISA-101).

import { useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontSize, radius, shadow, space } from '../theme/tokens'

// =========================
//  CONTENEDOR DE PANTALLA
// =========================

interface PantallaProps {
  children: ReactNode
  /** Pull-to-refresh (opcional). */
  onRefresh?: () => void | Promise<void>
  refrescando?: boolean
  /** Sin ScrollView (para pantallas que usan FlatList). */
  sinScroll?: boolean
}

export function Pantalla({ children, onRefresh, refrescando, sinScroll }: PantallaProps) {
  if (sinScroll) {
    return <View style={styles.pantalla}>{children}</View>
  }
  return (
    <ScrollView
      style={styles.pantalla}
      contentContainerStyle={styles.pantallaContenido}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refrescando}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  )
}

// =========================
//  TARJETA
// =========================

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function CardTitulo({ children }: { children: ReactNode }) {
  return <Text style={styles.cardTitulo}>{children}</Text>
}

// =========================
//  BOTONES
// =========================

type VarianteBoton = 'primario' | 'secundario' | 'peligro' | 'fantasma'

interface BotonProps {
  titulo: string
  onPress: () => void
  variante?: VarianteBoton
  deshabilitado?: boolean
  cargando?: boolean
  icono?: keyof typeof Ionicons.glyphMap
  compacto?: boolean
  style?: StyleProp<ViewStyle>
}

export function Boton({
  titulo,
  onPress,
  variante = 'primario',
  deshabilitado,
  cargando,
  icono,
  compacto,
  style,
}: BotonProps) {
  const inactivo = deshabilitado || cargando

  const fondo: Record<VarianteBoton, StyleProp<ViewStyle>> = {
    primario: { backgroundColor: colors.primary },
    secundario: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    peligro: { backgroundColor: colors.danger },
    fantasma: { backgroundColor: 'transparent' },
  }
  const colorTexto =
    variante === 'secundario' ? colors.text2 : variante === 'fantasma' ? colors.primary : '#fff'

  return (
    <Pressable
      onPress={onPress}
      disabled={inactivo}
      style={({ pressed }) => [
        styles.boton,
        compacto && styles.botonCompacto,
        fondo[variante],
        inactivo && { opacity: 0.5 },
        pressed && !inactivo && { opacity: 0.8 },
        style,
      ]}
    >
      {cargando ? (
        <ActivityIndicator size="small" color={colorTexto} />
      ) : (
        <>
          {icono && <Ionicons name={icono} size={compacto ? 14 : 16} color={colorTexto} />}
          <Text
            style={[
              styles.botonTexto,
              compacto && styles.botonTextoCompacto,
              { color: colorTexto },
            ]}
          >
            {titulo}
          </Text>
        </>
      )}
    </Pressable>
  )
}

// =========================
//  BADGES / PILLS
// =========================

type TonoBadge = 'verde' | 'ambar' | 'rojo' | 'azul' | 'neutro'

const TONOS: Record<TonoBadge, { bg: string; border: string; texto: string }> = {
  verde: { bg: colors.successSoft, border: colors.successBorder, texto: colors.success },
  ambar: { bg: colors.warningSoft, border: colors.warningBorder, texto: colors.warning },
  rojo: { bg: colors.dangerSoft, border: colors.dangerBorder, texto: colors.danger },
  azul: { bg: colors.infoSoft, border: colors.infoBorder, texto: colors.info },
  neutro: { bg: colors.surface2, border: colors.border, texto: colors.text2 },
}

/** Tono estándar por estado de dominio (solicitudes, pedidos, etc.). */
export function tonoDeEstado(estado: string): TonoBadge {
  const e = estado.toLowerCase()
  if (['aprobada', 'terminado', 'finalizado', 'pagada', 'habilitado', 'activo'].includes(e)) {
    return 'verde'
  }
  if (['pendiente'].includes(e)) return 'ambar'
  if (['rechazada', 'deshabilitado', 'inactivo', 'delete'].includes(e)) return 'rojo'
  if (['en proceso', 'insert', 'update'].includes(e)) return 'azul'
  return 'neutro'
}

export function Badge({ texto, tono }: { texto: string; tono?: TonoBadge }) {
  const t = TONOS[tono ?? tonoDeEstado(texto)]
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[styles.badgeTexto, { color: t.texto }]}>{texto.toUpperCase()}</Text>
    </View>
  )
}

export function Pill({
  etiqueta,
  valor,
  tono = 'neutro',
}: {
  etiqueta: string
  valor: string | number
  tono?: TonoBadge
}) {
  const t = TONOS[tono]
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[styles.pillTexto, { color: t.texto }]}>
        {etiqueta}: <Text style={{ fontWeight: '700' }}>{valor}</Text>
      </Text>
    </View>
  )
}

// =========================
//  FORMULARIOS
// =========================

export function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <View style={styles.campo}>
      <Text style={styles.campoEtiqueta}>{etiqueta}</Text>
      {children}
    </View>
  )
}

export function Entrada(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.text3}
      {...props}
      style={[styles.entrada, props.multiline && styles.entradaMultilinea, props.style]}
    />
  )
}

interface SelectorProps<T extends string | number> {
  valor: T | null
  opciones: { valor: T; etiqueta: string }[]
  onChange: (valor: T) => void
  placeholder?: string
  deshabilitado?: boolean
}

/** Reemplazo móvil de <select>: abre un modal con las opciones. */
export function Selector<T extends string | number>({
  valor,
  opciones,
  onChange,
  placeholder = 'Selecciona…',
  deshabilitado,
}: SelectorProps<T>) {
  const [abierto, setAbierto] = useState(false)
  const seleccionada = opciones.find((o) => o.valor === valor)

  return (
    <>
      <Pressable
        onPress={() => !deshabilitado && setAbierto(true)}
        style={[styles.entrada, styles.selector, deshabilitado && { opacity: 0.5 }]}
      >
        <Text
          style={[styles.selectorTexto, !seleccionada && { color: colors.text3 }]}
          numberOfLines={1}
        >
          {seleccionada?.etiqueta ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.text3} />
      </Pressable>

      <Modal
        visible={abierto}
        transparent
        animationType="fade"
        onRequestClose={() => setAbierto(false)}
      >
        <Pressable style={styles.selectorFondo} onPress={() => setAbierto(false)}>
          <View style={styles.selectorCaja}>
            <ScrollView style={{ maxHeight: 380 }}>
              {opciones.map((op) => {
                const activa = op.valor === valor
                return (
                  <Pressable
                    key={String(op.valor)}
                    onPress={() => {
                      onChange(op.valor)
                      setAbierto(false)
                    }}
                    style={({ pressed }) => [
                      styles.selectorOpcion,
                      activa && { backgroundColor: colors.primarySoft },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.selectorOpcionTexto,
                        activa && { color: colors.primary, fontWeight: '700' },
                      ]}
                    >
                      {op.etiqueta}
                    </Text>
                    {activa && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

// =========================
//  BUSCADOR
// =========================

export function Buscador({
  valor,
  onChange,
  placeholder = 'Buscar…',
}: {
  valor: string
  onChange: (texto: string) => void
  placeholder?: string
}) {
  return (
    <View style={styles.buscador}>
      <Ionicons name="search" size={16} color={colors.text3} />
      <TextInput
        value={valor}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.text3}
        style={styles.buscadorEntrada}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {valor.length > 0 && (
        <Pressable onPress={() => onChange('')} hitSlop={8}>
          <Ionicons name="close-circle" size={16} color={colors.text3} />
        </Pressable>
      )}
    </View>
  )
}

// =========================
//  ESTADOS VACÍO / CARGA
// =========================

export function Vacio({ mensaje, icono = 'file-tray-outline' }: {
  mensaje: string
  icono?: keyof typeof Ionicons.glyphMap
}) {
  return (
    <View style={styles.vacio}>
      <Ionicons name={icono} size={32} color={colors.borderStrong} />
      <Text style={styles.vacioTexto}>{mensaje}</Text>
    </View>
  )
}

export function Cargando() {
  return (
    <View style={styles.vacio}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  )
}

// =========================
//  ENCABEZADO DE PANTALLA
// =========================

export function Encabezado({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <View style={styles.encabezado}>
      <Text style={styles.encabezadoTitulo}>{titulo}</Text>
      {!!subtitulo && <Text style={styles.encabezadoSubtitulo}>{subtitulo}</Text>}
    </View>
  )
}

/** Fila etiqueta: valor para fichas de detalle. */
export function FilaDato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <View style={styles.filaDato}>
      <Text style={styles.filaDatoEtiqueta}>{etiqueta}</Text>
      {typeof valor === 'string' || typeof valor === 'number' ? (
        <Text style={styles.filaDatoValor}>{valor}</Text>
      ) : (
        valor
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.bg },
  pantallaContenido: { padding: space.s4, paddingBottom: space.s6, gap: space.s4 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.s4,
    ...shadow.sm,
  },
  cardTitulo: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginBottom: space.s3,
  },

  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s2,
    paddingVertical: space.s3,
    paddingHorizontal: space.s4,
    borderRadius: radius.full,
    minHeight: 44,
  },
  botonCompacto: {
    paddingVertical: space.s1,
    paddingHorizontal: space.s3,
    minHeight: 32,
  },
  botonTexto: { fontWeight: '700', fontSize: fontSize.base },
  botonTextoCompacto: { fontSize: fontSize.sm },

  badge: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingVertical: 2,
    paddingHorizontal: space.s2 + 2,
    alignSelf: 'flex-start',
  },
  badgeTexto: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },

  pill: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingVertical: space.s1 + 1,
    paddingHorizontal: space.s3,
  },
  pillTexto: { fontSize: fontSize.xs },

  campo: { marginBottom: space.s4, gap: space.s1 + 2 },
  campoEtiqueta: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text2 },
  entrada: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingVertical: space.s3 - 2,
    paddingHorizontal: space.s3,
    fontSize: fontSize.base,
    color: colors.text,
    minHeight: 44,
  },
  entradaMultilinea: { minHeight: 88, textAlignVertical: 'top' },

  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s2,
  },
  selectorTexto: { fontSize: fontSize.base, color: colors.text, flex: 1 },
  selectorFondo: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: space.s5,
  },
  selectorCaja: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: space.s2,
    ...shadow.md,
  },
  selectorOpcion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.s3,
    paddingHorizontal: space.s4,
  },
  selectorOpcionTexto: { fontSize: fontSize.base, color: colors.text, flex: 1 },

  buscador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.s3,
    minHeight: 44,
  },
  buscadorEntrada: { flex: 1, fontSize: fontSize.base, color: colors.text, paddingVertical: 0 },

  vacio: { alignItems: 'center', paddingVertical: space.s6, gap: space.s3 },
  vacioTexto: { color: colors.text3, fontSize: fontSize.sm, textAlign: 'center' },

  encabezado: { gap: space.s1 },
  encabezadoTitulo: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  encabezadoSubtitulo: { fontSize: fontSize.sm, color: colors.text2, lineHeight: 19 },

  filaDato: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.s3,
    paddingVertical: space.s1 + 2,
  },
  filaDatoEtiqueta: { fontSize: fontSize.sm, color: colors.text3 },
  filaDatoValor: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
})
