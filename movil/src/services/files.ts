// src/services/files.ts
// Exportación de archivos (CSV IoT, JSON de datos personales).
//  - Nativo: se escribe en caché y se abre la hoja de compartir del sistema.
//  - Web (expo web): descarga clásica con <a download>.

import { Platform } from 'react-native'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

export async function guardarYCompartirTexto(
  nombre: string,
  contenido: string,
  mimeType: string,
): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([contenido], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    return
  }

  const archivo = new File(Paths.cache, nombre)
  archivo.write(contenido)
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(archivo.uri, { mimeType, dialogTitle: nombre })
  }
}
