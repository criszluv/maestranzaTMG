// src/features/pedidos/GestionPedidosView.tsx
// Gestión de pedidos (RRHH/Admin): crear, editar, cambiar estado, asignar
// encargado y CLIENTE, eliminar y revisar fotos de avance.
//
// Ciclo completo de la orden de trabajo:
//   1. Aquí se crea el pedido con su cliente (de la cartera o uno nuevo) y
//      su encargado (empleado).
//   2. El encargado avanza el estado hasta "terminado" desde su vista.
//   3. Aquí mismo RRHH lo CIERRA eligiendo destino:
//        Pagado    -> pasa a Trabajos realizados
//        Pendiente -> pasa a Pagos pendientes (factura por cobrar)

import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  actualizarPedido,
  cerrarPedido,
  crearPedido,
  eliminarPedido,
  getPedidos,
  type EstadoPedido,
  type Pedido,
  type TipoCierre,
} from '../../api/pedidos'
import { crearCliente, getClientesResumen, type ClienteResumen } from '../../api/clientes'
import { getUsuarios } from '../../api/usuarios'
import type { User } from '../../api/auth'
import { CampoFecha } from '../../components/CampoFecha'
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
import { formatearCLP, hoyISO } from '../../services/fechas'
import { colors, fontSize, radius, shadow, space } from '../../theme/tokens'

const OPCIONES_ESTADO = [
  { valor: 'pendiente' as EstadoPedido, etiqueta: 'Pendiente' },
  { valor: 'en proceso' as EstadoPedido, etiqueta: 'En proceso' },
  { valor: 'terminado' as EstadoPedido, etiqueta: 'Terminado' },
]

const SIN_ENCARGADO = 0
const SIN_CLIENTE = 0

/** El cliente del pedido se elige de la cartera o se crea en el momento. */
type ModoCliente = 'registrado' | 'nuevo'

interface FormPedido {
  pedido: string
  descripcion: string
  estado: EstadoPedido
  valor: string
  encargado_id: number
  // Cliente
  modoCliente: ModoCliente
  cliente_id: number
  // …o los datos del cliente nuevo (espejo de la tabla clientes)
  cliNombre: string
  cliEmail: string
  cliRut: string
  cliContacto: string
  cliTelefono: string
  cliIngreso: string
}

const FORM_VACIO: FormPedido = {
  pedido: '',
  descripcion: '',
  estado: 'pendiente',
  valor: '',
  encargado_id: SIN_ENCARGADO,
  modoCliente: 'registrado',
  cliente_id: SIN_CLIENTE,
  cliNombre: '',
  cliEmail: '',
  cliRut: '',
  cliContacto: '',
  cliTelefono: '',
  cliIngreso: '',
}

interface FormCierre {
  tipo: TipoCierre
  valor: string
  fecha: string
  numero: string
  nota: string
  detalle: string
}

