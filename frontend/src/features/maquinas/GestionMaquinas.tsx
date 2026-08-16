// src/features/maquinas/GestionMaquinas.tsx
// Inventario de máquinas de planta (RRHH/Admin).
//
// El campo importante es RPM NOMINAL: la frecuencia de giro define dónde
// caen 1× y sus armónicos en el espectro de vibración. Sin ese dato, una
// alerta de "desbalance" no se puede sustentar. Por eso la vista destaca
// las máquinas a las que les falta.

import { useCallback, useEffect, useMemo, useState } from 'react'
import '../../styles/App.css'
import Modal from '../../components/common/Modal'
import { EmptyState } from '../../components/common/EmptyState'
import { useToast } from '../../components/common/Toast'
import {
  actualizarMaquina,
  crearMaquina,
  getMaquinas,
  ESTADOS_MAQUINA,
  type EstadoMaquina,
  type Maquina,
} from './api'

interface FormMaquina {
  nombre: string
  ubicacion: string
  rpm_nominal: string
  estado: EstadoMaquina
}

const FORM_VACIO: FormMaquina = {
  nombre: '',
  ubicacion: '',
  rpm_nominal: '',
  estado: 'operativa',
}

function fechaCorta(iso?: string | null): string {
  if (!iso) return 'nunca'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${dia}-${mes}-${d.getFullYear()} ${hh}:${mm}`
}

function badgeEstado(estado: string) {
  const clase =
    estado === 'operativa'
      ? 'badge-aprobada'
      : estado === 'baja'
        ? 'badge-rechazada'
        : 'badge-pendiente'
  return <span className={`badge ${clase}`}>{estado.toUpperCase()}</span>
}

export default function GestionMaquinas() {
  const notify = useToast()

  const [maquinas, setMaquinas] = useState<Maquina[]>([])
  const [loading, setLoading] = useState(true)
  const [incluirBajas, setIncluirBajas] = useState(false)

  const [editando, setEditando] = useState<Maquina | 'nueva' | null>(null)
  const [form, setForm] = useState<FormMaquina>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setLoading(true)
      setMaquinas(await getMaquinas(incluirBajas))
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudieron cargar las máquinas.', 'error')
    } finally {
      setLoading(false)
    }
  }, [incluirBajas, notify])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const sinRpm = useMemo(
    () => maquinas.filter((m) => m.rpm_nominal == null && m.estado !== 'baja').length,
    [maquinas],
  )

  const abrirNueva = () => {
    setForm(FORM_VACIO)
    setError(null)
    setEditando('nueva')
  }

  const abrirEdicion = (m: Maquina) => {
    setForm({
      nombre: m.nombre,
      ubicacion: m.ubicacion ?? '',
      rpm_nominal: m.rpm_nominal != null ? String(m.rpm_nominal) : '',
      estado: (m.estado as EstadoMaquina) ?? 'operativa',
    })
    setError(null)
    setEditando(m)
  }

  const guardar = async () => {
    if (form.nombre.trim().length < 2) {
      setError('El nombre de la máquina es obligatorio.')
      return
    }
    const rpm = form.rpm_nominal.trim() === '' ? null : Number(form.rpm_nominal)
    if (rpm !== null && (!Number.isFinite(rpm) || rpm <= 0)) {
      setError('Las RPM deben ser un número mayor que cero.')
      return
    }

    const payload = {
      nombre: form.nombre.trim(),
      ubicacion: form.ubicacion.trim() || null,
      rpm_nominal: rpm,
      estado: form.estado,
    }

    setGuardando(true)
    setError(null)
    try {
      if (editando === 'nueva') {
        await crearMaquina(payload)
        notify(`Máquina "${payload.nombre}" registrada.`, 'success')
      } else if (editando) {
        await actualizarMaquina(editando.id, payload)
        notify('Máquina actualizada.', 'success')
      }
      setEditando(null)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la máquina.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h2>Máquinas de planta</h2>
          <p>
            Activos monitoreados por los sensores. Las <strong>RPM nominales</strong> son
            necesarias para interpretar la vibración: definen dónde caen 1× y sus
            armónicos en el espectro.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="pill pill--blue">Máquinas: <strong>{maquinas.length}</strong></div>
          {sinRpm > 0 && (
            <div className="pill pill--red" title="Sin RPM no se puede diagnosticar vibración">
              Sin RPM: <strong>{sinRpm}</strong>
            </div>
          )}
        </div>
      </header>

      <div className="card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 12,
          }}
        >
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={incluirBajas}
              onChange={(e) => setIncluirBajas(e.target.checked)}
            />
            Mostrar máquinas dadas de baja
          </label>
          <button
            className="btn-primary"
            onClick={abrirNueva}
            style={{ borderRadius: 999, fontWeight: 600 }}
          >
            + Registrar máquina
          </button>
        </div>

        {sinRpm > 0 && (
          <div
            style={{
              backgroundColor: 'var(--warning-soft)',
              border: '1px solid var(--warning-border)',
              color: 'var(--warning)',
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            ⚠ Hay {sinRpm} máquina(s) sin RPM nominal. Consulta el dato real en planta:
            con un valor inventado, el diagnóstico de vibración no es defendible.
          </div>
        )}

        <div className="table-container">
          {loading && maquinas.length === 0 ? (
            <p style={{ textAlign: 'center' }}>Cargando máquinas…</p>
          ) : maquinas.length === 0 ? (
            <EmptyState icon="panel" title="No hay máquinas registradas" />
          ) : (
            <table className="rrhh-table">
              <thead>
                <tr>
                  <th>Máquina</th>
                  <th>Ubicación</th>
                  <th>RPM nominal</th>
                  <th>Telemetría</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {maquinas.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600 }}>{m.nombre}</td>
                    <td style={{ fontSize: 13 }}>{m.ubicacion || '—'}</td>
                    <td style={{ fontSize: 13 }}>
                      {m.rpm_nominal != null ? (
                        <strong>{m.rpm_nominal} rpm</strong>
                      ) : (
                        <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                          Sin definir
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      {m.lecturas} lectura(s)
                      <div>última: {fechaCorta(m.ultima_lectura)}</div>
                    </td>
                    <td>{badgeEstado(String(m.estado))}</td>
                    <td>
                      <button
                        className="action-btn btn-approve"
                        title="Editar máquina"
                        onClick={() => abrirEdicion(m)}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editando && (
        <Modal
          title={editando === 'nueva' ? 'Registrar máquina' : `Editar: ${editando.nombre}`}
          onClose={() => setEditando(null)}
          maxWidth={480}
        >
          <div className="form-group">
            <label>Nombre</label>
            <input
              className="input-dark"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Torno paralelo"
            />
          </div>

          <div className="form-group">
            <label>Ubicación (opcional)</label>
            <input
              className="input-dark"
              value={form.ubicacion}
              onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
              placeholder="Ej: Nave 2, sector norte"
            />
          </div>

          <div className="form-group">
            <label>RPM nominal</label>
            <input
              className="input-dark"
              type="number"
              min={1}
              value={form.rpm_nominal}
              onChange={(e) => setForm({ ...form, rpm_nominal: e.target.value })}
              placeholder="Ej: 1500"
            />
            <small style={{ fontSize: 11, color: 'var(--text-3)' }}>
              Velocidad de giro de trabajo. Es el dato que permite ubicar 1× en el
              espectro y distinguir un desbalance de un rodamiento dañado.
            </small>
          </div>

          <div className="form-group">
            <label>Estado</label>
            <select
              className="input-dark"
              value={form.estado}
              onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoMaquina })}
            >
              {ESTADOS_MAQUINA.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div
              style={{
                backgroundColor: 'rgba(220,38,38,0.06)',
                color: '#b91c1c',
                padding: 10,
                borderRadius: 8,
                fontSize: 13,
                border: '1px solid rgba(220,38,38,0.4)',
                marginBottom: 12,
              }}
            >
              ⚠ {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              className="btn-secondary"
              onClick={() => setEditando(null)}
              disabled={guardando}
              style={{ borderRadius: 999, padding: '0 16px', fontSize: 13 }}
            >
              Cancelar
            </button>
            <button
              className="btn-primary"
              onClick={guardar}
              disabled={guardando}
              style={{ borderRadius: 999, fontWeight: 600 }}
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
