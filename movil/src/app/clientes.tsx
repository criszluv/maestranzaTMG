// src/app/clientes.tsx
// Cartera de clientes (RRHH/Admin): buscar, crear, editar, habilitar y
// deshabilitar. Cada cliente puede tener varios contactos y varias
// entidades de facturación (RUT validado con módulo 11 en el cliente;
// el backend re-valida y normaliza).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  actualizarCliente,
  crearCliente,
  deshabilitarCliente,
  habilitarCliente,
  getClientes,
  type Cliente,
  type ContactoCliente,
  type EntidadCliente,
} from '../api/clientes'
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
import { formatearFecha } from '../services/fechas'
import { normalizarRut } from '../services/rut'
import { colors, fontSize, radius, shadow, space } from '../theme/tokens'

type FiltroEstado = '' | 'habilitado' | 'deshabilitado'

const FILTROS_ESTADO = [
  { valor: '' as FiltroEstado, etiqueta: 'Todos' },
  { valor: 'habilitado' as FiltroEstado, etiqueta: 'Habilitados' },
  { valor: 'deshabilitado' as FiltroEstado, etiqueta: 'Deshabilitados' },
]

interface FormCliente {
  nombre: string
  email: string
  fecha_ingreso: string
  contactos: ContactoCliente[]
  entidades: EntidadCliente[]
}

const FORM_VACIO: FormCliente = {
  nombre: '',
  email: '',
  fecha_ingreso: '',
  contactos: [],
  entidades: [],
}

