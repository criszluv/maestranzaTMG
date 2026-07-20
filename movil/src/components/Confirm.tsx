// src/components/Confirm.tsx
// Diálogo de confirmación multiplataforma basado en promesas.
// (Alert.alert no existe en web; este modal se ve igual en Android/iOS/web
// y reemplaza a components/common/ConfirmDialog.tsx del portal.)

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, fontSize, radius, shadow, space } from '../theme/tokens'

export interface ConfirmOpciones {
  titulo: string
  mensaje?: string
  textoConfirmar?: string
  textoCancelar?: string
  /** true => botón de confirmar en rojo (acciones destructivas). */
  peligro?: boolean
}

type ConfirmFn = (opciones: ConfirmOpciones) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opciones, setOpciones] = useState<ConfirmOpciones | null>(null)
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((op) => {
    setOpciones(op)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const responder = useCallback((ok: boolean) => {
    resolverRef.current?.(ok)
    resolverRef.current = null
    setOpciones(null)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        visible={opciones !== null}
        transparent
        animationType="fade"
        onRequestClose={() => responder(false)}
      >
        <View style={styles.fondo}>
          <View style={styles.caja}>
            <Text style={styles.titulo}>{opciones?.titulo}</Text>
            {!!opciones?.mensaje && (
              <Text style={styles.mensaje}>{opciones.mensaje}</Text>
            )}
            <View style={styles.botones}>
              <Pressable
                onPress={() => responder(false)}
                style={({ pressed }) => [styles.boton, styles.botonCancelar, pressed && styles.presionado]}
              >
                <Text style={styles.textoCancelar}>
                  {opciones?.textoCancelar ?? 'Cancelar'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => responder(true)}
                style={({ pressed }) => [
                  styles.boton,
                  { backgroundColor: opciones?.peligro ? colors.danger : colors.primary },
                  pressed && styles.presionado,
                ]}
              >
                <Text style={styles.textoConfirmar}>
                  {opciones?.textoConfirmar ?? 'Confirmar'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm debe usarse dentro de un <ConfirmProvider>')
  return ctx
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.s5,
  },
  caja: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.s5,
    width: '100%',
    maxWidth: 420,
    ...shadow.md,
  },
  titulo: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginBottom: space.s2,
  },
  mensaje: {
    fontSize: fontSize.base,
    color: colors.text2,
    marginBottom: space.s4,
    lineHeight: 20,
  },
  botones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.s3,
    marginTop: space.s2,
  },
  boton: {
    paddingVertical: space.s3,
    paddingHorizontal: space.s4,
    borderRadius: radius.md,
    minWidth: 100,
    alignItems: 'center',
  },
  botonCancelar: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presionado: { opacity: 0.7 },
  textoCancelar: { color: colors.text2, fontWeight: '600', fontSize: fontSize.base },
  textoConfirmar: { color: '#ffffff', fontWeight: '700', fontSize: fontSize.base },
})
