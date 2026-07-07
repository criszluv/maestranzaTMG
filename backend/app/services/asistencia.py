# app/services/asistencia.py
"""
Lógica de dominio del módulo de asistencia: transforma las MARCAS crudas de
Workera (una fila por cada pasada de tarjeta/huella) en JORNADAS diarias
(una fila por trabajador y día, con entrada, salida y horas trabajadas).

Es una función pura: recibe dicts y devuelve dicts, sin tocar HTTP ni BD.
Eso la hace trivial de testear (ver tests/test_asistencia.py).

Tipos de marca según la documentación de Workera (attTypeInDevice):
    0 = Entrada                 3 = Entrada extraordinaria
    1 = Salida                  2 = Salida extraordinaria
    4 = Inicio descanso         5 = Término descanso

Reglas de agregación (simples a propósito, pensadas para RRHH):
  - Se ignoran las marcas con estado INACTIVO (anuladas en Workera).
  - Entrada de la jornada  = primera marca tipo entrada del día (0 o 3).
  - Salida de la jornada   = última marca tipo salida del día (1 o 2).
  - horas_brutas           = salida - entrada.
  - horas_trabajadas (neto)= horas_brutas - colación (2 h por defecto, regla de
    la empresa: todos los trabajadores tienen 2 h de almuerzo). Nunca negativo.
    Es el valor que se usa para las alertas y los reportes.
  - Si falta entrada o salida, ambas quedan en None -> el frontend lo muestra
    como "En curso" / jornada incompleta.
"""

from datetime import datetime
from typing import Any

from app.core.config import settings

TIPOS_ENTRADA = {0, 3}
TIPOS_SALIDA = {1, 2}


def _horas_netas(bruto: float, colacion_horas: float) -> float:
    """Descuenta la colación de las horas brutas, sin bajar de 0."""
    return round(max(0.0, bruto - colacion_horas), 2)


def _parsear_fecha(valor: Any) -> datetime | None:
    """Parsea 'yyyy-MM-ddTHH:mm:ss' (formato documentado de Workera)."""
    if not isinstance(valor, str) or not valor:
        return None
    try:
        return datetime.fromisoformat(valor)
    except ValueError:
        return None


def _tipo_marca(marca: dict[str, Any]) -> int | None:
    """
    Tipo de registro. La tabla de la doc lo llama `attTypeInDevice`, pero el
    ejemplo de respuesta usa `attendanceType`: aceptamos ambos.
    """
    for clave in ("attendanceType", "attTypeInDevice"):
        valor = marca.get(clave)
        if valor is not None:
            try:
                return int(valor)
            except (TypeError, ValueError):
                return None
    return None


def _esta_activa(marca: dict[str, Any]) -> bool:
    estado = str(marca.get("attendanceStatus") or "").strip().upper()
    # ACTIVO y MODIFICADO cuentan; INACTIVO son marcas anuladas.
    return estado != "INACTIVO"


