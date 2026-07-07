import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

type NotifyFn = (message: string, type?: ToastType) => void

const ToastContext = createContext<NotifyFn | null>(null)

const colores: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  success: { bg: '#f0fdf4', border: '#16a34a', text: '#166534', icon: '✓' },
  error: { bg: '#fef2f2', border: '#dc2626', text: '#b91c1c', icon: '⚠' },
  info: { bg: '#fafafa', border: '#9ca3af', text: '#374151', icon: 'ℹ' },
}

/**
 * Reemplaza alert() por una notificación propia de la app (esquina inferior
 * derecha, se cierra sola). Un alert() del navegador detiene toda la
 * pantalla y no dice si el mensaje es bueno o malo a simple vista; esto sí.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const notify = useCallback<NotifyFn>((message, type = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4500)
  }, [])

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          zIndex: 1100,
          maxWidth: 340,
        }}
      >
        {toasts.map((t) => {
          const c = colores[t.type]
          return (
            <div
              key={t.id}
              role="status"
              style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                color: c.text,
                borderRadius: 10,
                padding: '12px 14px',
                fontSize: 14,
                boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}
            >
              <span style={{ fontWeight: 700 }}>{c.icon}</span>
              <span>{t.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

/** Úsalo como: const notify = useToast(); notify('Solicitud enviada', 'success') */
export function useToast(): NotifyFn {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast debe usarse dentro de <ToastProvider>')
  }
  return ctx
}
