# app/services/privacidad.py
"""
Módulo de cumplimiento de la Ley 21.719 (protección de datos personales).

Implementa los derechos del titular que dependen de la aplicación:
  - ACCESO / PORTABILIDAD: datos_personales_de() arma el paquete completo de
    datos de una persona en JSON estructurado y legible por máquina.
  - SUPRESIÓN compatible con retención legal: anonimizar_usuario() elimina el
    vínculo persona-datos (pseudonimización irreversible) manteniendo los
    registros que la ley obliga a conservar (solicitudes 5 años, pedidos 6).
  - RESPONSABILIDAD: fijar_actor_auditoria() propaga QUIÉN hace cada cambio
    a los triggers de auditoría de la BD (columna actor_app).
  - TRANSPARENCIA: POLITICA_TRATAMIENTO es la fuente única de la política,
    servida por la API y mostrada en el frontend.
"""

import secrets
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models import Pedido, SolicitudRRHH, User

# ---------------------------------------------------------------------------
#  Transparencia (Ley 21.719: deber de información / registro de tratamiento)
# ---------------------------------------------------------------------------

POLITICA_TRATAMIENTO: dict[str, Any] = {
    "responsable": settings.RESPONSABLE_NOMBRE,
    "contacto": settings.RESPONSABLE_CONTACTO,
    "marco_legal": [
        "Ley 21.719 de Protección de Datos Personales (vigencia 01-12-2026)",
        "Art. 17 del Código Tributario (conservación de documentación: 6 años)",
        "Normativa Dirección del Trabajo (registros laborales: 5 años)",
    ],
    "finalidades": [
        {
            "dato": "Nombre y correo electrónico (cuenta de usuario)",
            "finalidad": "Autenticación y control de acceso al portal interno.",
            "base_licitud": "Ejecución de la relación laboral / interés legítimo.",
            "plazo": "Mientras exista relación con la empresa; luego se anonimiza.",
        },
        {
            "dato": "Solicitudes de días libres, permisos y licencias",
            "finalidad": "Gestión de RRHH (aprobación y planificación de ausencias).",
            "base_licitud": "Obligaciones laborales del empleador.",
            "plazo": "5 años desde el término de la solicitud; depuración automática.",
        },
        {
            "dato": "Pedidos / órdenes de trabajo asignadas",
            "finalidad": "Operación y trazabilidad comercial de la maestranza.",
            "base_licitud": "Obligaciones tributarias y comerciales.",
            "plazo": "6 años para pedidos terminados; depuración automática.",
        },
        {
            "dato": "Registros de marcaje (entrada/salida)",
            "finalidad": "Control de asistencia y jornada legal.",
            "base_licitud": "Obligación legal (Código del Trabajo).",
            "plazo": "Administrados por Workera (encargado externo, 5 años). "
                     "Este portal solo los CONSULTA, no los almacena.",
        },
    ],
    "derechos": {
        "acceso": "Descarga tus datos en Privacidad -> 'Descargar mis datos'.",
        "rectificacion": "Solicita la corrección de nombre/correo a RRHH.",
        "supresion": "Al terminar la relación laboral puedes pedir la anonimización "
                     "de tu cuenta; los registros con plazo legal vigente se "
                     "conservan disociados de tu identidad.",
        "oposicion_y_portabilidad": "Escribe al contacto del responsable.",
    },
    "medidas_seguridad": [
        "Contraseñas con hash bcrypt (nunca en texto plano) y política de "
        "fortaleza obligatoria al crearlas o cambiarlas.",
        "Acceso por token JWT firmado con expiración y control de rol por endpoint.",
        "Protección contra fuerza bruta y prueba masiva de contraseñas en el "
        "inicio de sesión (límite de intentos por cuenta y por origen).",
        "Base de datos con RLS deny-by-default y sin acceso público.",
        "Auditoría de cambios sobre datos personales (sin contraseñas).",
        "Depuración automática al vencer los plazos legales de conservación.",
        "Logs de seguridad con correos enmascarados (minimización).",
    ],
    "brechas": "Ante una violación de seguridad que afecte datos personales, el "
               "responsable evalúa y notifica a la Agencia de Protección de Datos "
               "y a los afectados según la Ley 21.719 (ver docs/PROTECCION_DATOS.md).",
}


