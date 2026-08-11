// src/features/pedidos/MisPedidosEmpleado.tsx
import { useEffect, useState, useCallback } from 'react'
import '../../styles/App.css'
import {
  type Pedido,
  type EstadoPedido,
  getMisPedidos,
  actualizarEstadoPedido,
} from './api'
import { useAuth } from '../auth/AuthContext'
import FotosPedido from './FotosPedido'
import { useToast } from '../../components/common/Toast'
import { EmptyState } from '../../components/common/EmptyState'

const formatoCLP = new Intl.NumberFormat('es-CL')

function renderEstadoBadge(estado: EstadoPedido) {
  let clase = 'badge-pendiente'
  if (estado === 'terminado') clase = 'badge-aprobada'
  return <span className={`badge ${clase}`}>{estado.toUpperCase()}</span>
}

export default function MisPedidosEmpleado() {
  const { user } = useAuth()
  const notify = useToast()

  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [actualizando, setActualizando] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    if (!user) return
    try {
      setLoading(true)
      const data = await getMisPedidos(user.id)
      setPedidos(data)
    } catch (error) {
      console.error('Error cargando pedidos asignados', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const handleCambiarEstado = async (p: Pedido, nuevoEstado: EstadoPedido) => {
    if (nuevoEstado === p.estado) return
    setActualizando(p.id)
    try {
      await actualizarEstadoPedido(p.id, nuevoEstado)
      await cargar()
      notify(`"${p.pedido}" marcado como "${nuevoEstado}".`, 'success')
    } catch (error) {
      console.error('Error al actualizar estado del pedido', error)
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

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
        <h2>Mis pedidos asignados</h2>
        <p>
          Aquí ves los pedidos de trabajo que te asignaron. Puedes actualizar su estado a medida que avances.
        </p>
        </div>
      </header>

      <div className="card">
        {loading && pedidos.length === 0 ? (
          <p style={{ textAlign: 'center' }}>Cargando tus pedidos…</p>
        ) : pedidos.length === 0 ? (
          <EmptyState icon="pedidos" title="No tienes pedidos asignados por ahora" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pedidos.map((p) => (
              <div key={p.id} className="history-item">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 8,
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: 15, color: '#111827' }}>
                      {p.pedido}
                    </div>
                    {p.cliente_nombre && (
                      <div style={{ fontSize: 12, color: 'var(--primary)', marginTop: 2, fontWeight: 600 }}>
                        Cliente: {p.cliente_nombre}
                      </div>
                    )}
                    {p.descripcion && (
                      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                        {p.descripcion}
                      </div>
                    )}
                    {p.valor != null && (
                      <div style={{ fontSize: 13, color: '#374151', marginTop: 4 }}>
                        Valor: ${formatoCLP.format(p.valor)}
                      </div>
                    )}
                  </div>
                  {renderEstadoBadge(p.estado)}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <label style={{ fontSize: 12, color: '#6b7280' }}>Cambiar estado:</label>
                  <select
                    value={p.estado}
                    disabled={actualizando === p.id}
                    onChange={(e) => handleCambiarEstado(p, e.target.value as EstadoPedido)}
                    className="input-dark"
                    style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }}
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="en proceso">En proceso</option>
                    <option value="terminado">Terminado</option>
                  </select>
                </div>

                {/* Fotos de avance: el empleado documenta su progreso */}
                <FotosPedido pedidoId={p.id} puedeSubir puedeBorrar />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