function ClientesContenido() {
  const notify = useToast()
  const confirm = useConfirm()

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('habilitado')
  const [expandido, setExpandido] = useState<number | null>(null)

  const [editando, setEditando] = useState<Cliente | 'nuevo' | null>(null)
  const [form, setForm] = useState<FormCliente>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const data = await getClientes(undefined, filtroEstado || undefined)
      setClientes(data)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudieron cargar los clientes.', 'error')
    } finally {
      setCargando(false)
    }
  }, [filtroEstado, notify])

  useEffect(() => {
    setCargando(true)
    void cargar()
  }, [cargar])

  const onRefresh = useCallback(async () => {
    setRefrescando(true)
    await cargar()
    setRefrescando(false)
  }, [cargar])

  // Búsqueda local sobre lo ya cargado (rápida en móvil).
  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        c.entidades.some((e) => e.rut.toLowerCase().includes(q)) ||
        c.contactos.some((ct) => (ct.nombre ?? '').toLowerCase().includes(q)),
    )
  }, [clientes, buscar])

  const abrirNuevo = () => {
    setForm(FORM_VACIO)
    setEditando('nuevo')
  }

  const abrirEdicion = (c: Cliente) => {
    setForm({
      nombre: c.nombre,
      email: c.email ?? '',
      fecha_ingreso: c.fecha_ingreso ?? '',
      contactos: c.contactos.map((ct) => ({ ...ct })),
      entidades: c.entidades.map((e) => ({ ...e })),
    })
    setEditando(c)
  }

  const guardar = async () => {
    if (!form.nombre.trim()) {
      notify('El nombre del cliente es obligatorio.', 'error')
      return
    }
    // Validación de RUT en el cliente (el backend igual re-valida).
    const entidades: EntidadCliente[] = []
    for (const e of form.entidades) {
      const rut = e.rut.trim()
      if (!rut) continue
      try {
        entidades.push({ ...e, rut: normalizarRut(rut) })
      } catch (err) {
        notify(err instanceof Error ? err.message : 'RUT inválido.', 'error')
        return
      }
    }
    const contactos = form.contactos.filter(
      (ct) => (ct.nombre ?? '').trim() || (ct.telefono ?? '').trim(),
    )

    const payload = {
      nombre: form.nombre.trim(),
      email: form.email.trim() || null,
      fecha_ingreso: form.fecha_ingreso || null,
      contactos,
      entidades,
    }

    setGuardando(true)
    try {
      if (editando === 'nuevo') {
        await crearCliente(payload)
        notify('Cliente creado.', 'success')
      } else if (editando) {
        await actualizarCliente(editando.id, payload)
        notify('Cliente actualizado.', 'success')
      }
      setEditando(null)
      await cargar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo guardar el cliente.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const alternarEstado = async (c: Cliente) => {
    const deshabilitar = c.estado === 'habilitado'
    const ok = await confirm({
      titulo: deshabilitar ? 'Deshabilitar cliente' : 'Habilitar cliente',
      mensaje: deshabilitar
        ? `"${c.nombre}" dejará de aparecer en los listados operativos.`
        : `"${c.nombre}" volverá a estar disponible.`,
      textoConfirmar: deshabilitar ? 'Deshabilitar' : 'Habilitar',
      peligro: deshabilitar,
    })
    if (!ok) return
    try {
      if (deshabilitar) await deshabilitarCliente(c.id)
      else await habilitarCliente(c.id)
      notify('Estado actualizado.', 'success')
      await cargar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo cambiar el estado.', 'error')
    }
  }

  if (cargando) return <Cargando />

  return (
    <Pantalla onRefresh={onRefresh} refrescando={refrescando}>
      <Encabezado titulo="Clientes" subtitulo="Cartera de la maestranza." />

      <View style={styles.pills}>
        <Pill etiqueta="En vista" valor={visibles.length} tono="azul" />
      </View>

      <View style={styles.filaBusqueda}>
        <View style={{ flex: 1 }}>
          <Buscador valor={buscar} onChange={setBuscar} placeholder="Nombre, RUT o contacto…" />
        </View>
        <Boton titulo="Nuevo" icono="add" onPress={abrirNuevo} />
      </View>

      <Selector valor={filtroEstado} opciones={FILTROS_ESTADO} onChange={setFiltroEstado} />

      {visibles.length === 0 ? (
        <Card>
          <Vacio mensaje="No hay clientes que coincidan." icono="business-outline" />
        </Card>
      ) : (
        visibles.map((c) => {
          const abierto = expandido === c.id
          return (
            <Card key={c.id}>
              <Pressable
                onPress={() => setExpandido(abierto ? null : c.id)}
                style={styles.cabecera}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.nombre}>{c.nombre}</Text>
                  <Text style={styles.meta}>
                    {c.email || 'Sin correo'}
                    {c.fecha_ingreso ? ` · Ingreso ${formatearFecha(c.fecha_ingreso)}` : ''}
                  </Text>
                </View>
                <Badge texto={c.estado} />
                <Ionicons
                  name={abierto ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.text3}
                />
              </Pressable>

              {abierto && (
                <View style={styles.detalle}>
                  {c.entidades.length > 0 && (
                    <View style={styles.bloque}>
                      <Text style={styles.bloqueTitulo}>Entidades de facturación</Text>
                      {c.entidades.map((e, i) => (
                        <Text key={e.id ?? i} style={styles.bloqueLinea}>
                          {e.rut}
                          {e.nombre ? ` — ${e.nombre}` : ''}
                        </Text>
                      ))}
                    </View>
                  )}
                  {c.contactos.length > 0 && (
                    <View style={styles.bloque}>
                      <Text style={styles.bloqueTitulo}>Contactos</Text>
                      {c.contactos.map((ct, i) => (
                        <Text key={ct.id ?? i} style={styles.bloqueLinea}>
                          {ct.nombre || '—'}
                          {ct.telefono ? ` · ${ct.telefono}` : ''}
                          {ct.nota ? ` (${ct.nota})` : ''}
                        </Text>
                      ))}
                    </View>
                  )}
                  <View style={styles.acciones}>
                    <Boton
                      titulo="Editar"
                      icono="create-outline"
                      variante="secundario"
                      compacto
                      onPress={() => abrirEdicion(c)}
                    />
                    <Boton
                      titulo={c.estado === 'habilitado' ? 'Deshabilitar' : 'Habilitar'}
                      icono={c.estado === 'habilitado' ? 'ban-outline' : 'checkmark-circle-outline'}
                      variante={c.estado === 'habilitado' ? 'fantasma' : 'secundario'}
                      compacto
                      onPress={() => void alternarEstado(c)}
                    />
                  </View>
                </View>
              )}
            </Card>
          )
        })
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
                {editando === 'nuevo' ? 'Nuevo cliente' : 'Editar cliente'}
              </Text>

              <Campo etiqueta="Nombre">
                <Entrada
                  value={form.nombre}
                  onChangeText={(t) => setForm((f) => ({ ...f, nombre: t }))}
                  placeholder="Razón social o nombre"
                />
              </Campo>

              <Campo etiqueta="Correo (opcional)">
                <Entrada
                  value={form.email}
                  onChangeText={(t) => setForm((f) => ({ ...f, email: t }))}
                  placeholder="contacto@cliente.cl"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </Campo>

              <Campo etiqueta="Fecha de ingreso (opcional)">
                <CampoFecha
                  valor={form.fecha_ingreso}
                  onChange={(fecha_ingreso) => setForm((f) => ({ ...f, fecha_ingreso }))}
                  limpiable
                />
              </Campo>

              {/* Entidades (RUT) */}
              <View style={styles.subseccion}>
                <View style={styles.subseccionCabecera}>
                  <Text style={styles.subseccionTitulo}>Entidades de facturación</Text>
                  <Boton
                    titulo="Añadir"
                    icono="add"
                    variante="fantasma"
                    compacto
                    onPress={() =>
                      setForm((f) => ({ ...f, entidades: [...f.entidades, { rut: '', nombre: '' }] }))
                    }
                  />
                </View>
                {form.entidades.map((e, i) => (
                  <View key={i} style={styles.filaDinamica}>
                    <Entrada
                      value={e.rut}
                      onChangeText={(t) =>
                        setForm((f) => {
                          const entidades = [...f.entidades]
                          entidades[i] = { ...entidades[i], rut: t }
                          return { ...f, entidades }
                        })
                      }
                      placeholder="12.345.678-9"
                      autoCapitalize="none"
                      style={{ flex: 1 }}
                    />
                    <Entrada
                      value={e.nombre ?? ''}
                      onChangeText={(t) =>
                        setForm((f) => {
                          const entidades = [...f.entidades]
                          entidades[i] = { ...entidades[i], nombre: t }
                          return { ...f, entidades }
                        })
                      }
                      placeholder="Nombre (opcional)"
                      style={{ flex: 1 }}
                    />
                    <Pressable
                      onPress={() =>
                        setForm((f) => ({
                          ...f,
                          entidades: f.entidades.filter((_, j) => j !== i),
                        }))
                      }
                      hitSlop={8}
                      style={styles.quitar}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                ))}
              </View>

              {/* Contactos */}
              <View style={styles.subseccion}>
                <View style={styles.subseccionCabecera}>
                  <Text style={styles.subseccionTitulo}>Contactos</Text>
                  <Boton
                    titulo="Añadir"
                    icono="add"
                    variante="fantasma"
                    compacto
                    onPress={() =>
                      setForm((f) => ({
                        ...f,
                        contactos: [...f.contactos, { nombre: '', telefono: '', nota: '' }],
                      }))
                    }
                  />
                </View>
                {form.contactos.map((ct, i) => (
                  <View key={i} style={styles.filaDinamica}>
                    <Entrada
                      value={ct.nombre ?? ''}
                      onChangeText={(t) =>
                        setForm((f) => {
                          const contactos = [...f.contactos]
                          contactos[i] = { ...contactos[i], nombre: t }
                          return { ...f, contactos }
                        })
                      }
                      placeholder="Nombre"
                      style={{ flex: 1 }}
                    />
                    <Entrada
                      value={ct.telefono ?? ''}
                      onChangeText={(t) =>
                        setForm((f) => {
                          const contactos = [...f.contactos]
                          contactos[i] = { ...contactos[i], telefono: t }
                          return { ...f, contactos }
                        })
                      }
                      placeholder="Teléfono"
                      keyboardType="phone-pad"
                      style={{ flex: 1 }}
                    />
                    <Pressable
                      onPress={() =>
                        setForm((f) => ({
                          ...f,
                          contactos: f.contactos.filter((_, j) => j !== i),
                        }))
                      }
                      hitSlop={8}
                      style={styles.quitar}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                ))}
              </View>

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

export default function ClientesScreen() {
  return (
    <Protegido rolRequerido="rrhh">
      <ClientesContenido />
    </Protegido>
  )
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  filaBusqueda: { flexDirection: 'row', gap: space.s2, alignItems: 'center' },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  nombre: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  meta: { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },
  detalle: {
    marginTop: space.s3,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.s3,
    gap: space.s3,
  },
  bloque: { gap: 2 },
  bloqueTitulo: { fontSize: fontSize.xs, fontWeight: '700', color: colors.text3 },
  bloqueLinea: { fontSize: fontSize.sm, color: colors.text2 },
  acciones: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.s2, flexWrap: 'wrap' },

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
    maxHeight: '90%',
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
  subseccion: { marginBottom: space.s4, gap: space.s2 },
  subseccionCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subseccionTitulo: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text2 },
  filaDinamica: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  quitar: { padding: space.s2 },
})
