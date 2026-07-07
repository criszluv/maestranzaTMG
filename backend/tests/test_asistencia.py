"""
Tests unitarios del servicio de agregación de marcajes (dominio puro, sin
red ni BD): app/services/asistencia.agrupar_jornadas.

Ejecución (desde la carpeta backend):
    python tests/test_asistencia.py
    pytest tests/test_asistencia.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.asistencia import agrupar_jornadas, resumen_mensual  # noqa: E402


def _marca(code, nombre, fecha, tipo, estado="Activo", **extra):
    empleado = {"code": code, "name": nombre, "lastName": "PRUEBA"}
    empleado.update(extra.pop("employee_extra", {}))
    base = {
        "employee": empleado,
        "attendanceDate": fecha,
        "attendanceType": tipo,
        "attendanceStatus": estado,
    }
    base.update(extra)
    return base


CHECKS = []

def check(nombre, cond):
    CHECKS.append((nombre, bool(cond)))


def run():
    # 1) Jornada normal: entrada 08:00, salida 17:30 -> 9.5 h brutas
    #    (colacion_horas=0 aísla el cálculo del span, sin descontar almuerzo).
    jornadas = agrupar_jornadas([
        _marca("111", "ANA", "2026-06-29T08:00:00", 0),
        _marca("111", "ANA", "2026-06-29T17:30:00", 1),
    ], colacion_horas=0)
    check("jornada simple: 1 fila", len(jornadas) == 1)
    check("jornada simple: 9.5 h brutas", jornadas and jornadas[0]["horas_trabajadas"] == 9.5)
    check("jornada simple: fecha correcta", jornadas and jornadas[0]["fecha"] == "2026-06-29")

    # 1b) Colación: por defecto descuenta 2 h -> neto 7.5, bruto 9.5
    jornadas = agrupar_jornadas([
        _marca("111", "ANA", "2026-06-29T08:00:00", 0),
        _marca("111", "ANA", "2026-06-29T17:30:00", 1),
    ])
    check("colación: neto = bruto - 2 h", jornadas[0]["horas_trabajadas"] == 7.5)
    check("colación: expone horas_brutas", jornadas[0]["horas_brutas"] == 9.5)

    # 1c) Colación nunca deja horas negativas (jornada más corta que la colación)
    jornadas = agrupar_jornadas([
        _marca("111", "ANA", "2026-06-29T08:00:00", 0),
        _marca("111", "ANA", "2026-06-29T09:00:00", 1),   # 1 h bruta
    ])
    check("colación: neto no baja de 0", jornadas[0]["horas_trabajadas"] == 0.0)

    # 2) Varias marcas el mismo día: primera entrada y última salida ganan
    jornadas = agrupar_jornadas([
        _marca("111", "ANA", "2026-06-29T08:00:00", 0),
        _marca("111", "ANA", "2026-06-29T12:00:00", 1),   # salida a colación
        _marca("111", "ANA", "2026-06-29T13:00:00", 0),   # vuelve
        _marca("111", "ANA", "2026-06-29T18:00:00", 1),   # salida final
    ], colacion_horas=0)
    check("multi-marca: 1 fila por día", len(jornadas) == 1)
    check("multi-marca: 08:00 a 18:00 = 10 h brutas", jornadas[0]["horas_trabajadas"] == 10.0)
    check("multi-marca: cuenta 4 marcas", jornadas[0]["marcas"] == 4)

    # 3) Entrada sin salida -> horas None (jornada en curso)
    jornadas = agrupar_jornadas([_marca("222", "BETO", "2026-06-29T09:00:00", 0)])
    check("sin salida: horas None", jornadas[0]["horas_trabajadas"] is None)
    check("sin salida: hora_entrada presente", jornadas[0]["hora_entrada"] is not None)

    # 4) Marcas INACTIVAS (anuladas en Workera) se ignoran
    jornadas = agrupar_jornadas([
        _marca("333", "CARLA", "2026-06-29T08:00:00", 0, estado="INACTIVO"),
    ])
    check("marca inactiva se ignora", len(jornadas) == 0)

    # 5) Entrada/salida extraordinarias (tipos 3 y 2) también cuentan
    jornadas = agrupar_jornadas([
        _marca("444", "DANY", "2026-06-29T07:00:00", 3),   # entrada extraordinaria
        _marca("444", "DANY", "2026-06-29T15:00:00", 2),   # salida extraordinaria
    ], colacion_horas=0)
    check("tipos extraordinarios: 8 h brutas", jornadas[0]["horas_trabajadas"] == 8.0)

    # 6) attTypeInDevice (nombre de la tabla de la doc) también se acepta
    jornadas = agrupar_jornadas([
        {
            "employee": {"code": "555", "name": "ELI", "lastName": "X"},
            "attendanceDate": "2026-06-29T08:00:00",
            "attTypeInDevice": 0,
            "attendanceStatus": "Activo",
        },
        {
            "employee": {"code": "555", "name": "ELI", "lastName": "X"},
            "attendanceDate": "2026-06-29T16:00:00",
            "attTypeInDevice": 1,
            "attendanceStatus": "Activo",
        },
    ], colacion_horas=0)
    check("acepta attTypeInDevice", jornadas and jornadas[0]["horas_trabajadas"] == 8.0)

    # 7) Días distintos -> filas distintas, orden descendente por fecha
    jornadas = agrupar_jornadas([
        _marca("111", "ANA", "2026-06-28T08:00:00", 0),
        _marca("111", "ANA", "2026-06-28T17:00:00", 1),
        _marca("111", "ANA", "2026-06-29T08:00:00", 0),
        _marca("111", "ANA", "2026-06-29T17:00:00", 1),
    ])
    check("2 días -> 2 filas", len(jornadas) == 2)
    check("orden descendente", jornadas[0]["fecha"] == "2026-06-29")

    # 8) Datos basura no revientan el servicio
    jornadas = agrupar_jornadas([
        {"attendanceDate": None},
        {"employee": None, "attendanceDate": "no-es-fecha", "attendanceType": 0},
        {},
    ])
    check("datos basura -> lista vacía sin excepción", jornadas == [])

    # 9) Nombres con espacios dobles (como los entrega Workera) se normalizan
    jornadas = agrupar_jornadas([
        _marca("666", "ERICK  ALEXANDER", "2026-06-29T08:00:00", 0),
    ])
    check(
        "nombre normalizado sin espacios dobles",
        jornadas[0]["nombre_trabajador"] == "ERICK ALEXANDER PRUEBA",
    )

    # 10) Resumen mensual por trabajador (reportería)
    resumen = resumen_mensual([
        # ANA: día 1 completo (9.5 bruto -> 7.5 neto), día 2 completo (8 bruto -> 6 neto)
        _marca("111", "ANA", "2026-06-01T08:00:00", 0),
        _marca("111", "ANA", "2026-06-01T17:30:00", 1),
        _marca("111", "ANA", "2026-06-02T08:00:00", 0),
        _marca("111", "ANA", "2026-06-02T16:00:00", 1),
        # BETO: 1 día completo (8 bruto -> 6 neto) + 1 día sin salida (incompleto)
        _marca("222", "BETO", "2026-06-01T09:00:00", 0),
        _marca("222", "BETO", "2026-06-01T17:00:00", 1),
        _marca("222", "BETO", "2026-06-03T09:00:00", 0),
    ])
    ana = next((r for r in resumen if r["trabajador_id"] == "111"), None)
    beto = next((r for r in resumen if r["trabajador_id"] == "222"), None)
    check("resumen: 2 trabajadores", len(resumen) == 2)
    check("resumen ANA: 2 días asistidos", ana and ana["dias_asistidos"] == 2)
    check("resumen ANA: 2 jornadas completas", ana and ana["jornadas_completas"] == 2)
    check("resumen ANA: horas netas 13.5 (7.5+6)", ana and ana["horas_trabajadas"] == 13.5)
    check("resumen ANA: promedio 6.75", ana and ana["horas_promedio"] == 6.75)
    check("resumen BETO: 2 días asistidos", beto and beto["dias_asistidos"] == 2)
    check("resumen BETO: 1 jornada incompleta (sin salida)", beto and beto["jornadas_incompletas"] == 1)
    check("resumen BETO: horas netas 6.0", beto and beto["horas_trabajadas"] == 6.0)
    check("resumen ordenado por nombre (ANA antes que BETO)", resumen[0]["trabajador_id"] == "111")

    ok = sum(1 for _, c in CHECKS if c)
    total = len(CHECKS)
    print("\n================ RESULTADOS (asistencia) ================")
    for nombre, c in CHECKS:
        print(f"  [{'PASS' if c else 'FAIL'}] {nombre}")
    print(f"=========================================================\n{ok}/{total} checks OK")
    return ok == total


if __name__ == "__main__":
    sys.exit(0 if run() else 1)
