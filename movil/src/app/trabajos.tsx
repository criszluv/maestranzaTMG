// src/app/trabajos.tsx
// Trabajos realizados a clientes (RRHH/Admin): filtrar, crear y editar.
// Eliminar es solo admin (correcciones excepcionales; queda auditado).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native'
import { getClientesResumen, type ClienteResumen } from '../api/clientes'
import {
  actualizarTrabajo,
  crearTrabajo,
  eliminarTrabajo,
  getTrabajos,
  type EstadoTrabajo,
  type Trabajo,
} from '../api/trabajos'
import { useAuth } from '../auth/AuthContext'
import { Protegido } from '../auth/Protegido'
import { CampoFecha } from '../components/CampoFecha'
import { useConfirm } from '../components/Confirm'
import { useToast } from '../components/Toast'
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
} from '../components/ui'
import { formatearCLP, formatearFecha, hoyISO } from '../services/fechas'
import { colors, fontSize, radius, shadow, space } from '../theme/tokens'

const OPCIONES_ESTADO = [
  { valor: 'Pendiente' as EstadoTrabajo, etiqueta: 'Pendiente' },
  { valor: 'En proceso' as EstadoTrabajo, etiqueta: 'En proceso' },
  { valor: 'Finalizado' as EstadoTrabajo, etiqueta: 'Finalizado' },
]

const TODOS_CLIENTES = 0

interface FormTrabajo {
  cliente_id: number
  fecha: string
  estado: EstadoTrabajo
  valor: string
  detalle: string
}

