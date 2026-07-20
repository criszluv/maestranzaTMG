// src/features/pedidos/GestionPedidosView.tsx
// Gestión de pedidos (RRHH/Admin): crear, editar, cambiar estado,
// asignar encargado, eliminar y revisar fotos de avance.

import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  actualizarPedido,
  crearPedido,
  eliminarPedido,
  getPedidos,
  type EstadoPedido,
  type Pedido,
} from '../../api/pedidos'
import { getUsuarios } from '../../api/usuarios'
import type { User } from '../../api/auth'
import { useConfirm } from '../../components/Confirm'
import { useToast } from '../../components/Toast'
import {
  Badge,
  Boton,
  Buscador,
  Campo,
  Card,
  Cargando,
  Encabezado,
  Entrada,
  Pantalla,
  Pill,
  Selector,
  Vacio,
} from '../../components/ui'
import { formatearCLP } from '../../services/fechas'
import { colors, fontSize, radius, shadow, space } from '../../theme/tokens'

const OPCIONES_ESTADO = [
  { valor: 'pendiente' as EstadoPedido, etiqueta: 'Pendiente' },
  { valor: 'en proceso' as EstadoPedido, etiqueta: 'En proceso' },
  { valor: 'terminado' as EstadoPedido, etiqueta: 'Terminado' },
]

const SIN_ENCARGADO = 0

interface FormPedido {
  pedido: string
  descripcion: string
  estado: EstadoPedido
  valor: string
  encargado_id: number
}

const FORM_VACIO: FormPedido = {
  pedido: '',
  descripcion: '',
  estado: 'pendiente',
  valor: '',
  encargado_id: SIN_ENCARGADO,
}

