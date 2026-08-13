// src/components/common/Paginador.tsx
// Navegación por páginas para listados largos. Muestra el rango visible y
// botones numerados, resumiendo con «…» cuando hay muchas páginas para no
// desbordar la barra.

interface PaginadorProps {
  /** Página actual, empezando en 1. */
  pagina: number
  /** Cantidad total de elementos (no de páginas). */
  totalItems: number
  porPagina: number
  onCambiar: (pagina: number) => void
  /** Nombre en plural de lo que se lista ("solicitudes", "pedidos"…). */
  etiqueta?: string
}

/** Páginas a mostrar: siempre la 1 y la última, y una ventana alrededor
 *  de la actual. Los saltos se representan con null («…»). */
function paginasVisibles(actual: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const paginas = new Set<number>([1, total, actual])
  if (actual - 1 > 1) paginas.add(actual - 1)
  if (actual + 1 < total) paginas.add(actual + 1)

  const ordenadas = [...paginas].sort((a, b) => a - b)
  const conSaltos: (number | null)[] = []
  ordenadas.forEach((p, i) => {
    if (i > 0 && p - ordenadas[i - 1] > 1) conSaltos.push(null)
    conSaltos.push(p)
  })
  return conSaltos
}

export default function Paginador({
  pagina,
  totalItems,
  porPagina,
  onCambiar,
  etiqueta = 'registros',
}: PaginadorProps) {
  const totalPaginas = Math.max(1, Math.ceil(totalItems / porPagina))
  if (totalItems === 0) return null

  const desde = (pagina - 1) * porPagina + 1
  const hasta = Math.min(pagina * porPagina, totalItems)

  const estiloBoton = (activo: boolean): React.CSSProperties => ({
    minWidth: 32,
    height: 32,
    padding: '0 8px',
    borderRadius: 'var(--radius-sm)',
    border: `1px solid ${activo ? 'var(--primary)' : 'var(--border)'}`,
    background: activo ? 'var(--primary)' : 'var(--surface)',
    color: activo ? '#fff' : 'var(--text-2)',
    fontSize: 13,
    fontWeight: activo ? 700 : 500,
    cursor: 'pointer',
  })

  return (
    <nav
      aria-label={`Paginación de ${etiqueta}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        marginTop: 14,
        paddingTop: 12,
        borderTop: '1px solid var(--border)',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
        Mostrando <strong>{desde}-{hasta}</strong> de {totalItems} {etiqueta}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          onClick={() => onCambiar(pagina - 1)}
          disabled={pagina <= 1}
          aria-label="Página anterior"
          style={{ ...estiloBoton(false), opacity: pagina <= 1 ? 0.4 : 1 }}
        >
          ‹
        </button>

        {paginasVisibles(pagina, totalPaginas).map((p, i) =>
          p === null ? (
            <span key={`salto-${i}`} style={{ color: 'var(--text-3)', fontSize: 13 }}>
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onCambiar(p)}
              aria-current={p === pagina ? 'page' : undefined}
              style={estiloBoton(p === pagina)}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          onClick={() => onCambiar(pagina + 1)}
          disabled={pagina >= totalPaginas}
          aria-label="Página siguiente"
          style={{ ...estiloBoton(false), opacity: pagina >= totalPaginas ? 0.4 : 1 }}
        >
          ›
        </button>
      </div>
    </nav>
  )
}
