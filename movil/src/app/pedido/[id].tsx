// src/app/pedido/[id].tsx
// Detalle de un pedido: fotos de avance del taller.
// El empleado asignado (o RRHH/Admin) puede subir fotos con la cámara o
// desde la galería; se guardan en el bucket privado de Supabase Storage.
// Las URLs son firmadas y temporales (~1 h): se usan al momento.

import { Image } from 'expo-image'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getFotos, ocultarFoto, subirFoto, type FotoPedido } from '../../api/pedidos'
import { useConfirm } from '../../components/Confirm'
import { useToast } from '../../components/Toast'
import {
  Badge,
  Boton,
  Card,
  CardTitulo,
  Cargando,
  Pantalla,
  Vacio,
} from '../../components/ui'
import { formatearFechaHora } from '../../services/fechas'
import { elegirDeGaleria, tomarFoto } from '../../services/imagenes'
import { colors, fontSize, radius, space } from '../../theme/tokens'

export default function DetallePedido() {
  const params = useLocalSearchParams<{ id: string; nombre?: string; estado?: string }>()
  const pedidoId = Number(params.id)
  const notify = useToast()
  const confirm = useConfirm()
  const { width } = useWindowDimensions()

  const [fotos, setFotos] = useState<FotoPedido[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [fotoAbierta, setFotoAbierta] = useState<FotoPedido | null>(null)

  const cargar = useCallback(async () => {
    if (!Number.isFinite(pedidoId)) return
    try {
      const data = await getFotos(pedidoId)
      setFotos(data)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudieron cargar las fotos.', 'error')
    } finally {
      setCargando(false)
    }
  }, [pedidoId, notify])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const onRefresh = useCallback(async () => {
    setRefrescando(true)
    await cargar()
    setRefrescando(false)
  }, [cargar])

  const subir = async (origen: 'camara' | 'galeria') => {
    setSubiendo(true)
    try {
      const archivo = origen === 'camara' ? await tomarFoto() : await elegirDeGaleria()
      if (!archivo) return
      await subirFoto(pedidoId, archivo)
      notify('Foto de avance subida.', 'success')
      await cargar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo subir la foto.', 'error')
    } finally {
      setSubiendo(false)
    }
  }

  const handleOcultar = async (foto: FotoPedido) => {
    const ok = await confirm({
      titulo: 'Quitar foto',
      mensaje:
        'La foto desaparecerá de las vistas, pero el archivo queda resguardado (auditoría).',
      textoConfirmar: 'Quitar',
      peligro: true,
    })
    if (!ok) return
    try {
      await ocultarFoto(pedidoId, foto.id)
      setFotoAbierta(null)
      notify('Foto quitada.', 'success')
      await cargar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo quitar la foto.', 'error')
    }
  }

  // 2 columnas de miniaturas con el padding de Pantalla (16) y gap (8).
  const ladoMiniatura = (Math.min(width, 640) - space.s4 * 2 - space.s2) / 2

  if (cargando) return <Cargando />

  return (
    <>
      {!!params.nombre && <Stack.Screen options={{ title: params.nombre }} />}
      <Pantalla onRefresh={onRefresh} refrescando={refrescando}>
        <Card>
          <View style={styles.cabecera}>
            <View style={{ flex: 1 }}>
              <Text style={styles.nombre}>{params.nombre ?? `Pedido #${pedidoId}`}</Text>
              <Text style={styles.sub}>
                {fotos.length} foto(s) de avance
              </Text>
            </View>
            {!!params.estado && <Badge texto={params.estado} />}
          </View>

          <View style={styles.botones}>
            <Boton
              titulo="Tomar foto"
              icono="camera-outline"
              onPress={() => subir('camara')}
              cargando={subiendo}
              style={{ flex: 1 }}
            />
            <Boton
              titulo="Galería"
              icono="images-outline"
              variante="secundario"
              onPress={() => subir('galeria')}
              deshabilitado={subiendo}
              style={{ flex: 1 }}
            />
          </View>
        </Card>

        <Card>
          <CardTitulo>Fotos de avance</CardTitulo>
          {fotos.length === 0 ? (
            <Vacio
              mensaje="Aún no hay fotos. Sube la primera desde la cámara o la galería."
              icono="images-outline"
            />
          ) : (
            <View style={styles.grilla}>
              {fotos.map((foto) => (
                <Pressable
                  key={foto.id}
                  onPress={() => setFotoAbierta(foto)}
                  style={({ pressed }) => [pressed && { opacity: 0.8 }]}
                >
                  <Image
                    source={{ uri: foto.url }}
                    style={{
                      width: ladoMiniatura,
                      height: ladoMiniatura,
                      borderRadius: radius.md,
                      backgroundColor: colors.surface2,
                    }}
                    contentFit="cover"
                    transition={150}
                  />
                  <Text style={styles.fotoMeta} numberOfLines={1}>
                    {foto.subido_por_nombre ?? '—'} · {formatearFechaHora(foto.subida_en)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </Card>
      </Pantalla>

      {/* Visor de foto a pantalla completa */}
      <Modal
        visible={fotoAbierta !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFotoAbierta(null)}
      >
        <View style={styles.visorFondo}>
          <Pressable style={styles.visorCerrar} onPress={() => setFotoAbierta(null)} hitSlop={12}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          {fotoAbierta && (
            <>
              <Image
                source={{ uri: fotoAbierta.url }}
                style={styles.visorImagen}
                contentFit="contain"
              />
              <View style={styles.visorPie}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.visorTexto}>
                    {fotoAbierta.subido_por_nombre ?? 'Desconocido'}
                  </Text>
                  <Text style={styles.visorTextoSub}>
                    {formatearFechaHora(fotoAbierta.subida_en)}
                    {fotoAbierta.nombre_original ? ` · ${fotoAbierta.nombre_original}` : ''}
                  </Text>
                </View>
                <Boton
                  titulo="Quitar"
                  icono="trash-outline"
                  variante="peligro"
                  compacto
                  onPress={() => void handleOcultar(fotoAbierta)}
                />
              </View>
            </>
          )}
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  cabecera: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.s3,
    marginBottom: space.s3,
  },
  nombre: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  sub: { fontSize: fontSize.sm, color: colors.text3, marginTop: 2 },
  botones: { flexDirection: 'row', gap: space.s3 },

  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  fotoMeta: { fontSize: 10, color: colors.text3, marginTop: 3, maxWidth: 160 },

  visorFondo: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.96)',
    justifyContent: 'center',
  },
  visorCerrar: {
    position: 'absolute',
    top: 48,
    right: space.s4,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.full,
    padding: space.s2,
  },
  visorImagen: { flex: 1, marginVertical: 90 },
  visorPie: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    padding: space.s4,
    paddingBottom: space.s5 + space.s2,
    backgroundColor: 'rgba(2, 6, 23, 0.7)',
  },
  visorTexto: { color: '#fff', fontWeight: '600', fontSize: fontSize.sm },
  visorTextoSub: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs, marginTop: 1 },
})
