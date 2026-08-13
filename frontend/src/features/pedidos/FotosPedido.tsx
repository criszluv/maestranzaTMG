// src/features/pedidos/FotosPedido.tsx
// Fotos de progreso de un pedido (componente compartido):
//   - Empleado asignado: sube (máx. 10 fotos, 50 MB c/u, JPG/PNG/WebP) y elimina.
//   - RRHH/Admin: ven el progreso y pueden eliminar (moderación).
// "Eliminar" es lógico: desaparece de las vistas, el archivo queda
// resguardado en el bucket privado (Ley 21.719 / trazabilidad).

import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfirm } from '../../components/common/ConfirmDialog'
import { useToast } from '../../components/common/Toast'
import { Icon } from '../../components/common/Icon'
import { getFotos, ocultarFoto, subirFoto, type FotoPedido } from './api'

const MAX_FOTOS = 10
const MAX_MB = 5

interface Props {
  pedidoId: number
  puedeSubir?: boolean
  puedeBorrar?: boolean
}

export default function FotosPedido({ pedidoId, puedeSubir = false, puedeBorrar = false }: Props) {
  const notify = useToast()
  const confirm = useConfirm()
  const inputRef = useRef<HTMLInputElement>(null)

  const [fotos, setFotos] = useState<FotoPedido[]>([])
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setError(null)
      const data = await getFotos(pedidoId)
      setFotos(data)
    } catch (e) {
      console.error('Error cargando fotos del pedido', e)
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las fotos.')
    } finally {
      setCargando(false)
    }
  }, [pedidoId])

  useEffect(() => {
    setCargando(true)
    void cargar()
  }, [cargar])

  const handleArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    e.target.value = '' // permite re-seleccionar el mismo archivo
    if (!archivo) return

    if (archivo.size > MAX_MB * 1024 * 1024) {
      notify(`La imagen supera los ${MAX_MB} MB permitidos.`, 'error')
      return
    }

    try {
      setSubiendo(true)
      const nueva = await subirFoto(pedidoId, archivo)
      setFotos((prev) => [nueva, ...prev])
      notify('Foto de avance subida.', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo subir la imagen.', 'error')
    } finally {
      setSubiendo(false)
    }
  }

  const handleEliminar = async (foto: FotoPedido) => {
    const ok = await confirm({
      title: 'Eliminar foto de avance',
      message:
        'La foto dejará de verse en el pedido. Por trazabilidad, el archivo queda resguardado en el sistema. ¿Continuar?',
      confirmText: 'Eliminar',
      danger: true,
    })
    if (!ok) return

    try {
      await ocultarFoto(pedidoId, foto.id)
      setFotos((prev) => prev.filter((f) => f.id !== foto.id))
      notify('Foto eliminada de la vista.', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo eliminar la foto.', 'error')
    }
  }

  return (
    <div className="fotos-pedido">
      <div className="fotos-pedido__header">
        <span className="fotos-pedido__titulo">
          Fotos de avance{' '}
          <span className="fotos-pedido__contador">
            {fotos.length}/{MAX_FOTOS}
          </span>
        </span>

        {puedeSubir && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={handleArchivo}
            />
            <button
              type="button"
              className="btn-secondary"
              style={{ minHeight: 32, padding: '4px 12px', fontSize: 12 }}
              disabled={subiendo || fotos.length >= MAX_FOTOS}
              title={
                fotos.length >= MAX_FOTOS
                  ? `Máximo ${MAX_FOTOS} fotos: elimina alguna para subir otra`
                  : `JPG, PNG o WebP · máx. ${MAX_MB} MB`
              }
              onClick={() => inputRef.current?.click()}
            >
              {subiendo ? 'Subiendo…' : '+ Subir foto'}
            </button>
          </>
        )}
      </div>

      {cargando ? (
        <p className="fotos-pedido__vacio">Cargando fotos…</p>
      ) : error ? (
        <p className="fotos-pedido__vacio" style={{ color: 'var(--danger)' }}>{error}</p>
      ) : fotos.length === 0 ? (
        <p className="fotos-pedido__vacio">
          {puedeSubir
            ? 'Aún no hay fotos. Sube la primera para mostrar tu avance.'
            : 'El empleado aún no sube fotos de avance.'}
        </p>
      ) : (
        <div className="fotos-grid">
          {fotos.map((f) => (
            <figure key={f.id} className="foto-thumb">
              <a href={f.url} target="_blank" rel="noreferrer" title="Ver en tamaño completo">
                <img
                  src={f.url}
                  alt={`Avance del pedido, subida por ${f.subido_por_nombre ?? 'trabajador'}`}
                  loading="lazy"
                />
              </a>
              <figcaption className="foto-thumb__pie">
                <span title={new Date(f.subida_en).toLocaleString('es-CL')}>
                  {new Date(f.subida_en).toLocaleDateString('es-CL')}
                </span>
                {puedeBorrar && (
                  <button
                    type="button"
                    className="foto-thumb__borrar"
                    title="Eliminar esta foto"
                    aria-label="Eliminar esta foto"
                    onClick={() => void handleEliminar(f)}
                  >
                    <Icon name="papelera" size={13} />
                  </button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}
