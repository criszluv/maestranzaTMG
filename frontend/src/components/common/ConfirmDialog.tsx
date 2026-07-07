import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'

interface ConfirmOptions {
  /** Pregunta corta, ej: "¿Aprobar esta solicitud?" */
  title: string
  /** Detalle en lenguaje simple, ej: "Juan Pérez podrá tomar sus vacaciones del 10 al 15 de enero." */
  message: string
  confirmText?: string
  cancelText?: string
  /** true = botón de confirmar en rojo (para acciones que quitan acceso o no se pueden deshacer) */
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * Reemplaza window.confirm() por un modal propio de la app: explica la
 * acción en palabras simples (no un "¿Estás seguro?" genérico) y usa los
 * mismos colores/tipografía que el resto del portal, en vez del diálogo
 * gris del navegador que puede confundir a alguien sin experiencia técnica.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const resolver = (value: boolean) => {
    setOptions(null)
    resolverRef.current?.(value)
    resolverRef.current = null
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(17,24,39,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => resolver(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: 14,
              padding: '24px 24px 20px',
              maxWidth: 420,
              width: '100%',
              boxShadow: '0 20px 45px rgba(0,0,0,0.25)',
              borderTop: `4px solid ${options.danger ? '#dc2626' : '#16a34a'}`,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 18, color: '#111827' }}>
              {options.title}
            </h3>
            <p style={{ margin: '10px 0 20px', fontSize: 14, color: '#4b5563', lineHeight: 1.5 }}>
              {options.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => resolver(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#ffffff',
                  color: '#374151',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {options.cancelText ?? 'Cancelar'}
              </button>
              <button
                onClick={() => resolver(true)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: options.danger ? '#dc2626' : '#16a34a',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {options.confirmText ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

/** Úsalo como: const confirm = useConfirm(); const ok = await confirm({ title, message }) */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>')
  }
  return ctx
}
