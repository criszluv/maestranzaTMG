// src/features/pedidos/MisPedidosView.tsx
// Pedidos asignados al empleado: actualizar estado a medida que avanza
// y subir fotos de avance desde el taller (pantalla de detalle).

import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  actualizarEstadoPedido,
  getMisPedidos,
  type EstadoPedido,
  type Pedido,
} from '../../api/pedidos'
import { useAuth } from '../../auth/AuthContext'
import { useToast } from '../../components/Toast'
import {
  Badge,
  Boton,
  Card,
  Cargando,
  Encabezado,
  Pantalla,
  Selector,
  Vacio,
} from '../../components/ui'
import { formatearCLP } from '../../services/fechas'
import { colors, fontSize, space } from '../../theme/tokens'

const OPCIONES_ESTADO = [
  { valor: 'pendiente' as EstadoPedido, etiqueta: 'Pendiente' },
  { valor: 'en proceso' as EstadoPedido, etiqueta: 'En proceso' },
  { valor: 'terminado' as EstadoPedido, etiqueta: 'Terminado' },
]

export function MisPedidosView() {
  const { user } = useAuth()
  const notify = useToast()

  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [actualizando, setActualizando] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    if (!user) return
    try {
      const data = await getMisPedidos(user.id)
      setPedidos(data)
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'No se pudieron cargar tus pedidos.',
        'error',
      )
    } finally {
      setCargando(false)
    }
  }, [user, notify])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const onRefresh = useCallback(async () => {
    setRefrescando(true)
    await cargar()
    setRefrescando(false)
  }, [cargar])

  const handleCambiarEstado = async (p: Pedido, nuevoEstado: EstadoPedido) => {
    if (nuevoEstado === p.estado) return
    setActualizando(p.id)
    try {
      await actualizarEstadoPedido(p.id, nuevoEstado)
      await cargar()
      notify(`"${p.pedido}" marcado como "${nuevoEstado}".`, 'success')
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : 'No se pudo actualizar el estado del pedido. Intenta de nuevo.',
        'error',
      )
    } finally {
      setActualizando(null)
    }
  }

  if (cargando) return <Cargando />

  const enProceso = pedidos.filter((p) => p.estado === 'en proceso').length
  const pendientes = pedidos.filter((p) => p.estado === 'pendiente').length

  return (
    <Pantalla onRefresh={onRefresh} refrescando={refrescando}>
      <Encabezado
        titulo="Mis pedidos asignados"
        subtitulo={
          pedidos.length === 0
            ? 'Cuando te asignen pedidos de trabajo aparecerán aquí.'
            : `${pendientes} pendiente(s) · ${enProceso} en proceso. Actualiza el estado a medida que avances.`
        }
      />

      {pedidos.length === 0 ? (
        <Card>
          <Vacio mensaje="No tienes pedidos asignados por ahora." icono="construct-outline" />
        </Card>
      ) : (
        pedidos.map((p) => (
          <Card key={p.id}>
            <View style={styles.cabecera}>
              <Text style={styles.nombre}>{p.pedido}</Text>
              <Badge texto={p.estado} />
            </View>
            {!!p.descripcion && <Text style={styles.descripcion}>{p.descripcion}</Text>}
            {p.valor !== null && p.valor !== undefined && (
              <Text style={styles.valor}>Valor: {formatearCLP(p.valor)}</Text>
            )}

            <View style={styles.acciones}>
              <View style={{ flex: 1 }}>
                <Selector
                  valor={p.estado}
                  opciones={OPCIONES_ESTADO}
                  onChange={(estado) => void handleCambiarEstado(p, estado)}
                  deshabilitado={actualizando === p.id}
                />
              </View>
              <Boton
                titulo="Fotos"
                icono="camera-outline"
                variante="secundario"
                onPress={() =>
                  router.push({
                    pathname: '/pedido/[id]',
                    params: { id: String(p.id), nombre: p.pedido, estado: p.estado },
                  })
                }
              />
            </View>
          </Card>
        ))
      )}
    </Pantalla>
  )
}

const styles = StyleSheet.create({
  cabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.s3,
    marginBottom: space.s2,
  },
  nombre: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, flex: 1 },
  descripcion: { fontSize: fontSize.sm, color: colors.text2, marginBottom: space.s1 },
  valor: { fontSize: fontSize.sm, color: colors.text3, marginBottom: space.s1 },
  acciones: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    marginTop: space.s3,
  },
})