export function GestionPedidosView() {
  const notify = useToast()
  const confirm = useConfirm()

  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [usuarios, setUsuarios] = useState<User[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [buscar, setBuscar] = useState('')

  // Modal crear/editar
  const [editando, setEditando] = useState<Pedido | 'nuevo' | null>(null)
  const [form, setForm] = useState<FormPedido>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [dataPedidos, dataUsuarios] = await Promise.all([
        getPedidos(),
        getUsuarios(true).catch(() => [] as User[]),
      ])
      setPedidos(dataPedidos)
      setUsuarios(dataUsuarios)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudieron cargar los pedidos.', 'error')
    } finally {
      setCargando(false)
    }
  }, [notify])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const onRefresh = useCallback(async () => {
    setRefrescando(true)
    await cargar()
    setRefrescando(false)
  }, [cargar])

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    if (!q) return pedidos
    return pedidos.filter(
      (p) =>
        p.pedido.toLowerCase().includes(q) ||
        (p.descripcion ?? '').toLowerCase().includes(q) ||
        (p.encargado_nombre ?? '').toLowerCase().includes(q),
    )
  }, [pedidos, buscar])

  const opcionesEncargado = useMemo(
    () => [
      { valor: SIN_ENCARGADO, etiqueta: 'Sin encargado' },
      ...usuarios.map((u) => ({ valor: u.id, etiqueta: u.nombre })),
    ],
    [usuarios],
  )

  const abrirNuevo = () => {
    setForm(FORM_VACIO)
    setEditando('nuevo')
  }

  const abrirEdicion = (p: Pedido) => {
    setForm({
      pedido: p.pedido,
      descripcion: p.descripcion ?? '',
      estado: p.estado,
      valor: p.valor !== null && p.valor !== undefined ? String(p.valor) : '',
      encargado_id: p.encargado_id ?? SIN_ENCARGADO,
    })
    setEditando(p)
  }

  const guardar = async () => {
    if (!form.pedido.trim()) {
      notify('El nombre del pedido es obligatorio.', 'error')
      return
    }
    const valorNum = form.valor.trim() === '' ? null : Number(form.valor.replace(/\./g, ''))
    if (valorNum !== null && !Number.isFinite(valorNum)) {
      notify('El valor debe ser un número.', 'error')
      return
    }

    const payload = {
      pedido: form.pedido.trim(),
      descripcion: form.descripcion.trim() || null,
      estado: form.estado,
      valor: valorNum,
      encargado_id: form.encargado_id === SIN_ENCARGADO ? null : form.encargado_id,
    }

    setGuardando(true)
    try {
      if (editando === 'nuevo') {
        await crearPedido(payload)
        notify('Pedido creado.', 'success')
      } else if (editando) {
        await actualizarPedido(editando.id, payload)
        notify('Pedido actualizado.', 'success')
      }
      setEditando(null)
      await cargar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo guardar el pedido.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const handleEliminar = async (p: Pedido) => {
    const ok = await confirm({
      titulo: 'Eliminar pedido',
      mensaje: `¿Eliminar "${p.pedido}"? Esta acción queda registrada en auditoría.`,
      textoConfirmar: 'Eliminar',
      peligro: true,
    })
    if (!ok) return
    try {
      await eliminarPedido(p.id)
      notify('Pedido eliminado.', 'success')
      await cargar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo eliminar el pedido.', 'error')
    }
  }

  if (cargando) return <Cargando />

  const pendientes = pedidos.filter((p) => p.estado === 'pendiente').length
  const enProceso = pedidos.filter((p) => p.estado === 'en proceso').length
  const terminados = pedidos.filter((p) => p.estado === 'terminado').length

  return (
    <Pantalla onRefresh={onRefresh} refrescando={refrescando}>
      <Encabezado
        titulo="Pedidos de trabajo"
        subtitulo="Órdenes del taller: estado, encargado y fotos de avance."
      />

      <View style={styles.pills}>
        <Pill etiqueta="Pendientes" valor={pendientes} tono="ambar" />
        <Pill etiqueta="En proceso" valor={enProceso} tono="azul" />
        <Pill etiqueta="Terminados" valor={terminados} tono="verde" />
      </View>

      <View style={styles.filaBusqueda}>
        <View style={{ flex: 1 }}>
          <Buscador valor={buscar} onChange={setBuscar} placeholder="Buscar pedido…" />
        </View>
        <Boton titulo="Nuevo" icono="add" onPress={abrirNuevo} />
      </View>

      {visibles.length === 0 ? (
        <Card>
          <Vacio mensaje="No hay pedidos que coincidan." icono="construct-outline" />
        </Card>
      ) : (
        visibles.map((p) => (
          <Card key={p.id}>
            <View style={styles.cabecera}>
              <Text style={styles.nombre}>{p.pedido}</Text>
              <Badge texto={p.estado} />
            </View>
            {!!p.descripcion && <Text style={styles.descripcion}>{p.descripcion}</Text>}
            <Text style={styles.meta}>
              Encargado: {p.encargado_nombre ?? 'Sin asignar'}
              {p.valor !== null && p.valor !== undefined
                ? ` · ${formatearCLP(p.valor)}`
                : ''}
            </Text>

            <View style={styles.acciones}>
              <Boton
                titulo="Fotos"
                icono="images-outline"
                variante="secundario"
                compacto
                onPress={() =>
                  router.push({
                    pathname: '/pedido/[id]',
                    params: { id: String(p.id), nombre: p.pedido, estado: p.estado },
                  })
                }
              />
              <Boton
                titulo="Editar"
                icono="create-outline"
                variante="secundario"
                compacto
                onPress={() => abrirEdicion(p)}
              />
              <Boton
                titulo="Eliminar"
                icono="trash-outline"
                variante="fantasma"
                compacto
                onPress={() => void handleEliminar(p)}
              />
            </View>
          </Card>
        ))
      )}

      {/* Modal crear / editar */}
      <Modal
        visible={editando !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditando(null)}
      >
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitulo}>
                {editando === 'nuevo' ? 'Nuevo pedido' : 'Editar pedido'}
              </Text>

              <Campo etiqueta="Nombre del pedido">
                <Entrada
                  value={form.pedido}
                  onChangeText={(t) => setForm((f) => ({ ...f, pedido: t }))}
                  placeholder="Ej: Rectificado eje bomba"
                />
              </Campo>

              <Campo etiqueta="Descripción">
                <Entrada
                  value={form.descripcion}
                  onChangeText={(t) => setForm((f) => ({ ...f, descripcion: t }))}
                  placeholder="Detalle del trabajo…"
                  multiline
                />
              </Campo>

              <Campo etiqueta="Estado">
                <Selector
                  valor={form.estado}
                  opciones={OPCIONES_ESTADO}
                  onChange={(estado) => setForm((f) => ({ ...f, estado }))}
                />
              </Campo>

              <Campo etiqueta="Valor (CLP, opcional)">
                <Entrada
                  value={form.valor}
                  onChangeText={(t) => setForm((f) => ({ ...f, valor: t }))}
                  placeholder="Ej: 250000"
                  keyboardType="numeric"
                />
              </Campo>

              <Campo etiqueta="Encargado">
                <Selector
                  valor={form.encargado_id}
                  opciones={opcionesEncargado}
                  onChange={(encargado_id) => setForm((f) => ({ ...f, encargado_id }))}
                />
              </Campo>

              <View style={styles.modalAcciones}>
                <Boton
                  titulo="Cancelar"
                  variante="secundario"
                  onPress={() => setEditando(null)}
                  deshabilitado={guardando}
                />
                <Boton titulo="Guardar" onPress={guardar} cargando={guardando} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Pantalla>
  )
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  filaBusqueda: { flexDirection: 'row', gap: space.s2, alignItems: 'center' },
  cabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.s3,
    marginBottom: space.s2,
  },
  nombre: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, flex: 1 },
  descripcion: { fontSize: fontSize.sm, color: colors.text2, marginBottom: space.s1 },
  meta: { fontSize: fontSize.sm, color: colors.text3 },
  acciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.s2,
    marginTop: space.s3,
    flexWrap: 'wrap',
  },

  modalFondo: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCaja: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.s5,
    maxHeight: '88%',
    ...shadow.md,
  },
  modalTitulo: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: space.s4,
  },
  modalAcciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.s3,
    marginTop: space.s2,
    marginBottom: space.s4,
  },
})
