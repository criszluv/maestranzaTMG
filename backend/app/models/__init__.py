# app/models/__init__.py
"""
Modelos ORM del sistema, uno por dominio.

Importarlos aquí los registra en Base.metadata (necesario para
create_all) y permite seguir usando `from app.models import User`.
"""

from app.models.auditoria import Auditoria
from app.models.cliente import Cliente, ClienteContacto, ClienteEntidad
from app.models.factura import Factura
from app.models.iot import IotMetrica
from app.models.pedido import Pedido
from app.models.pedido_foto import PedidoFoto
from app.models.solicitud import SolicitudRRHH
from app.models.trabajo import Trabajo
from app.models.usuario import User

__all__ = [
    "User", "SolicitudRRHH", "Pedido", "PedidoFoto", "IotMetrica", "Auditoria",
    "Cliente", "ClienteContacto", "ClienteEntidad", "Trabajo", "Factura",
]
