// src/services/imagenes.ts
// Selección de imágenes para subir (fotos de avance de pedidos y
// foto-documento de solicitudes): cámara del dispositivo o galería.
// Devuelve un ArchivoLocal listo para subirArchivo() (multipart).

import * as ImagePicker from 'expo-image-picker'
import type { ArchivoLocal } from './http'

export const MAX_IMAGEN_MB = 5

function aArchivoLocal(asset: ImagePicker.ImagePickerAsset): ArchivoLocal {
  const nombre =
    asset.fileName ??
    `foto_${Date.now()}.${(asset.mimeType ?? 'image/jpeg').split('/')[1] ?? 'jpg'}`
  return {
    uri: asset.uri,
    nombre,
    mimeType: asset.mimeType ?? 'image/jpeg',
  }
}

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
    quality: 0.8,
  })
  if (resultado.canceled || !resultado.assets[0]) return null
  validarTamano(resultado.assets[0])
  return aArchivoLocal(resultado.assets[0])
}

/** Abre la galería. null = usuario canceló. */
export async function elegirDeGaleria(): Promise<ArchivoLocal | null> {
  const resultado = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    quality: 0.8,
  })
  if (resultado.canceled || !resultado.assets[0]) return null
  validarTamano(resultado.assets[0])
  return aArchivoLocal(resultado.assets[0])
}
