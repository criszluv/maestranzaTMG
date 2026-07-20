// src/features/solicitudes/AdjuntoSolicitud.tsx
// Foto-documento de respaldo de una solicitud (1 por solicitud).
// Ver: abre la URL firmada temporal. Editar (solo si está Pendiente):
// subir/reemplazar desde cámara o galería, o eliminar.

import * as WebBrowser from 'expo-web-browser'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  eliminarAdjunto,
  getAdjunto,
  subirAdjunto,
} from '../../api/solicitudes'
import { useConfirm } from '../../components/Confirm'
import { useToast } from '../../components/Toast'
import { Boton } from '../../components/ui'
import { elegirDeGaleria, tomarFoto } from '../../services/imagenes'
import { colors, fontSize, space } from '../../theme/tokens'

interface Props {
  solicitudId: number
  tieneAdjunto: boolean
  puedeEditar: boolean
  /** Para refrescar la lista tras subir/eliminar. */
  onCambio?: () => void
}

export function AdjuntoSolicitud({ solicitudId, tieneAdjunto, puedeEditar, onCambio }: Props) {
  const notify = useToast()
  const confirm = useConfirm()
  const [ocupado, setOcupado] = useState(false)

  const ver = async () => {
    setOcupado(true)
    try {
      const adjunto = await getAdjunto(solicitudId)
      await WebBrowser.openBrowserAsync(adjunto.url)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo abrir el documento.', 'error')
    } finally {
      setOcupado(false)
    }
  }

  const subir = async (origen: 'camara' | 'galeria') => {
    setOcupado(true)
    try {
      const archivo = origen === 'camara' ? await tomarFoto() : await elegirDeGaleria()
      if (!archivo) return
      await subirAdjunto(solicitudId, archivo)
      notify('Documento adjuntado.', 'success')
      onCambio?.()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo subir el documento.', 'error')
    } finally {
      setOcupado(false)
    }
  }

  const eliminar = async () => {
    const ok = await confirm({
      titulo: 'Eliminar documento',
      mensaje: '¿Quieres eliminar el documento adjunto de esta solicitud?',
      textoConfirmar: 'Eliminar',
      peligro: true,
    })
    if (!ok) return
    setOcupado(true)
    try {
      await eliminarAdjunto(solicitudId)
      notify('Documento eliminado.', 'success')
      onCambio?.()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo eliminar el documento.', 'error')
    } finally {
      setOcupado(false)
    }
  }

  if (!tieneAdjunto && !puedeEditar) return null

  return (
    <View style={styles.fila}>
      {tieneAdjunto ? (
        <>
          <Boton
            titulo="Ver documento"
            icono="image-outline"
            variante="secundario"
            compacto
            onPress={ver}
            cargando={ocupado}
          />
          {puedeEditar && (
            <Boton
              titulo="Eliminar"
              icono="trash-outline"
              variante="fantasma"
              compacto
              onPress={eliminar}
              deshabilitado={ocupado}
            />
          )}
        </>
      ) : (
        <>
          <Text style={styles.ayuda}>Adjuntar respaldo:</Text>
          <Boton
            titulo="Cámara"
            icono="camera-outline"
            variante="secundario"
            compacto
            onPress={() => subir('camara')}
            deshabilitado={ocupado}
          />
          <Boton
            titulo="Galería"
            icono="images-outline"
            variante="secundario"
            compacto
            onPress={() => subir('galeria')}
            deshabilitado={ocupado}
          />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    flexWrap: 'wrap',
  },
  ayuda: { fontSize: fontSize.xs, color: colors.text3 },
})
