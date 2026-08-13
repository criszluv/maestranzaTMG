// src/services/imagenes.ts
// Selección de imágenes para subir (fotos de avance de pedidos y
// foto-documento de solicitudes): cámara del dispositivo o galería.
// Devuelve un ArchivoLocal listo para subirArchivo() (multipart).
//
// Por qué se comprime ANTES de subir: la cámara de un teléfono actual
// entrega fotos de 12-50 MP que pesan varios MB. Subirlas tal cual es lento
// y caro con datos móviles, y no aporta nada para documentar un avance de
// taller. Se reescalan al lado mayor MAX_LADO_PX y se recomprimen, con lo
// que quedan en cientos de KB manteniéndose perfectamente legibles.

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import type { ArchivoLocal } from './http'

/** Tope duro alineado con el backend (FOTO_MAX_BYTES) y con el bucket. */
export const MAX_IMAGEN_MB = 50

/** Lado mayor de la imagen ya optimizada. Suficiente para leer detalles. */
const MAX_LADO_PX = 1920
/** 0 = máxima compresión, 1 = sin compresión. */
const CALIDAD = 0.7
/** Por debajo de esto no vale la pena recomprimir. */
const UMBRAL_OPTIMIZAR_BYTES = 900 * 1024

function nombreDe(asset: ImagePicker.ImagePickerAsset, mimeType: string): string {
  const ext = (mimeType.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg')
  return asset.fileName ?? `foto_${Date.now()}.${ext}`
}

/**
 * Reescala y recomprime si la foto es grande. Si algo falla (formato raro,
 * memoria), se devuelve el original: es preferible intentar subirlo a
 * perder la foto que el trabajador acaba de tomar.
 */
async function optimizar(asset: ImagePicker.ImagePickerAsset): Promise<ArchivoLocal> {
  const mimeOriginal = asset.mimeType ?? 'image/jpeg'
  const original: ArchivoLocal = {
    uri: asset.uri,
    nombre: nombreDe(asset, mimeOriginal),
    mimeType: mimeOriginal,
  }

  const esGrande =
    (asset.fileSize ?? 0) > UMBRAL_OPTIMIZAR_BYTES ||
    Math.max(asset.width ?? 0, asset.height ?? 0) > MAX_LADO_PX
  if (!esGrande) return original

  try {
    const contexto = ImageManipulator.manipulate(asset.uri)
    // Se redimensiona por el lado mayor para no deformar la imagen.
    if ((asset.width ?? 0) >= (asset.height ?? 0)) {
      contexto.resize({ width: MAX_LADO_PX })
    } else {
      contexto.resize({ height: MAX_LADO_PX })
    }
    const render = await contexto.renderAsync()
    const salida = await render.saveAsync({
      compress: CALIDAD,
      format: SaveFormat.JPEG,
    })
    return {
      uri: salida.uri,
      nombre: nombreDe(asset, 'image/jpeg').replace(/\.\w+$/, '.jpg'),
      mimeType: 'image/jpeg',
    }
  } catch {
    return original
  }
}

/** Corta temprano solo lo que el backend rechazaría de todos modos. */
function validarTamano(asset: ImagePicker.ImagePickerAsset): void {
  if (asset.fileSize && asset.fileSize > MAX_IMAGEN_MB * 1024 * 1024) {
    throw new Error(`La imagen supera los ${MAX_IMAGEN_MB} MB permitidos.`)
  }
}

/** Abre la cámara (pide permiso si hace falta). null = usuario canceló. */
export async function tomarFoto(): Promise<ArchivoLocal | null> {
  const permiso = await ImagePicker.requestCameraPermissionsAsync()
  if (!permiso.granted) {
    throw new Error('Se necesita permiso de cámara para tomar la foto.')
  }
  const resultado = await ImagePicker.launchCameraAsync({
    mediaTypes: 'images',
    quality: 1, // sin pérdida aquí: la compresión la hace optimizar()
  })
  if (resultado.canceled || !resultado.assets[0]) return null
  validarTamano(resultado.assets[0])
  return optimizar(resultado.assets[0])
}

/** Abre la galería. null = usuario canceló. */
export async function elegirDeGaleria(): Promise<ArchivoLocal | null> {
  const resultado = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    quality: 1,
  })
  if (resultado.canceled || !resultado.assets[0]) return null
  validarTamano(resultado.assets[0])
  return optimizar(resultado.assets[0])
}
