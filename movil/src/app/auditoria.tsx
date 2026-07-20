// src/app/auditoria.tsx
// Registro de cambios (auditoría Ley 21.719, RRHH/Admin). Solo lectura:
// cada INSERT/UPDATE/DELETE con su actor y los datos antes/después.

import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getAuditoria, type RegistroAuditoria } from '../api/auditoria'
import { Protegido } from '../auth/Protegido'
import { useToast } from '../components/Toast'
import {
  Badge,
  Card,
  Cargando,
  Encabezado,
  Pantalla,
  Selector,
  Vacio,
} from '../components/ui'
import { formatearFechaHora } from '../services/fechas'
import { colors, fontSize, radius, space } from '../theme/tokens'

const TODAS = ''

const TABLAS = [
  { valor: TODAS, etiqueta: 'Todas las tablas' },
  { valor: 'usuarios', etiqueta: 'Usuarios' },
  { valor: 'solicitudes', etiqueta: 'Solicitudes' },
  { valor: 'pedidos', etiqueta: 'Pedidos' },
  { valor: 'pedido_fotos', etiqueta: 'Fotos de pedidos' },
  { valor: 'clientes', etiqueta: 'Clientes' },
  { valor: 'trabajos', etiqueta: 'Trabajos' },
  { valor: 'facturas', etiqueta: 'Facturas' },
]

/** "12|correo@x.cl" -> "correo@x.cl (id 12)". */
function actorLegible(actor?: string | null): string {
  if (!actor) return 'Sistema / BD'
  const [id, email] = actor.split('|')
  if (email) return `${email} (id ${id})`
  return actor
}

function DatosJson({ titulo, datos }: { titulo: string; datos?: Record<string, unknown> | null }) {
  if (!datos) return null
  return (
    <View style={styles.jsonBloque}>
      <Text style={styles.jsonTitulo}>{titulo}</Text>
      <Text style={styles.jsonTexto}>{JSON.stringify(datos, null, 2)}</Text>
    </View>
  )
}

function AuditoriaContenido() {
  const notify = useToast()

  const [registros, setRegistros] = useState<RegistroAuditoria[]>([])
  const [tabla, setTabla] = useState<string>(TODAS)
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [expandido, setExpandido] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    try {
      const data = await getAuditoria(tabla || undefined, 100)
      setRegistros(data)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo cargar la auditoría.', 'error')
    } finally {
      setCargando(false)
    }
  }, [tabla, notify])

  useEffect(() => {
    setCargando(true)
    void cargar()
  }, [cargar])

  const onRefresh = useCallback(async () => {
    setRefrescando(true)
    await cargar()
    setRefrescando(false)
  }, [cargar])

  if (cargando) return <Cargando />

  return (
    <Pantalla onRefresh={onRefresh} refrescando={refrescando}>
      <Encabezado
        titulo="Registro de cambios"
        subtitulo="Auditoría de datos (Ley 21.719): quién cambió qué y cuándo."
      />

      <Selector valor={tabla} opciones={TABLAS} onChange={setTabla} />

      {registros.length === 0 ? (
        <Card>
          <Vacio mensaje="Sin registros para este filtro." icono="document-lock-outline" />
        </Card>
      ) : (
        registros.map((r) => {
          const abierto = expandido === r.id
          return (
            <Card key={r.id}>
              <Pressable
                onPress={() => setExpandido(abierto ? null : r.id)}
                style={styles.cabecera}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.filaTitulo}>
                    <Badge texto={r.operacion} />
                    <Text style={styles.tabla}>{r.tabla}</Text>
                    {!!r.registro_id && (
                      <Text style={styles.registroId}>#{r.registro_id}</Text>
                    )}
                  </View>
                  <Text style={styles.meta}>
                    {actorLegible(r.actor_app)} · {formatearFechaHora(r.ocurrido_en)}
                  </Text>
                </View>
                <Ionicons
                  name={abierto ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.text3}
                />
              </Pressable>

              {abierto && (
                <View style={styles.detalle}>
                  <DatosJson titulo="Antes" datos={r.datos_antes} />
                  <DatosJson titulo="Después" datos={r.datos_despues} />
                  {!r.datos_antes && !r.datos_despues && (
                    <Text style={styles.meta}>Sin datos capturados.</Text>
                  )}
                </View>
              )}
            </Card>
          )
        })
      )}
    </Pantalla>
  )
}

export default function AuditoriaScreen() {
  return (
    <Protegido rolRequerido="rrhh">
      <AuditoriaContenido />
    </Protegido>
  )
}

const styles = StyleSheet.create({
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  filaTitulo: { flexDirection: 'row', alignItems: 'center', gap: space.s2, flexWrap: 'wrap' },
  tabla: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  registroId: { fontSize: fontSize.sm, color: colors.text3 },
  meta: { fontSize: fontSize.xs, color: colors.text3, marginTop: 3 },
  detalle: {
    marginTop: space.s3,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.s3,
    gap: space.s2,
  },
  jsonBloque: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: space.s3,
  },
  jsonTitulo: { fontSize: fontSize.xs, fontWeight: '700', color: colors.text3, marginBottom: 4 },
  jsonTexto: {
    fontSize: 11,
    color: colors.text2,
    fontFamily: 'monospace',
  },
})
