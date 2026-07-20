// src/services/storage.ts
// Almacenamiento del token de sesión, multiplataforma:
//  - Nativo (Android/iOS): expo-secure-store (Keystore / Keychain cifrado).
//  - Web (expo web): localStorage, mismas claves que el portal web.
// Se expone una API async uniforme; http.ts mantiene además un caché en
// memoria para poder adjuntar el token de forma síncrona en cada request.

import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const isWeb = Platform.OS === 'web'

export async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(key)
  }
  return SecureStore.getItemAsync(key)
}

export async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(key, value)
    return
  }
  await SecureStore.setItemAsync(key, value)
}

export async function removeItem(key: string): Promise<void> {
  if (isWeb) {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(key)
    return
  }
  await SecureStore.deleteItemAsync(key)
}
