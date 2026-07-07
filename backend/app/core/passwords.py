# app/core/passwords.py
"""
Política de contraseñas: se aplica al CREAR o CAMBIAR una contraseña (nunca al
iniciar sesión, para no bloquear credenciales antiguas legítimas).

Diseño alineado con NIST SP 800-63B y buenas prácticas de programación segura:
  - Longitud mínima configurable (PASSWORD_MIN_LARGO) y tope de 72 bytes útiles
    (bcrypt ignora el resto; avisamos en vez de truncar en silencio).
  - Al menos 3 de las 4 clases de caracteres (mayúscula, minúscula, dígito,
    símbolo): complejidad razonable sin ser hostil.
  - Rechazo de contraseñas comunes / corporativas obvias (blocklist) y de
    secuencias triviales (aaaa…, 1234…, qwerty…): son el objetivo nº1 de los
    ataques de diccionario y fuerza bruta.
  - Rechazo de contraseñas que contengan la parte local del correo del titular
    (p. ej. correo juan@… con contraseña "Juan2026*"): trivial de adivinar.

La función lanza `ValueError` con un mensaje claro (lo captura Pydantic y lo
devuelve como 422); el frontend replica esta política en el formulario para dar
feedback inmediato (ver frontend/src/features/usuarios/passwordPolicy.ts).
"""

from __future__ import annotations

import re

from app.core.config import settings

# bcrypt solo usa los primeros 72 bytes: más allá es "seguridad fantasma".
MAX_BYTES = 72

# Contraseñas/bases comunes y términos corporativos que jamás deben aceptarse.
# Se comparan de forma normalizada (minúsculas y sin dígitos/símbolos al final),
# de modo que "Password123!" o "Qwerty2026*" también quedan fuera.
_BASES_PROHIBIDAS: frozenset[str] = frozenset(
    {
        "password", "passw0rd", "contrasena", "contraseña", "clave", "admin",
        "administrador", "usuario", "user", "root", "test", "demo", "guest",
        "qwerty", "qwertyui", "asdf", "asdfgh", "zxcvbn", "abcd", "abcdef",
        "letmein", "welcome", "bienvenido", "iloveyou", "dragon", "monkey",
        "master", "login", "secret", "changeme", "temporal", "cambiar",
        # Términos propios del portal: son la típica contraseña débil interna.
        "maestranza", "tmg", "portal", "dimak", "workera", "empresa",
    }
)

# Secuencias de teclado/dígitos que no aportan entropía.
_SECUENCIAS: tuple[str, ...] = (
    "0123456789", "9876543210",
    "abcdefghijklmnopqrstuvwxyz", "zyxwvutsrqponmlkjihgfedcba",
    "qwertyuiop", "asdfghjkl", "zxcvbnm",
)


def _clases_de_caracteres(password: str) -> int:
    clases = 0
    if re.search(r"[a-z]", password):
        clases += 1
    if re.search(r"[A-Z]", password):
        clases += 1
    if re.search(r"[0-9]", password):
        clases += 1
    if re.search(r"[^A-Za-z0-9]", password):
        clases += 1
    return clases


def _base_normalizada(password: str) -> str:
    """Minúsculas sin dígitos ni símbolos al final: 'Admin123*' -> 'admin'."""
    base = password.lower().strip()
    return re.sub(r"[^a-záéíóúñ]+$", "", base)


def _es_secuencia_trivial(password: str) -> bool:
    p = password.lower()
    # Poca variedad real de caracteres ("aaaaaaaa", "ababab", "1212 12").
    if len(set(p)) < 4:
        return True
    # Un carácter domina la contraseña ("Aaaaaaaa1!": la 'a' es >50%).
    if max(p.count(c) for c in set(p)) > len(p) // 2:
        return True
    # Patrón corto repetido para rellenar ("Ab1!Ab1!", "Ha0!Ha0!Ha"): la
    # contraseña se reconstruye repitiendo su prefijo de largo `periodo`.
    for periodo in range(1, len(p) // 2 + 1):
        if all(p[i] == p[i % periodo] for i in range(len(p))):
            return True
    # Fragmento de una secuencia conocida de 4+ caracteres.
    for seq in _SECUENCIAS:
        for i in range(len(seq) - 3):
            if seq[i : i + 4] in p:
                return True
    return False


def validar_fortaleza_password(password: str, *, email: str | None = None) -> None:
    """
    Valida la contraseña contra la política. No devuelve nada si es válida;
    lanza ValueError (mensaje apto para el usuario) si no lo es.
    """
    if password != password.strip():
        raise ValueError("La contraseña no puede empezar ni terminar con espacios.")

    largo = len(password)
    if largo < settings.PASSWORD_MIN_LARGO:
        raise ValueError(
            f"La contraseña debe tener al menos {settings.PASSWORD_MIN_LARGO} caracteres."
        )
    if len(password.encode("utf-8")) > MAX_BYTES:
        raise ValueError(
            f"La contraseña es demasiado larga (máximo {MAX_BYTES} bytes)."
        )

    if _clases_de_caracteres(password) < 3:
        raise ValueError(
            "La contraseña debe combinar al menos 3 de: mayúsculas, minúsculas, "
            "números y símbolos."
        )

    if _es_secuencia_trivial(password):
        raise ValueError(
            "La contraseña es demasiado predecible (evita secuencias como "
            "'1234', 'abcd' o caracteres repetidos)."
        )

    if _base_normalizada(password) in _BASES_PROHIBIDAS:
        raise ValueError(
            "La contraseña es demasiado común o fácil de adivinar. Elige otra."
        )

    if email:
        local = email.split("@", 1)[0].lower()
        if len(local) >= 4 and local in password.lower():
            raise ValueError(
                "La contraseña no puede contener tu nombre de correo."
            )
