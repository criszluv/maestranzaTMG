// src/app/usuarios.tsx
// Gestión de usuarios (RRHH/Admin): crear, editar, habilitar/deshabilitar.
// La política de contraseñas se valida en el cliente para dar feedback
// inmediato, pero la validación real la hace el backend.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { User, UserEstado, UserRol } from '../api/auth'
import {
  actualizarUsuario,
  crearUsuario,
  deshabilitarUsuario,
  getUsuarios,
  habilitarUsuario,
} from '../api/usuarios'
import { useAuth } from '../auth/AuthContext'
import { Protegido } from '../auth/Protegido'
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
import {
  POLITICA_PASSWORD_TEXTO,
  validarPasswordCliente,
} from '../services/passwordPolicy'
import { colors, fontSize, radius, shadow, space } from '../theme/tokens'

interface FormUsuario {
  nombre: string
  email: string
  password: string
  rol: UserRol
  estado: UserEstado
}

const FORM_VACIO: FormUsuario = {
  nombre: '',
  email: '',
  password: '',
  rol: 'empleado',
  estado: 'activo',
}

const OPCIONES_ESTADO = [
  { valor: 'activo' as UserEstado, etiqueta: 'Activo' },
  { valor: 'inactivo' as UserEstado, etiqueta: 'Inactivo' },
]

