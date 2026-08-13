# app/services/comercial.py
"""
Conversión entre los dos destinos comerciales de un trabajo:

    Trabajo realizado  <-->  Factura por cobrar
    (ya pagado)              (pago pendiente)

Sirve para corregir una decisión de cobro: un trabajo que se dio por pagado
pero en realidad está por cobrar, o una factura pendiente que finalmente se
pagó y debe pasar al historial de trabajos realizados.

Reglas del dominio:
  - El registro se MUEVE, no se duplica: se crea el destino y se borra el
    origen dentro de la misma transacción (o pasan las dos cosas, o ninguna).
  - Si el registro nació del cierre de un PEDIDO, ese pedido se resincroniza
    (cierre_tipo + trabajo_id/factura_id) para no contradecir a la realidad.
  - Se conserva lo que se pueda: cliente, monto, fecha y descripción.

Ambas funciones asumen que el llamador ya validó el rol y fijó el actor de
auditoría; NO hacen commit (lo hace el router, que controla la transacción).
"""

from datetime import date

from sqlalchemy.orm import Session

from app.models import Cliente, Factura, Pedido, Trabajo

# Topes de las columnas de texto en la BD (defensa en profundidad).
_MAX_DETALLE = 2000
_MAX_TEXTO_CLIENTE = 200
_MAX_NOTA = 500


def _nombre_cliente(db: Session, cliente_id: int | None) -> str | None:
    if cliente_id is None:
        return None
    return db.query(Cliente.nombre).filter(Cliente.id == cliente_id).scalar()


def trabajo_a_factura(db: Session, trabajo: Trabajo) -> Factura:
    """Mueve un trabajo realizado a pagos pendientes (queda por cobrar)."""
    nombre = _nombre_cliente(db, trabajo.cliente_id)

    factura = Factura(
        cliente_id=trabajo.cliente_id,
        # cliente_texto es NOT NULL: si el cliente desapareció, dejamos rastro.
        cliente_texto=(nombre or f"Cliente #{trabajo.cliente_id}")[:_MAX_TEXTO_CLIENTE],
        monto=trabajo.valor,
        fecha_emision=trabajo.fecha,
        estado="pendiente",
        nota=(trabajo.detalle or "")[:_MAX_NOTA] or None,
    )
    db.add(factura)
    db.flush()  # asigna el id sin cerrar la transacción

    # Si vino del cierre de un pedido, el pedido pasa a "pendiente".
    pedido = db.query(Pedido).filter(Pedido.trabajo_id == trabajo.id).first()
    if pedido is not None:
        pedido.trabajo_id = None
        pedido.factura_id = factura.id
        pedido.cierre_tipo = "pendiente"

    db.delete(trabajo)
    return factura


def factura_a_trabajo(db: Session, factura: Factura) -> Trabajo:
    """
    Mueve una factura al historial de trabajos realizados (se dio por pagada).

    Requiere cliente vinculado: `trabajos.cliente_id` es NOT NULL, mientras
    que una factura puede existir solo con el nombre escrito a mano.
    """
    if factura.cliente_id is None:
        raise ValueError(
            "La factura no tiene un cliente de la cartera vinculado. "
            "Edítala y selecciona el cliente antes de pasarla a trabajos."
        )

    # `detalle` es NOT NULL: se arma con lo mejor disponible.
    detalle = (factura.nota or "").strip()
    if not detalle:
        detalle = (
            f"Factura N° {factura.numero}" if factura.numero is not None
            else f"Cobro a {factura.cliente_texto}"
        )

    trabajo = Trabajo(
        cliente_id=factura.cliente_id,
        fecha=factura.fecha_emision or factura.pagada_en or date.today(),
        estado="Finalizado",
        valor=factura.monto,
        detalle=detalle[:_MAX_DETALLE],
    )
    db.add(trabajo)
    db.flush()

    # Si vino del cierre de un pedido, el pedido pasa a "pagado".
    pedido = db.query(Pedido).filter(Pedido.factura_id == factura.id).first()
    if pedido is not None:
        pedido.factura_id = None
        pedido.trabajo_id = trabajo.id
        pedido.cierre_tipo = "pagado"

    db.delete(factura)
    return trabajo
