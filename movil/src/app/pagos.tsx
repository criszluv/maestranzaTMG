// src/app/pagos.tsx
// Pagos pendientes / facturas por cobrar (RRHH/Admin): registrar,
// editar, marcar pagada / reabrir. Eliminar es solo admin (auditado).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native'
import { getClientesResumen, type ClienteResumen } from '../api/clientes'
import {
  actualizarFactura,
  crearFactura,
  eliminarFactura,
  getFacturas,
  pasarFacturaATrabajo,
  reabrirFactura,
  type EstadoFactura,
  type Factura,
} from '../api/facturas'
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
import { formatearCLP, formatearFecha } from '../services/fechas'
import { colors, fontSize, radius, shadow, space } from '../theme/tokens'

const SIN_VINCULO = 0

const FILTROS_ESTADO = [
  { valor: 'pendiente' as EstadoFactura, etiqueta: 'Pendientes' },
  { valor: 'pagada' as EstadoFactura, etiqueta: 'Pagadas' },
]

interface FormFactura {
  cliente_id: number
  cliente_texto: string
  numero: string
  monto: string
  fecha_emision: string
  nota: string
}

const FORM_VACIO: FormFactura = {
  cliente_id: SIN_VINCULO,
  cliente_texto: '',
  numero: '',
  monto: '',
  fecha_emision: '',
  nota: '',
}