def agrupar_jornadas(
    marcas: list[dict[str, Any]],
    colacion_horas: float | None = None,
) -> list[dict[str, Any]]:
    """
    Agrupa marcas crudas de Workera por (trabajador, día) y calcula la
    jornada. Devuelve dicts compatibles con app/schemas/asistencia.JornadaOut,
    ordenados por fecha descendente y nombre.

    `colacion_horas`: horas de almuerzo a descontar del bruto (por defecto,
    settings.COLACION_HORAS). Pasar 0 para no descontar (útil en tests).
    """
    if colacion_horas is None:
        colacion_horas = settings.COLACION_HORAS

    jornadas: dict[tuple[str, str], dict[str, Any]] = {}

    for marca in marcas:
        if not _esta_activa(marca):
            continue

        momento = _parsear_fecha(marca.get("attendanceDate"))
        if momento is None:
            continue

        empleado = marca.get("employee") or {}
        codigo = str(empleado.get("code") or "")
        dia = momento.date().isoformat()
        clave = (codigo, dia)

        if clave not in jornadas:
            nombre = " ".join(
                parte
                for parte in (empleado.get("name"), empleado.get("lastName"))
                if parte
            )
            # Los nombres de Workera pueden traer espacios dobles.
            nombre = " ".join(nombre.split())
            jornadas[clave] = {
                "trabajador_id": codigo or None,
                "nombre_trabajador": nombre or None,
                "identificacion": empleado.get("identification"),
                "sucursal": empleado.get("branchOffice"),
                "departamento": empleado.get("department"),
                "fecha": dia,
                "_entrada": None,   # datetime interno
                "_salida": None,    # datetime interno
                "marcas": 0,
            }

        jornada = jornadas[clave]
        jornada["marcas"] += 1

        tipo = _tipo_marca(marca)
        if tipo in TIPOS_ENTRADA:
            if jornada["_entrada"] is None or momento < jornada["_entrada"]:
                jornada["_entrada"] = momento
        elif tipo in TIPOS_SALIDA:
            if jornada["_salida"] is None or momento > jornada["_salida"]:
                jornada["_salida"] = momento

    resultado: list[dict[str, Any]] = []
    for jornada in jornadas.values():
        entrada: datetime | None = jornada.pop("_entrada")
        salida: datetime | None = jornada.pop("_salida")

        jornada["hora_entrada"] = entrada.isoformat() if entrada else None
        jornada["hora_salida"] = salida.isoformat() if salida else None

        if entrada and salida and salida >= entrada:
            bruto = round((salida - entrada).total_seconds() / 3600, 2)
            jornada["horas_brutas"] = bruto
            jornada["horas_trabajadas"] = _horas_netas(bruto, colacion_horas)
        else:
            # Jornada en curso / incompleta: sin entrada o sin salida.
            jornada["horas_brutas"] = None
            jornada["horas_trabajadas"] = None

        resultado.append(jornada)

    resultado.sort(
        key=lambda j: (j["fecha"] or "", j["nombre_trabajador"] or ""),
        reverse=True,
    )
    return resultado


def resumen_mensual(
    marcas: list[dict[str, Any]],
    colacion_horas: float | None = None,
) -> list[dict[str, Any]]:
    """
    Consolida las marcas de un período en un RESUMEN por trabajador, pensado
    para reportería mensual de RRHH. Por cada trabajador entrega:

      - dias_asistidos:        días con al menos una marca.
      - jornadas_completas:    días con entrada y salida.
      - jornadas_incompletas:  días sin entrada o sin salida (falta marcar).
      - horas_trabajadas:      suma de horas NETAS (bruto - colación).
      - horas_promedio:        horas netas / jornadas completas.

    Ordenado por nombre de trabajador. Reutiliza agrupar_jornadas (misma regla
    de colación y de entrada/salida), así reporte e historial siempre cuadran.
    """
    jornadas = agrupar_jornadas(marcas, colacion_horas=colacion_horas)

    resumenes: dict[str, dict[str, Any]] = {}
    for j in jornadas:
        codigo = str(j.get("trabajador_id") or "")
        if codigo not in resumenes:
            resumenes[codigo] = {
                "trabajador_id": j.get("trabajador_id"),
                "nombre_trabajador": j.get("nombre_trabajador"),
                "identificacion": j.get("identificacion"),
                "sucursal": j.get("sucursal"),
                "departamento": j.get("departamento"),
                "dias_asistidos": 0,
                "jornadas_completas": 0,
                "jornadas_incompletas": 0,
                "horas_trabajadas": 0.0,
            }
        r = resumenes[codigo]
        r["dias_asistidos"] += 1
        if j.get("horas_trabajadas") is not None:
            r["jornadas_completas"] += 1
            r["horas_trabajadas"] += j["horas_trabajadas"]
        else:
            r["jornadas_incompletas"] += 1

    resultado: list[dict[str, Any]] = []
    for r in resumenes.values():
        r["horas_trabajadas"] = round(r["horas_trabajadas"], 2)
        completas = r["jornadas_completas"]
        r["horas_promedio"] = (
            round(r["horas_trabajadas"] / completas, 2) if completas else None
        )
        resultado.append(r)

    resultado.sort(key=lambda r: (r["nombre_trabajador"] or "").lower())
    return resultado
