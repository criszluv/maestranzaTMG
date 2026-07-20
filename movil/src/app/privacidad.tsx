// src/app/privacidad.tsx
// Privacidad (Ley 21.719): política de tratamiento de datos y descarga
// del paquete de datos personales. Disponible para todos los roles.

import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { descargarMisDatos, getPolitica, type PoliticaTratamiento } from '../api/privacidad'
import { Protegido } from '../auth/Protegido'
import { useToast } from '../components/Toast'
import {
  Boton,
  Card,
  CardTitulo,
  Cargando,
  Encabezado,
  Pantalla,
  Vacio,
} from '../components/ui'
import { colors, fontSize, radius, space } from '../theme/tokens'

function PrivacidadContenido() {
  const notify = useToast()
  const [politica, setPolitica] = useState<PoliticaTratamiento | null>(null)
  const [cargando, setCargando] = useState(true)
  const [descargando, setDescargando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const data = await getPolitica()
      setPolitica(data)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo cargar la política.', 'error')
    } finally {
      setCargando(false)
    }
  }, [notify])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const handleDescargar = async () => {
    setDescargando(true)
    try {
      await descargarMisDatos()
      notify('Paquete de datos generado.', 'success')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudieron descargar tus datos.', 'error')
    } finally {
      setDescargando(false)
    }
  }

  if (cargando) return <Cargando />

  return (
    <Pantalla>
      <Encabezado
        titulo="Tu privacidad"
        subtitulo="Cómo tratamos tus datos personales (Ley 21.719)."
      />

      {/* Derecho de acceso / portabilidad */}
      <Card>
        <CardTitulo>Tus datos personales</CardTitulo>
        <Text style={styles.parrafo}>
          Puedes descargar una copia completa de los datos personales que el
          portal guarda sobre ti, en formato JSON.
        </Text>
        <Boton
          titulo="Descargar mis datos"
          icono="download-outline"
          onPress={handleDescargar}
          cargando={descargando}
        />
      </Card>

      {politica === null ? (
        <Card>
          <Vacio mensaje="La política de tratamiento no está disponible." />
        </Card>
      ) : (
        <>
          <Card>
            <CardTitulo>Responsable del tratamiento</CardTitulo>
            <Text style={styles.parrafo}>{politica.responsable}</Text>
            <Text style={styles.parrafoSecundario}>Contacto: {politica.contacto}</Text>
            {politica.marco_legal.length > 0 && (
              <Text style={styles.parrafoSecundario}>
                Marco legal: {politica.marco_legal.join(' · ')}
              </Text>
            )}
          </Card>

          <Card>
            <CardTitulo>Qué datos usamos y para qué</CardTitulo>
            {politica.finalidades.map((f, i) => (
              <View key={i} style={[styles.finalidad, i > 0 && styles.finalidadBorde]}>
                <Text style={styles.finalidadDato}>{f.dato}</Text>
                <Text style={styles.parrafoSecundario}>{f.finalidad}</Text>
                <Text style={styles.finalidadMeta}>
                  Base: {f.base_licitud} · Plazo: {f.plazo}
                </Text>
              </View>
            ))}
          </Card>

          <Card>
            <CardTitulo>Tus derechos</CardTitulo>
            {Object.entries(politica.derechos).map(([nombre, descripcion]) => (
              <View key={nombre} style={styles.derecho}>
                <Text style={styles.derechoNombre}>{nombre}</Text>
                <Text style={styles.parrafoSecundario}>{descripcion}</Text>
              </View>
            ))}
          </Card>

          <Card>
            <CardTitulo>Medidas de seguridad</CardTitulo>
            {politica.medidas_seguridad.map((m, i) => (
              <View key={i} style={styles.medida}>
                <View style={styles.punto} />
                <Text style={[styles.parrafoSecundario, { flex: 1 }]}>{m}</Text>
              </View>
            ))}
          </Card>

          <Card>
            <CardTitulo>Brechas de seguridad</CardTitulo>
            <Text style={styles.parrafoSecundario}>{politica.brechas}</Text>
          </Card>
        </>
      )}
    </Pantalla>
  )
}

export default function PrivacidadScreen() {
  return (
    <Protegido>
      <PrivacidadContenido />
    </Protegido>
  )
}

const styles = StyleSheet.create({
  parrafo: { fontSize: fontSize.base, color: colors.text2, marginBottom: space.s3, lineHeight: 20 },
  parrafoSecundario: { fontSize: fontSize.sm, color: colors.text2, lineHeight: 19 },
  finalidad: { paddingVertical: space.s2, gap: 2 },
  finalidadBorde: { borderTopWidth: 1, borderTopColor: colors.border },
  finalidadDato: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  finalidadMeta: { fontSize: fontSize.xs, color: colors.text3 },
  derecho: { marginBottom: space.s3, gap: 2 },
  derechoNombre: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'capitalize',
  },
  medida: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s2, marginBottom: space.s2 },
  punto: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    marginTop: 7,
  },
})
