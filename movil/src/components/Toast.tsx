// src/components/Toast.tsx
// Avisos no bloqueantes (éxito / error / info) apilados bajo la zona segura.
// Equivalente móvil de components/common/Toast.tsx de la web.

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fontSize, radius, shadow, space } from '../theme/tokens'

type Tipo = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  mensaje: string
  tipo: Tipo
}

type Notify = (mensaje: string, tipo?: Tipo) => void

const ToastContext = createContext<Notify | undefined>(undefined)

const PALETA: Record<Tipo, { bg: string; border: string; texto: string }> = {
  success: { bg: colors.successSoft, border: colors.successBorder, texto: colors.success },
  error: { bg: colors.dangerSoft, border: colors.dangerBorder, texto: colors.danger },
  info: { bg: colors.infoSoft, border: colors.infoBorder, texto: colors.info },
}

function Burbuja({ item }: { item: ToastItem }) {
  const opacidad = useRef(new Animated.Value(0)).current

  // Aparece con fade-in; el provider la retira a los 3,5 s.
  Animated.timing(opacidad, {
    toValue: 1,
    duration: 180,
    useNativeDriver: true,
  }).start()

  const paleta = PALETA[item.tipo]
  return (
    <Animated.View
      style={[
        styles.burbuja,
        { backgroundColor: paleta.bg, borderColor: paleta.border, opacity: opacidad },
      ]}
    >
      <Text style={[styles.texto, { color: paleta.texto }]}>{item.mensaje}</Text>
    </Animated.View>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const siguienteId = useRef(1)
  const insets = useSafeAreaInsets()

  const notify = useCallback<Notify>((mensaje, tipo = 'info') => {
    const id = siguienteId.current++
    setItems((prev) => [...prev, { id, mensaje, tipo }])
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
  }, [])

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <View
        pointerEvents="none"
        style={[styles.contenedor, { top: insets.top + space.s2 }]}
      >
        {items.map((item) => (
          <Burbuja key={item.id} item={item} />
        ))}
      </View>
    </ToastContext.Provider>
  )
}

export function useToast(): Notify {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de un <ToastProvider>')
  return ctx
}

const styles = StyleSheet.create({
  contenedor: {
    position: 'absolute',
    left: space.s4,
    right: space.s4,
    gap: space.s2,
    zIndex: 1000,
    alignItems: 'center',
  },
  burbuja: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.s3,
    paddingHorizontal: space.s4,
    maxWidth: 520,
    width: '100%',
    ...shadow.md,
  },
  texto: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
})