function TrabajosContenido() {
  const { user } = useAuth()
  const notify = useToast()
  const confirm = useConfirm()

  const [trabajos, setTrabajos] = useState<Trabajo[]>([])
  const [clientes, setClientes] = useState<ClienteResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  // Filtros
  const [buscar, setBuscar] = useState('')
  const [clienteFiltro, setClienteFiltro] = useState<number>(TODOS_CLIENTES)

  const [editando, setEditando] = useState<Trabajo | 'nuevo' | null>(null)
  const [form, setForm] = useState<FormTrabajo>({
    cliente_id: 0,
    fecha: hoyISO(),
    estado: 'Pendiente',
    valor: '',
    detalle: '',
  })
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [dataTrabajos, dataClientes] = await Promise.all([
        getTrabajos({
          cliente_id: clienteFiltro || undefined,
        }),
        getClientesResumen().catch(() => [] as ClienteResumen[]),
      ])
      setTrabajos(dataTrabajos)
      setClientes(dataClientes)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudieron cargar los trabajos.', 'error')
    } finally {
      setCargando(false)
    }
  }, [clienteFiltro, notify])

  useEffect(() => {
    setCargando(true)
    void cargar()
  }, [cargar])

  const onRefresh = useCallback(async () => {
    setRefrescando(true)
    await cargar()
    setRefrescando(false)
  }, [cargar])

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    if (!q) return trabajos
    return trabajos.filter(
      (t) =>
        t.detalle.toLowerCase().includes(q) ||
        (t.cliente_nombre ?? '').toLowerCase().includes(q),
    )
  }, [trabajos, buscar])

  const opcionesClienteFiltro = useMemo(
    () => [
      { valor: TODOS_CLIENTES, etiqueta: 'Todos los clientes' },
      ...clientes.map((c) => ({ valor: c.id, etiqueta: c.nombre })),
    ],
    [clientes],
  )

  const opcionesClienteForm = useMemo(
    () => clientes.map((c) => ({ valor: c.id, etiqueta: c.nombre })),
    [clientes],
  )

  const abrirNuevo = () => {
    setForm({
      cliente_id: clientes[0]?.id ?? 0,
      fecha: hoyISO(),
      estado: 'Pendiente',
      valor: '',
      detalle: '',
    })
    setEditando('nuevo')
  }

  const abrirEdicion = (t: Trabajo) => {
    setForm({
      cliente_id: t.cliente_id,
      fecha: t.fecha,
      estado: (t.estado as EstadoTrabajo) || 'Pendiente',
      valor: t.valor !== null && t.valor !== undefined ? String(t.valor) : '',
      detalle: t.detalle,
    })
    setEditando(t)
  }

  const guardar = async () => {
    if (!form.cliente_id) {
      notify('Selecciona el cliente.', 'error')
      return
    }
    if (!form.fecha || !form.detalle.trim()) {
      notify('Fecha y detalle son obligatorios.', 'error')
      return
    }
    const valorNum = form.valor.trim() === '' ? null : Number(form.valor.replace(/\./g, ''))
    if (valorNum !== null && !Number.isFinite(valorNum)) {
      notify('El valor debe ser un número.', 'error')
      return
    }

    const payload = {
      cliente_id: form.cliente_id,
      fecha: form.fecha,
      estado: form.estado,
      valor: valorNum,
      detalle: form.detalle.trim(),
    }

    setGuardando(true)
    try {
      if (editando === 'nuevo') {
        await crearTrabajo(payload)
        notify('Trabajo registrado.', 'success')
      } else if (editando) {
        await actualizarTrabajo(editando.id, payload)
        notify('Trabajo actualizado.', 'success')
      }
      setEditando(null)
      await cargar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo guardar el trabajo.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const handleEliminar = async (t: Trabajo) => {
    const ok = await confirm({
      titulo: 'Eliminar trabajo',
      mensaje: 'Solo para correcciones excepcionales; la acción queda auditada.',
      textoConfirmar: 'Eliminar',
      peligro: true,
    })
    if (!ok) return
    try {
      await eliminarTrabajo(t.id)
      notify('Trabajo eliminado.', 'success')
      await cargar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo eliminar el trabajo.', 'error')
    }
  }

  if (cargando) return <Cargando />

  const totalValor = visibles.reduce((acc, t) => acc + (t.valor ?? 0), 0)

  return (
    <Pantalla onRefresh={onRefresh} refrescando={refrescando}>
      <Encabezado titulo="Trabajos" subtitulo="Trabajos realizados a clientes." />

      <View style={styles.pills}>
        <Pill etiqueta="En vista" valor={visibles.length} tono="azul" />
        <Pill etiqueta="Suma" valor={formatearCLP(totalValor)} tono="verde" />
      </View>

      <View style={styles.filaBusqueda}>
        <View style={{ flex: 1 }}>
          <Buscador valor={buscar} onChange={setBuscar} placeholder="Buscar en detalle…" />
        </View>
        <Boton titulo="Nuevo" icono="add" onPress={abrirNuevo} />
      </View>

      <Selector
        valor={clienteFiltro}
        opciones={opcionesClienteFiltro}
        onChange={setClienteFiltro}
      />

      {visibles.length === 0 ? (
        <Card>
          <Vacio mensaje="No hay trabajos que coincidan." icono="hammer-outline" />
        </Card>
      ) : (
        visibles.map((t) => (
          <Card key={t.id}>
            <View style={styles.cabecera}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cliente}>{t.cliente_nombre ?? `Cliente #${t.cliente_id}`}</Text>
                <Text style={styles.meta}>
                  {formatearFecha(t.fecha)}
                  {t.valor !== null && t.valor !== undefined ? ` · ${formatearCLP(t.valor)}` : ''}
                </Text>
              </View>
              <Badge texto={String(t.estado)} />
            </View>
            <Text style={styles.detalle}>{t.detalle}</Text>
            <View style={styles.acciones}>
              <Boton
                titulo="Editar"
                icono="create-outline"
                variante="secundario"
                compacto
                onPress={() => abrirEdicion(t)}
              />
              {user?.rol === 'admin' && (
                <Boton
                  titulo="Eliminar"
                  icono="trash-outline"
                  variante="fantasma"
                  compacto
                  onPress={() => void handleEliminar(t)}
                />
              )}
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
                {editando === 'nuevo' ? 'Nuevo trabajo' : 'Editar trabajo'}
              </Text>

              <Campo etiqueta="Cliente">
                <Selector
                  valor={form.cliente_id || null}
                  opciones={opcionesClienteForm}
                  onChange={(cliente_id) => setForm((f) => ({ ...f, cliente_id }))}
                  placeholder="Selecciona cliente…"
                />
              </Campo>

              <Campo etiqueta="Fecha">
                <CampoFecha
                  valor={form.fecha}
                  onChange={(fecha) => setForm((f) => ({ ...f, fecha }))}
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
                  placeholder="Ej: 450000"
                  keyboardType="numeric"
                />
              </Campo>

              <Campo etiqueta="Detalle">
                <Entrada
                  value={form.detalle}
                  onChangeText={(t) => setForm((f) => ({ ...f, detalle: t }))}
                  placeholder="Descripción del trabajo realizado…"
                  multiline
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

export default function TrabajosScreen() {
  return (
    <Protegido rolRequerido="rrhh">
      <TrabajosContenido />
    </Protegido>
  )
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  filaBusqueda: { flexDirection: 'row', gap: space.s2, alignItems: 'center' },
  cabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s3, marginBottom: space.s2 },
  cliente: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  meta: { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },
  detalle: { fontSize: fontSize.sm, color: colors.text2 },
  acciones: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.s2, marginTop: space.s3 },

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
  modalTitulo: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: space.s4 },
  modalAcciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.s3,
    marginTop: space.s2,
    marginBottom: space.s4,
  },
})