export function GestionPedidosView() {
  const notify = useToast()
  const confirm = useConfirm()

  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [usuarios, setUsuarios] = useState<User[]>([])
  const [clientes, setClientes] = useState<ClienteResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [buscar, setBuscar] = useState('')

  // Modal crear/editar
  const [editando, setEditando] = useState<Pedido | 'nuevo' | null>(null)
  const [form, setForm] = useState<FormPedido>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  // Modal de cierre comercial
  const [cerrando, setCerrando] = useState<Pedido | null>(null)
  const [formCierre, setFormCierre] = useState<FormCierre | null>(null)
  const [cerrandoEnCurso, setCerrandoEnCurso] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [dataPedidos, dataUsuarios, dataClientes] = await Promise.all([
        getPedidos(),
        getUsuarios(true).catch(() => [] as User[]),
        getClientesResumen().catch(() => [] as ClienteResumen[]),
      ])
      setPedidos(dataPedidos)
      setUsuarios(dataUsuarios)
      setClientes(dataClientes)
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
        (p.encargado_nombre ?? '').toLowerCase().includes(q) ||
        (p.cliente_nombre ?? '').toLowerCase().includes(q),
    )
  }, [pedidos, buscar])

  const opcionesEncargado = useMemo(
    () => [
      { valor: SIN_ENCARGADO, etiqueta: 'Sin encargado' },
      ...usuarios.map((u) => ({ valor: u.id, etiqueta: u.nombre })),
    ],
    [usuarios],
  )

  // El cliente del pedido en edición puede estar deshabilitado (fuera del
  // resumen): lo añadimos para no perderlo al guardar.
  const opcionesCliente = useMemo(() => {
    const lista = [
      { valor: SIN_CLIENTE, etiqueta: 'Sin cliente (asignar después)' },
      ...clientes.map((c) => ({ valor: c.id, etiqueta: c.nombre })),
    ]
    const actual = form.cliente_id
    if (actual !== SIN_CLIENTE && !lista.some((o) => o.valor === actual)) {
      const nombre =
        (editando !== 'nuevo' && editando?.cliente_nombre) || `Cliente #${actual}`
      lista.splice(1, 0, { valor: actual, etiqueta: `${nombre} (deshabilitado)` })
    }
    return lista
  }, [clientes, form.cliente_id, editando])

  // Un pedido ya derivado a trabajos/facturas queda congelado: el backend
  // rechaza cambios de estado y de cliente (409), así que aquí se bloquean.
  const edicionCongelada =
    editando !== null && editando !== 'nuevo' && editando.cerrado_en != null

  const abrirNuevo = () => {
    setForm(FORM_VACIO)
    setEditando('nuevo')
  }

  const abrirEdicion = (p: Pedido) => {
    setForm({
      ...FORM_VACIO,
      pedido: p.pedido,
      descripcion: p.descripcion ?? '',
      estado: p.estado,
      valor: p.valor !== null && p.valor !== undefined ? String(p.valor) : '',
      encargado_id: p.encargado_id ?? SIN_ENCARGADO,
      cliente_id: p.cliente_id ?? SIN_CLIENTE,
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
    if (form.modoCliente === 'nuevo' && !form.cliNombre.trim()) {
      notify('Escribe el nombre del cliente nuevo.', 'error')
      return
    }

    setGuardando(true)
    try {
      // 1. Cliente: el elegido de la cartera, o uno nuevo creado ahora. Si
      //    la creación falla (RUT inválido, nombre repetido…), abortamos
      //    antes de tocar el pedido.
      let clienteId: number | null =
        form.cliente_id === SIN_CLIENTE ? null : form.cliente_id

      if (form.modoCliente === 'nuevo' && !edicionCongelada) {
        const creado = await crearCliente({
          nombre: form.cliNombre.trim(),
          email: form.cliEmail.trim() || null,
          fecha_ingreso: form.cliIngreso || null,
          contactos:
            form.cliContacto.trim() || form.cliTelefono.trim()
              ? [{
                  nombre: form.cliContacto.trim() || null,
                  telefono: form.cliTelefono.trim() || null,
                }]
              : [],
          entidades: form.cliRut.trim() ? [{ rut: form.cliRut.trim() }] : [],
        })
        clienteId = creado.id
        setClientes((prev) =>
          [...prev, { id: creado.id, nombre: creado.nombre, estado: creado.estado }]
            .sort((a, b) => a.nombre.localeCompare(b.nombre)),
        )
        notify(`Cliente "${creado.nombre}" creado.`, 'success')
      }

      // 2. Pedido. En uno ya cerrado no se reenvían estado ni cliente.
      const base = {
        pedido: form.pedido.trim(),
        descripcion: form.descripcion.trim() || null,
        valor: valorNum,
        encargado_id: form.encargado_id === SIN_ENCARGADO ? null : form.encargado_id,
      }
      const payload = edicionCongelada
        ? base
        : { ...base, estado: form.estado, cliente_id: clienteId }

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

  // --------- CIERRE COMERCIAL ---------

  const abrirCierre = (p: Pedido) => {
    if (!p.cliente_id) {
      notify(
        'Este pedido no tiene cliente asignado. Edítalo y asígnale uno antes de cerrarlo.',
        'error',
      )
      return
    }
    setCerrando(p)
    setFormCierre({
      tipo: 'pagado',
      valor: p.valor !== null && p.valor !== undefined ? String(p.valor) : '',
      fecha: hoyISO(),
      numero: '',
      nota: '',
      detalle: '',
    })
  }

  const confirmarCierre = async () => {
    if (!cerrando || !formCierre) return
    const valorNum =
      formCierre.valor.trim() === '' ? null : Number(formCierre.valor.replace(/\./g, ''))
    if (valorNum !== null && !Number.isFinite(valorNum)) {
      notify('El monto debe ser un número.', 'error')
      return
    }

    setCerrandoEnCurso(true)
    try {
      await cerrarPedido(cerrando.id, {
        tipo: formCierre.tipo,
        valor: valorNum,
        fecha: formCierre.fecha || null,
        numero:
          formCierre.tipo === 'pendiente' && formCierre.numero.trim()
            ? Number(formCierre.numero)
            : null,
        nota: formCierre.tipo === 'pendiente' ? formCierre.nota.trim() || null : null,
        detalle: formCierre.detalle.trim() || null,
      })
      notify(
        formCierre.tipo === 'pagado'
          ? 'Pedido cerrado: quedó en Trabajos realizados.'
          : 'Pedido cerrado: quedó en Pagos pendientes.',
        'success',
      )
      setCerrando(null)
      setFormCierre(null)
      await cargar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo cerrar el pedido.', 'error')
    } finally {
      setCerrandoEnCurso(false)
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
  const porCerrar = pedidos.filter(
    (p) => p.estado === 'terminado' && !p.cerrado_en,
  ).length

  return (
    <Pantalla onRefresh={onRefresh} refrescando={refrescando}>
      <Encabezado
        titulo="Pedidos de trabajo"
        subtitulo="Órdenes del taller: cliente, encargado, fotos y cierre del cobro."
      />

      <View style={styles.pills}>
        <Pill etiqueta="Pendientes" valor={pendientes} tono="ambar" />
        <Pill etiqueta="En proceso" valor={enProceso} tono="azul" />
        <Pill etiqueta="Terminados" valor={terminados} tono="verde" />
        {porCerrar > 0 && <Pill etiqueta="Por cerrar" valor={porCerrar} tono="rojo" />}
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
              <View style={{ alignItems: 'flex-end', gap: space.s1 }}>
                <Badge texto={p.estado} />
                {!!p.cerrado_en && (
                  <Badge
                    texto={p.cierre_tipo === 'pagado' ? 'pagado' : 'por cobrar'}
                    tono={p.cierre_tipo === 'pagado' ? 'verde' : 'ambar'}
                  />
                )}
              </View>
            </View>
            {!!p.descripcion && <Text style={styles.descripcion}>{p.descripcion}</Text>}
            <Text style={styles.meta}>
              Cliente: {p.cliente_nombre ?? 'Sin asignar'}
            </Text>
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
              {p.estado === 'terminado' && !p.cerrado_en && (
                <Boton
                  titulo="Cerrar"
                  icono="cash-outline"
                  compacto
                  onPress={() => abrirCierre(p)}
                />
              )}
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

              {/* ---------- CLIENTE ---------- */}
              {edicionCongelada ? (
                <Campo etiqueta="Cliente">
                  {/* edicionCongelada garantiza que `editando` es un Pedido. */}
                  <Text style={styles.ayuda}>
                    {editando.cliente_nombre ?? '—'} · no se puede cambiar porque el
                    pedido ya fue cerrado.
                  </Text>
                </Campo>
              ) : (
                <>
                  <View style={styles.segmentos}>
                    {(['registrado', 'nuevo'] as ModoCliente[]).map((m) => (
                      <Pressable
                        key={m}
                        onPress={() => setForm((f) => ({ ...f, modoCliente: m }))}
                        style={[
                          styles.segmento,
                          form.modoCliente === m && styles.segmentoActivo,
                        ]}
                      >
                        <Text
                          style={[
                            styles.segmentoTexto,
                            form.modoCliente === m && styles.segmentoTextoActivo,
                          ]}
                        >
                          {m === 'registrado' ? 'Cliente registrado' : 'Cliente nuevo'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {form.modoCliente === 'registrado' ? (
                    <Campo etiqueta="Cliente">
                      <Selector
                        valor={form.cliente_id}
                        opciones={opcionesCliente}
                        onChange={(cliente_id) => setForm((f) => ({ ...f, cliente_id }))}
                      />
                    </Campo>
                  ) : (
                    <>
                      <Campo etiqueta="Nombre / razón social">
                        <Entrada
                          value={form.cliNombre}
                          onChangeText={(t) => setForm((f) => ({ ...f, cliNombre: t }))}
                          placeholder="Ej: AGRICOLA LOS ROBLES LTDA"
                        />
                      </Campo>
                      <Campo etiqueta="RUT (opcional)">
                        <Entrada
                          value={form.cliRut}
                          onChangeText={(t) => setForm((f) => ({ ...f, cliRut: t }))}
                          placeholder="12.345.678-9"
                          autoCapitalize="none"
                        />
                      </Campo>
                      <Campo etiqueta="Correo (opcional)">
                        <Entrada
                          value={form.cliEmail}
                          onChangeText={(t) => setForm((f) => ({ ...f, cliEmail: t }))}
                          placeholder="contacto@cliente.cl"
                          autoCapitalize="none"
                          keyboardType="email-address"
                        />
                      </Campo>
                      <View style={styles.filaDoble}>
                        <View style={{ flex: 1 }}>
                          <Campo etiqueta="Contacto (opcional)">
                            <Entrada
                              value={form.cliContacto}
                              onChangeText={(t) => setForm((f) => ({ ...f, cliContacto: t }))}
                              placeholder="Nombre"
                            />
                          </Campo>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Campo etiqueta="Teléfono (opcional)">
                            <Entrada
                              value={form.cliTelefono}
                              onChangeText={(t) => setForm((f) => ({ ...f, cliTelefono: t }))}
                              placeholder="+56 9 1234 5678"
                              keyboardType="phone-pad"
                            />
                          </Campo>
                        </View>
                      </View>
                      <Campo etiqueta="Fecha de ingreso (opcional)">
                        <CampoFecha
                          valor={form.cliIngreso}
                          onChange={(cliIngreso) => setForm((f) => ({ ...f, cliIngreso }))}
                          limpiable
                        />
                      </Campo>
                    </>
                  )}
                </>
              )}

              <Campo etiqueta="Estado">
                {edicionCongelada ? (
                  <Text style={styles.ayuda}>
                    {form.estado} · el pedido ya fue cerrado.
                  </Text>
                ) : (
                  <Selector
                    valor={form.estado}
                    opciones={OPCIONES_ESTADO}
                    onChange={(estado) => setForm((f) => ({ ...f, estado }))}
                  />
                )}
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

      {/* ---------- MODAL DE CIERRE COMERCIAL ---------- */}
      <Modal
        visible={cerrando !== null && formCierre !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setCerrando(null)
          setFormCierre(null)
        }}
      >
        {!!cerrando && !!formCierre && (
          <View style={styles.modalFondo}>
            <View style={styles.modalCaja}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitulo}>Cerrar: {cerrando.pedido}</Text>
                <Text style={styles.ayuda}>
                  Cliente: {cerrando.cliente_nombre}. Elige qué pasa con el cobro de
                  este trabajo terminado.
                </Text>

                <View style={{ gap: space.s2, marginTop: space.s3, marginBottom: space.s4 }}>
                  <Pressable
                    onPress={() => setFormCierre({ ...formCierre, tipo: 'pagado' })}
                    style={[
                      styles.opcionCierre,
                      formCierre.tipo === 'pagado' && {
                        borderColor: colors.success,
                        backgroundColor: colors.successSoft,
                      },
                    ]}
                  >
                    <Text style={styles.opcionTitulo}>Pagado</Text>
                    <Text style={styles.opcionDetalle}>
                      El cliente ya pagó. Se registra en Trabajos realizados.
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setFormCierre({ ...formCierre, tipo: 'pendiente' })}
                    style={[
                      styles.opcionCierre,
                      formCierre.tipo === 'pendiente' && {
                        borderColor: colors.warning,
                        backgroundColor: colors.warningSoft,
                      },
                    ]}
                  >
                    <Text style={styles.opcionTitulo}>Pendiente de pago</Text>
                    <Text style={styles.opcionDetalle}>
                      Queda por cobrar. Se registra en Pagos pendientes.
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.filaDoble}>
                  <View style={{ flex: 1 }}>
                    <Campo etiqueta="Monto (CLP)">
                      <Entrada
                        value={formCierre.valor}
                        onChangeText={(valor) => setFormCierre({ ...formCierre, valor })}
                        placeholder="Valor del pedido"
                        keyboardType="numeric"
                      />
                    </Campo>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Campo etiqueta="Fecha">
                      <CampoFecha
                        valor={formCierre.fecha}
                        onChange={(fecha) => setFormCierre({ ...formCierre, fecha })}
                      />
                    </Campo>
                  </View>
                </View>

                {formCierre.tipo === 'pendiente' ? (
                  <>
                    <Campo etiqueta="N° de factura (opcional)">
                      <Entrada
                        value={formCierre.numero}
                        onChangeText={(numero) => setFormCierre({ ...formCierre, numero })}
                        placeholder="Ej: 2450"
                        keyboardType="numeric"
                      />
                    </Campo>
                    <Campo etiqueta="Nota (opcional)">
                      <Entrada
                        value={formCierre.nota}
                        onChangeText={(nota) => setFormCierre({ ...formCierre, nota })}
                        placeholder="Ej: pago a 30 días"
                      />
                    </Campo>
                  </>
                ) : (
                  <Campo etiqueta="Detalle del trabajo (opcional)">
                    <Entrada
                      value={formCierre.detalle}
                      onChangeText={(detalle) => setFormCierre({ ...formCierre, detalle })}
                      placeholder={cerrando.pedido}
                      multiline
                    />
                  </Campo>
                )}

                <View style={styles.modalAcciones}>
                  <Boton
                    titulo="Cancelar"
                    variante="secundario"
                    onPress={() => {
                      setCerrando(null)
                      setFormCierre(null)
                    }}
                    deshabilitado={cerrandoEnCurso}
                  />
                  <Boton
                    titulo={formCierre.tipo === 'pagado' ? 'Registrar pagado' : 'Registrar por cobrar'}
                    onPress={confirmarCierre}
                    cargando={cerrandoEnCurso}
                  />
                </View>
              </ScrollView>
            </View>
          </View>
        )}
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

  // Alternador "Cliente registrado" / "Cliente nuevo"
  segmentos: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.s4,
  },
  segmento: {
    flex: 1,
    paddingVertical: space.s2 + 2,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  segmentoActivo: { backgroundColor: colors.surface },
  segmentoTexto: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text3 },
  segmentoTextoActivo: { color: colors.primary },

  ayuda: { fontSize: fontSize.sm, color: colors.text2, lineHeight: 19 },
  filaDoble: { flexDirection: 'row', gap: space.s3 },

  // Tarjetas de elección del cierre (pagado / pendiente)
  opcionCierre: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.s3,
    gap: 2,
  },
  opcionTitulo: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  opcionDetalle: { fontSize: fontSize.xs, color: colors.text2 },
})