# ---------------------------------------------------------------------------
#  Derecho de acceso + portabilidad
# ---------------------------------------------------------------------------

def datos_personales_de(db: Session, usuario: User) -> dict[str, Any]:
    """Paquete completo de datos personales del titular (JSON portable)."""
    solicitudes = (
        db.query(SolicitudRRHH)
        .filter(SolicitudRRHH.trabajador_id == usuario.id)
        .order_by(SolicitudRRHH.creado_en.desc())
        .all()
    )
    pedidos = (
        db.query(Pedido)
        .filter(Pedido.encargado_id == usuario.id)
        .order_by(Pedido.id.desc())
        .all()
    )

    return {
        "generado_en": datetime.now(timezone.utc).isoformat(),
        "formato": "JSON estructurado (derecho de acceso y portabilidad, Ley 21.719)",
        "responsable": settings.RESPONSABLE_NOMBRE,
        "cuenta": {
            "id": usuario.id,
            "nombre": usuario.nombre,
            "email": usuario.email,
            "rol": usuario.rol,
            "estado": usuario.estado,
            "creado_en": usuario.creado_en.isoformat() if usuario.creado_en else None,
        },
        "solicitudes_dias_libres": [
            {
                "id": s.id,
                "tipo": s.tipo,
                "motivo": s.motivo,
                "fecha_inicio": s.fecha_inicio.isoformat(),
                "fecha_fin": s.fecha_fin.isoformat(),
                "estado": s.estado,
                "creado_en": s.creado_en.isoformat() if s.creado_en else None,
            }
            for s in solicitudes
        ],
        "pedidos_asignados": [
            {
                "id": p.id,
                "pedido": p.pedido,
                "descripcion": p.descripcion,
                "estado": p.estado,
                "valor": p.valor,
            }
            for p in pedidos
        ],
        "marcaje": "Los registros de asistencia los administra Workera "
                   "(encargado externo). Solicítalos a RRHH o en tu portal "
                   "del trabajador de Workera.",
    }


# ---------------------------------------------------------------------------
#  Derecho de supresión (compatible con retención legal) = anonimización
# ---------------------------------------------------------------------------

def anonimizar_usuario(db: Session, usuario: User) -> User:
    """
    Pseudonimización irreversible: rompe el vínculo persona-datos sin borrar
    los registros con plazo legal vigente (quedan asociados a un id neutro).
    """
    usuario.nombre = f"Ex-trabajador {usuario.id}"
    usuario.email = f"anonimizado.{usuario.id}@tmg.invalido"
    # Contraseña irrecuperable: hash de un secreto aleatorio que nadie conoce.
    usuario.password = hash_password(secrets.token_urlsafe(32))
    usuario.estado = "inactivo"
    db.commit()
    db.refresh(usuario)
    return usuario


# ---------------------------------------------------------------------------
#  Responsabilidad: actor real en la auditoría de la BD
# ---------------------------------------------------------------------------

def fijar_actor_auditoria(db: Session, actor: User) -> None:
    """
    Deja el usuario que ejecuta la operación en la variable de transacción
    app.actor; el trigger fn_auditar_users la copia a auditoria_datos.actor_app.
    set_config(..., true) es LOCAL a la transacción: no contamina otras
    requests que compartan la conexión del pool.
    """
    if db.get_bind().dialect.name != "postgresql":
        return  # tests corren sobre SQLite: no aplica
    db.execute(
        text("select set_config('app.actor', :valor, true)"),
        {"valor": f"{actor.id}|{actor.email}"},
    )
