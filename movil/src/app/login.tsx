// src/app/login.tsx
// Pantalla de login (ruta pública /login). Fondo oscuro con la marca TMG,
// mismo acceso que el portal web: email + contraseña contra /auth/login.
// Ruta propia (no index) para no chocar con (tabs)/index en "/".

import { Redirect } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../auth/AuthContext'
import { Cargando } from '../components/ui'
import { colors, fontSize, radius, shadow, space } from '../theme/tokens'

export default function Login() {
  const { user, cargando, login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Restaurando la sesión guardada: evitamos parpadeo del formulario.
  if (cargando) return <Cargando />

  // Sesión activa: directo a las pestañas.
  if (user) return <Redirect href="/(tabs)" />

  const handleLogin = async () => {
    if (!email.trim() || !password || enviando) return
    setError(null)
    setEnviando(true)
    try {
      await login({ email: email.trim().toLowerCase(), password })
      // El <Redirect> de arriba se encarga al re-renderizar con user.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <SafeAreaView style={styles.fondo}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.contenido}
          keyboardShouldPersistTaps="handled"
        >
          {/* Marca */}
          <View style={styles.marca}>
            <View style={styles.logo}>
              <Text style={styles.logoTexto}>TMG</Text>
            </View>
            <Text style={styles.nombre}>MaestranzaTMG</Text>
            <Text style={styles.subtitulo}>Portal interno · App móvil</Text>
          </View>

          {/* Formulario */}
          <View style={styles.tarjeta}>
            <Text style={styles.tituloForm}>Iniciar sesión</Text>

            <Text style={styles.etiqueta}>Correo</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="tu@correo.cl"
              placeholderTextColor={colors.text3}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              style={styles.entrada}
            />

            <Text style={styles.etiqueta}>Contraseña</Text>
            <View style={styles.entradaPassword}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.text3}
                secureTextEntry={!verPassword}
                autoCapitalize="none"
                autoComplete="password"
                style={styles.entradaPasswordInput}
                onSubmitEditing={handleLogin}
              />
              <Pressable onPress={() => setVerPassword((v) => !v)} hitSlop={8}>
                <Ionicons
                  name={verPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.text3}
                />
              </Pressable>
            </View>

            {error && (
              <View style={styles.error}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.errorTexto}>{error}</Text>
              </View>
            )}

            <Pressable
              onPress={handleLogin}
              disabled={enviando || !email.trim() || !password}
              style={({ pressed }) => [
                styles.boton,
                (enviando || !email.trim() || !password) && { opacity: 0.5 },
                pressed && { opacity: 0.8 },
              ]}
            >
              {enviando ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.botonTexto}>Ingresar</Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.pie}>
            Acceso solo para personal autorizado de la maestranza.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colors.dark },
  contenido: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: space.s5,
    gap: space.s5,
  },
  marca: { alignItems: 'center', gap: space.s2 },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoTexto: { color: '#fff', fontWeight: '800', fontSize: fontSize.lg, letterSpacing: 1 },
  nombre: { color: '#fff', fontSize: fontSize.xl, fontWeight: '700' },
  subtitulo: { color: colors.darkText, fontSize: fontSize.sm },

  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.s5,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    ...shadow.md,
  },
  tituloForm: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginBottom: space.s4,
  },
  etiqueta: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text2,
    marginBottom: space.s1 + 2,
  },
  entrada: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingVertical: space.s3 - 2,
    paddingHorizontal: space.s3,
    fontSize: fontSize.base,
    color: colors.text,
    minHeight: 44,
    marginBottom: space.s4,
  },
  entradaPassword: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.s3,
    minHeight: 44,
    marginBottom: space.s4,
  },
  entradaPasswordInput: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.text,
    paddingVertical: 0,
    minHeight: 44,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    padding: space.s3,
    marginBottom: space.s4,
  },
  errorTexto: { color: colors.danger, fontSize: fontSize.sm, flex: 1 },
  boton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonTexto: { color: '#fff', fontWeight: '700', fontSize: fontSize.md },
  pie: { color: colors.text3, fontSize: fontSize.xs, textAlign: 'center' },
})
