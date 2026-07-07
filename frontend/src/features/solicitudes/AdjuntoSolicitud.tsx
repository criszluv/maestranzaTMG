// src/features/solicitudes/AdjuntoSolicitud.tsx
// Adjunto (1 foto-documento) de una solicitud. Reutilizable:
//   - Trabajador dueño: ve, adjunta, reemplaza y quita su documento.
//   - RRHH/Admin: ven el documento al revisar la solicitud.
// El archivo vive en el bucket privado; aquí se pide una URL firmada temporal.

import { useRef, useState } from 'react'
import { useToast } from '../../components/common/Toast'
import { getAdjunto, subirAdjunto, eliminarAdjunto } from './api'

const MAX_MB = 5

interface Props {
  solicitudId: number
  tieneAdjunto: boolean
  puedeEditar?: boolean
  onCambio?: (tieneAdjunto: boolean) => void
}

export default function AdjuntoSolicitud({
  solicitudId,
  tieneAdjunto,
  puedeEditar = false,
  onCambio,
}: Props) {
  const notify = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [tiene, setTiene] = useState(tieneAdjunto)
  const [ocupado, setOcupado] = useState(false)

  const verDocumento = async () => {
    try {
      setOcupado(true)
      const { url } = await getAdjunto(solicitudId)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo abrir el documento.', 'error')
    } finally {
      setOcupado(false)
    }
  }

  const handleArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    if (archivo.size > MAX_MB * 1024 * 1024) {
      notify(`El documento supera los ${MAX_MB} MB permitidos.`, 'error')
      return
    }
    try {
      setOcupado(true)
      await subirAdjunto(solicitudId, archivo)
      setTiene(true)
      onCambio?.(true)
      notify('Documento adjuntado.', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo subir el documento.', 'error')
    } finally {
      setOcupado(false)
    }
  }

  const quitar = async () => {
    try {
      setOcupado(true)
      await eliminarAdjunto(solicitudId)
      setTiene(false)
      onCambio?.(false)
      notify('Documento eliminado.', 'success')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo eliminar el documento.', 'error')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {tiene ? (
        <>
          <button
            type="button"
            className="action-btn btn-approve"
            onClick={() => void verDocumento()}
            disabled={ocupado}
            title="Abrir el documento adjunto"
          >
            📎 Ver documento
          </button>
          {puedeEditar && (
            <button
              type="button"
              className="action-btn btn-reject"
              onClick={() => void quitar()}
              disabled={ocupado}
              title="Quitar el documento"
            >
              Quitar
            </button>
          )}
        </>
      ) : puedeEditar ? (
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
            className="action-btn btn-approve"
            onClick={() => inputRef.current?.click()}
            disabled={ocupado}
            title={`Foto del documento · JPG, PNG o WebP · máx. ${MAX_MB} MB`}
          >
            {ocupado ? 'Subiendo…' : '+ Adjuntar documento'}
          </button>
        </>
      ) : (
        <span style={{ fontSize: 12, color: '#9ca3af' }}>Sin documento</span>
      )}
    </div>
  )
}