function UsuariosContenido() {
  const { user: sesion } = useAuth()
  const notify = useToast()
  const confirm = useConfirm()

  const [usuarios, setUsuarios] = useState<User[]>([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [buscar, setBuscar] = useState('')

  const [editando, setEditando] = useState<User | 'nuevo' | null>(null)
  const [form, setForm] = useState<FormUsuario>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  // RRHH no puede crear admins desde la app (espejo de la web); admin sí.
  const opcionesRol = useMemo(() => {
    const base = [
      { valor: 'empleado' as UserRol, etiqueta: 'Empleado' },
      { valor: 'rrhh' as UserRol, etiqueta: 'RRHH' },
    ]
    if (sesion?.rol === 'admin') {
      base.push({ valor: 'admin' as UserRol, etiqueta: 'Administrador' })
    }
    return base
  }, [sesion?.rol])

  const cargar = useCallback(async () => {
    try {
      const data = await getUsuarios()
      setUsuarios(data)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudieron cargar los usuarios.', 'error')
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
    if (!q) return usuarios
    return usuarios.filter(
      (u) => u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    )
  }, [usuarios, buscar])

  const abrirNuevo = () => {
    setForm(FORM_VACIO)
    setEditando('nuevo')
  }

  const abrirEdicion = (u: User) => {
    setForm({ nombre: u.nombre, email: u.email, password: '', rol: u.rol, estado: u.estado })
    setEditando(u)
  }

  const guardar = async () => {
    if (!form.nombre.trim() || !form.email.trim()) {
      notify('Nombre y correo son obligatorios.', 'error')
      return
    }
    const esNuevo = editando === 'nuevo'
    if (esNuevo && !form.password) {
      notify('La contraseña es obligatoria para un usuario nuevo.', 'error')
      return
    }
    if (form.password) {
      const errorPw = validarPasswordCliente(form.password, form.email)
      if (errorPw) {
        notify(errorPw, 'error')
        return
      }
    }

    setGuardando(true)
    try {
      if (esNuevo) {
        await crearUsuario({
          nombre: form.nombre.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          rol: form.rol,
          estado: form.estado,
        })
        notify('Usuario creado.', 'success')
      } else if (editando) {
        await actualizarUsuario(editando.id, {
          nombre: form.nombre.trim(),
          email: form.email.trim().toLowerCase(),
          rol: form.rol,
          estado: form.estado,
          ...(form.password ? { password: form.password } : {}),
        })
        notify('Usuario actualizado.', 'success')
      }
      setEditando(null)
      await cargar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo guardar el usuario.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const alternarEstado = async (u: User) => {
    const deshabilitar = u.estado === 'activo'
    const ok = await confirm({
      titulo: deshabilitar ? 'Deshabilitar usuario' : 'Habilitar usuario',
      mensaje: deshabilitar
        ? `${u.nombre} no podrá iniciar sesión hasta que lo habilites de nuevo.`
        : `${u.nombre} podrá volver a iniciar sesión.`,
      textoConfirmar: deshabilitar ? 'Deshabilitar' : 'Habilitar',
      peligro: deshabilitar,
    })
    if (!ok) return
    try {
      if (deshabilitar) await deshabilitarUsuario(u.id)
      else await habilitarUsuario(u.id)
      notify(deshabilitar ? 'Usuario deshabilitado.' : 'Usuario habilitado.', 'success')
      await cargar()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo cambiar el estado.', 'error')
    }
  }

  if (cargando) return <Cargando />

  const activos = usuarios.filter((u) => u.estado === 'activo').length

  return (
    <Pantalla onRefresh={onRefresh} refrescando={refrescando}>
      <Encabezado
        titulo="Usuarios"
        subtitulo="Cuentas del portal: roles y acceso."
      />

      <View style={styles.pills}>
        <Pill etiqueta="Activos" valor={activos} tono="verde" />
        <Pill etiqueta="Total" valor={usuarios.length} />
      </View>

      <View style={styles.filaBusqueda}>
        <View style={{ flex: 1 }}>
          <Buscador valor={buscar} onChange={setBuscar} placeholder="Buscar por nombre o correo…" />
        </View>
        <Boton titulo="Nuevo" icono="person-add-outline" onPress={abrirNuevo} />
      </View>

      {visibles.length === 0 ? (
        <Card>
          <Vacio mensaje="No hay usuarios que coincidan." icono="people-outline" />
        </Card>
      ) : (
        visibles.map((u) => (
          <Card key={u.id}>
            <View style={styles.cabecera}>
              <View style={{ flex: 1 }}>
                <Text style={styles.nombre}>
                  {u.nombre}
                  {sesion?.id === u.id ? '  (tú)' : ''}
                </Text>
                <Text style={styles.correo}>{u.email}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: space.s1 }}>
                <Badge texto={u.rol} tono={u.rol === 'admin' ? 'rojo' : u.rol === 'rrhh' ? 'azul' : 'neutro'} />
                <Badge texto={u.estado} />
              </View>
            </View>
            <View style={styles.acciones}>
              <Boton
                titulo="Editar"
                icono="create-outline"
                variante="secundario"
                compacto
                onPress={() => abrirEdicion(u)}
              />
              {sesion?.id !== u.id && (
                <Boton
                  titulo={u.estado === 'activo' ? 'Deshabilitar' : 'Habilitar'}
                  icono={u.estado === 'activo' ? 'ban-outline' : 'checkmark-circle-outline'}
                  variante={u.estado === 'activo' ? 'fantasma' : 'secundario'}
                  compacto
                  onPress={() => void alternarEstado(u)}
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
                {editando === 'nuevo' ? 'Nuevo usuario' : 'Editar usuario'}
              </Text>

              <Campo etiqueta="Nombre completo">
                <Entrada
                  value={form.nombre}
                  onChangeText={(t) => setForm((f) => ({ ...f, nombre: t }))}
                  placeholder="Nombre y apellido"
                />
              </Campo>

              <Campo etiqueta="Correo">
                <Entrada
                  value={form.email}
                  onChangeText={(t) => setForm((f) => ({ ...f, email: t }))}
                  placeholder="correo@empresa.cl"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </Campo>

              <Campo
                etiqueta={
                  editando === 'nuevo' ? 'Contraseña' : 'Nueva contraseña (opcional)'
                }
              >
                <Entrada
                  value={form.password}
                  onChangeText={(t) => setForm((f) => ({ ...f, password: t }))}
                  placeholder={editando === 'nuevo' ? 'Contraseña inicial' : 'Dejar en blanco para no cambiar'}
                  secureTextEntry
                  autoCapitalize="none"
                />
                <Text style={styles.ayuda}>{POLITICA_PASSWORD_TEXTO}</Text>
              </Campo>

              <Campo etiqueta="Rol">
                <Selector
                  valor={form.rol}
                  opciones={opcionesRol}
                  onChange={(rol) => setForm((f) => ({ ...f, rol }))}
                />
              </Campo>

              <Campo etiqueta="Estado">
                <Selector
                  valor={form.estado}
                  opciones={OPCIONES_ESTADO}
                  onChange={(estado) => setForm((f) => ({ ...f, estado }))}
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

export default function UsuariosScreen() {
  return (
    <Protegido rolRequerido="rrhh">
      <UsuariosContenido />
    </Protegido>
  )
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
  filaBusqueda: { flexDirection: 'row', gap: space.s2, alignItems: 'center' },
  cabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s3 },
  nombre: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  correo: { fontSize: fontSize.sm, color: colors.text3 },
  acciones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.s2,
    marginTop: space.s3,
    flexWrap: 'wrap',
  },
  ayuda: { fontSize: fontSize.xs, color: colors.text3, marginTop: space.s1, lineHeight: 15 },

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
