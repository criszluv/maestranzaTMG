# app/services/rut.py
"""
Validación y normalización de RUT chileno (dominio puro, sin I/O).

Un RUT válido tiene cuerpo numérico + dígito verificador calculado con
módulo 11. Se acepta con o sin puntos ("76.358.680-4" o "76358680-4") y se
normaliza SIEMPRE al formato con puntos y guion, DV en mayúscula.

Toda la cartera histórica de la empresa pasa esta validación (verificado en
la migración), así que se aplica estricta a los registros nuevos.
"""

import re

_RUT_RE = re.compile(r"^(\d{1,3}(?:\.?\d{3})*)-([\dkK])$")


def _digito_verificador(cuerpo: str) -> str:
    suma, factor = 0, 2
    for d in reversed(cuerpo):
        suma += int(d) * factor
        factor = 2 if factor == 7 else factor + 1
    resto = 11 - (suma % 11)
    return {10: "K", 11: "0"}.get(resto, str(resto))


def normalizar_rut(valor: str) -> str:
    """
    Valida y devuelve el RUT en formato canónico "12.345.678-9".
    Lanza ValueError (mensaje apto para el usuario) si es inválido.
    """
    rut = (valor or "").strip().upper()
    m = _RUT_RE.match(rut)
    if not m:
        raise ValueError("RUT inválido: usa el formato 12.345.678-9.")

    cuerpo = m.group(1).replace(".", "")
    dv = m.group(2).upper()
    if not (1 <= len(cuerpo) <= 9):
        raise ValueError("RUT inválido: largo fuera de rango.")
    if _digito_verificador(cuerpo) != dv:
        raise ValueError(f"RUT inválido: el dígito verificador no corresponde ({valor}).")

    # Reagrupa con puntos cada 3 dígitos desde la derecha.
    con_puntos = ""
    for i, d in enumerate(reversed(cuerpo)):
        if i and i % 3 == 0:
            con_puntos = "." + con_puntos
        con_puntos = d + con_puntos
    return f"{con_puntos}-{dv}"