function PagosContenido() {
  const { user } = useAuth()
  const notify = useToast()
  const confirm = useConfirm()

  const [facturas, setFacturas] = useState<Factura[]>([])
  const [clientes, setClientes] = useState<ClienteResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [estado, setEstado] = useState<EstadoFactura>('pendiente')
  const [buscar, setBuscar] = useState('')

  const [editando, setEditando] = useState<Factura | 'nuevo' | null>(null)
  const [form, setForm] = useState<FormFactura>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [dataFacturas, dataClientes] = await Promise.all([
        getFacturas({ estado }),
        getClientesResumen().catch(() => [] as ClienteResumen[]),
      ])
      setFacturas(dataFacturas)
      setClientes(dataClientes)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudieron cargar las facturas.', 'error')
    } finally {
      setCargando(false)
    }
  }, [estado, notify])

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
    if (!q) return facturas
    return facturas.filter(
      (f) =>
        f.cliente_texto.toLowerCase().includes(q) ||
        (f.cliente_nombre ?? '').toLowerCase().includes(q) ||
        String(f.numero ?? '').includes(q),
    )
  }, [facturas, buscar])

  const opcionesCliente = useMemo(
    () => [
      { valor: SIN_VINCULO, etiqueta: 'Sin vincular (solo texto)' },
      ...clientes.map((c) => ({ valor: c.id, etiqueta: c.nombre })),
    ],
    [clientes],
  )

  const abrirNuevo = () => {
    setForm(FORM_VACIO)
    setEditando('nuevo')
  }

  const abrirEdicion = (f: Factura) => {
    setForm({
      cliente_id: f.cliente_id ?? SIN_VINCULO,
      cliente_texto: f.cliente_texto,
      numero: f.numero !== null && f.numero !== undefined ? String(f.numero) : '',
      monto: f.monto !== null && f.monto !== undefined ? String(f.monto) : '',
      fecha_emision: f.fecha_emision ?? '',
      nota: f.nota ?? '',
    })
    setEditando(f)
  }

  const guardar = async () => {
    if (form.cliente_id === SIN_VINCULO && !form.cliente_texto.trim()) {
      notify('Indica el cliente (vinculado o como texto).', 'error')
      return
    }
    const numeroNum = form.numero.trim() === '' ? null : Number(form.numero)
    const montoNum = form.monto.trim() === '' ? null : Number(form.monto.replace(/\./g, ''))
    if (numeroNum !== null && !Number.isFinite(numeroNum)) {
      notify('El número de factura debe ser numérico.', 'error')
      return
    }
    if (montoNum !== null && !Number.isFinite(montoNum)) {
      notify('El monto debe ser un número.', 'error')
      return
    }

    const clienteVinculado = clientes.find((c) => c.id === form.cliente_id)
    const payload = {
      cliente_id: form.cliente_id === SIN_VINCULO ? null : form.cliente_id,
      cliente_texto: form.cliente_texto.trim() || clienteVinculado?.nombre || null,
      numero: numeroNum,
      monto: montoNum,
      fecha_emision: form.fecha_emision || null,
      nota: form.nota.trim() || null,
    }

    setGuardando(true)
    try {
      if (editando === 'nuevo') {
        await crearFactura(payload)
        notify('Factura registrada.', 'success')
      } else if (editando) {
        await actualizarFactura(editando.id, payload)
        notify('Factura actualizada.', 'success')
      }
      setEditando(null)
      await cargar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo guardar la factura.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  /**
   * Cobrar una factura = el trabajo quedó pagado, así que sale de Pagos
   * pendientes y pasa al historial de Trabajos realizados. Es la única
   * lectura de "pagado" en el sistema: no existe un limbo de facturas
   * pagadas que no aparecen en ninguna parte.
   */
  const marcarPagada = async (f: Factura) => {
    if (f.cliente_id === null || f.cliente_id === undefined) {
      // Un trabajo realizado necesita cliente de la cartera.
      notify(
        `"${f.cliente_texto}" no está vinculada a un cliente de la cartera. ` +
          'Usa Editar para seleccionarlo y luego márcala como pagada.',
        'error',
      )
      return
    }
    const ok = await confirm({
      titulo: 'Marcar como pagada',
      mensaje: `Factura ${f.numero ? `N° ${f.numero} ` : ''}de ${f.cliente_nombre ?? f.cliente_texto}${
        f.monto ? ` por ${formatearCLP(f.monto)}` : ''
      }. Saldrá de Pagos pendientes y quedará en Trabajos realizados.`,
      textoConfirmar: 'Marcar pagada',
    })
    if (!ok) return
    try {
      await pasarFacturaATrabajo(f.id)
      notify('Cobrada: quedó en Trabajos realizados.', 'success')
      await cargar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo actualizar la factura.', 'error')
    }
  }

  const reabrir = async (f: Factura) => {
    const ok = await confirm({
      titulo: 'Reabrir factura',
      mensaje: 'Volverá a la lista de pagos pendientes.',
      textoConfirmar: 'Reabrir',
    })
    if (!ok) return
    try {
      await reabrirFactura(f.id)
      notify('Factura reabierta.', 'success')
      await cargar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo reabrir la factura.', 'error')
    }
  }

  const handleEliminar = async (f: Factura) => {
    const ok = await confirm({
      titulo: 'Eliminar factura',
      mensaje: 'Solo para registros erróneos; la acción queda auditada.',
      textoConfirmar: 'Eliminar',
      peligro: true,
    })
    if (!ok) return
    try {
      await eliminarFactura(f.id)
      notify('Factura eliminada.', 'success')
      await cargar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo eliminar la factura.', 'error')
    }
  }

  if (cargando) return <Cargando />

  const totalMonto = visibles.reduce((acc, f) => acc + (f.monto ?? 0), 0)

  return (
    <Pantalla onRefresh={onRefresh} refrescando={refrescando}>
      <Encabezado
        titulo="Pagos pendientes"
        subtitulo="Facturas por cobrar de la maestranza."
      />

      <View style={styles.pills}>
        <Pill etiqueta="En vista" valor={visibles.length} tono="azul" />
        <Pill
          etiqueta="Suma"
          valor={formatearCLP(totalMonto)}
          tono={estado === 'pendiente' ? 'ambar' : 'verde'}
        />
      </View>

      <View style={styles.filaBusqueda}>
        <View style={{ flex: 1 }}>
          <Buscador valor={buscar} onChange={setBuscar} placeholder="Cliente o N° factura…" />
        </View>
        <Boton titulo="Nueva" icono="add" onPress={abrirNuevo} />
      </View>

      <Selector valor={estado} opciones={FILTROS_ESTADO} onChange={setEstado} />

      {visibles.length === 0 ? (
        <Card>
          <Vacio
            mensaje={
              estado === 'pendiente'
                ? 'No hay pagos pendientes. ¡Todo cobrado!'
                : 'No hay facturas pagadas que coincidan.'
            }
            icono="cash-outline"
          />
        </Card>
      ) : (
        visibles.map((f) => (
          <Card key={f.id}>
            <View style={styles.cabecera}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cliente}>{f.cliente_nombre ?? f.cliente_texto}</Text>
                <Text style={styles.meta}>
                  {f.numero ? `N° ${f.numero}` : 'Sin número'}
                  {f.fecha_emision ? ` · Emitida ${formatearFecha(f.fecha_emision)}` : ''}
                  {f.estado === 'pagada' && f.pagada_en
                    ? ` · Pagada ${formatearFecha(f.pagada_en.split('T')[0])}`
                    : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Text style={styles.monto}>{formatearCLP(f.monto)}</Text>
                <Badge texto={String(f.estado)} />
              </View>
            </View>
            {!!f.nota && <Text style={styles.nota}>{f.nota}</Text>}

            <View style={styles.acciones}>
              <Boton
                titulo="Editar"
                icono="create-outline"
                variante="secundario"
                compacto
                onPress={() => abrirEdicion(f)}
              />
              {f.estado === 'pendiente' ? (
                <Boton
                  titulo="Marcar pagada"
                  icono="checkmark-outline"
                  compacto
                  onPress={() => void marcarPagada(f)}
                />
              ) : (
                <>
                  {/* Facturas antiguas marcadas 'pagada' antes de unificar
                      el criterio: migrarlas al historial o devolverlas. */}
                  <Boton
                    titulo="A trabajos"
                    icono="hammer-outline"
                    compacto
                    onPress={() => void marcarPagada(f)}
                  />
                  <Boton
                    titulo="Reabrir"
                    icono="refresh-outline"
                    variante="secundario"
                    compacto
                    onPress={() => void reabrir(f)}
                  />
                </>
              )}
              {user?.rol === 'admin' && (
                <Boton
                  titulo="Eliminar"
                  icono="trash-outline"
                  variante="fantasma"
                  compacto
                  onPress={() => void handleEliminar(f)}
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
                {editando === 'nuevo' ? 'Nueva factura' : 'Editar factura'}
              </Text>

              <Campo etiqueta="Cliente vinculado">
                <Selector
                  valor={form.cliente_id}
                  opciones={opcionesCliente}
                  onChange={(cliente_id) => setForm((f) => ({ ...f, cliente_id }))}
                />
              </Campo>

              <Campo etiqueta="Cliente (texto tal como se digitó)">
                <Entrada
                  value={form.cliente_texto}
                  onChangeText={(t) => setForm((f) => ({ ...f, cliente_texto: t }))}
                  placeholder="Nombre del cliente"
                />
              </Campo>

              <View style={styles.filaDoble}>
                <View style={{ flex: 1 }}>
                  <Campo etiqueta="N° factura">
                    <Entrada
                      value={form.numero}
                      onChangeText={(t) => setForm((f) => ({ ...f, numero: t }))}
                      placeholder="Ej: 1024"
                      keyboardType="numeric"
                    />
                  </Campo>
                </View>
                <View style={{ flex: 1 }}>
                  <Campo etiqueta="Monto (CLP)">
                    <Entrada
                      value={form.monto}
                      onChangeText={(t) => setForm((f) => ({ ...f, monto: t }))}
                      placeholder="Ej: 890000"
                      keyboardType="numeric"
                    />
                  </Campo>
                </View>
              </View>

              <Campo etiqueta="Fecha de emisión">
                <CampoFecha
                  valor={form.fecha_emision}
                  onChange={(fecha_emision) => setForm((f) => ({ ...f, fecha_emision }))}
                  limpiable
                />
              </Campo>

              <Campo etiqueta="Nota (opcional)">
                <Entrada
                  value={form.nota}
                  onChangeText={(t) => setForm((f) => ({ ...f, nota: t }))}
                  placeholder="Observaciones…"
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

export default function PagosScreen() {
  return (
    <Protegido rolRequerido="rrhh">
      <PagosContenido />
    </Protegido>
  )
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  filaBusqueda: { flexDirection: 'row', gap: space.s2, alignItems: 'center' },
  cabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s3 },
  cliente: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  meta: { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },
  monto: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  nota: { fontSize: fontSize.sm, color: colors.text2, fontStyle: 'italic', marginTop: space.s2 },
  acciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.s2,
    marginTop: space.s3,
    flexWrap: 'wrap',
  },
  filaDoble: { flexDirection: 'row', gap: space.s3 },

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
