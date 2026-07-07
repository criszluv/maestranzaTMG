# app/core/rate_limit.py
"""
Rate limiting simple en memoria para el endpoint de login.

Frena ataques de fuerza bruta: tras N intentos FALLIDOS en una ventana de
tiempo (por combinación IP+email), el endpoint responde 429 hasta que la
ventana expire. Un login exitoso limpia el contador.

Alcance: proceso único (uvicorn local). Si algún día se despliega con
varios workers/instancias, reemplazar por un backend compartido (ej. Redis).
"""

import threading
import time
from collections import defaultdict, deque


class LimitadorIntentos:
    def __init__(self, max_intentos: int, ventana_segundos: int) -> None:
        self.max_intentos = max_intentos
        self.ventana = ventana_segundos
        self._fallos: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _purgar(self, clave: str, ahora: float) -> None:
        cola = self._fallos[clave]
        while cola and (ahora - cola[0]) > self.ventana:
            cola.popleft()
        if not cola:
            self._fallos.pop(clave, None)

    def bloqueado(self, clave: str) -> bool:
        """True si la clave superó el máximo de fallos dentro de la ventana."""
        ahora = time.monotonic()
        with self._lock:
            self._purgar(clave, ahora)
            return len(self._fallos.get(clave, ())) >= self.max_intentos

    def registrar_fallo(self, clave: str) -> None:
        ahora = time.monotonic()
        with self._lock:
            self._purgar(clave, ahora)
            self._fallos[clave].append(ahora)

    def limpiar(self, clave: str) -> None:
        """Login exitoso: se olvida el historial de fallos de esa clave."""
        with self._lock:
            self._fallos.pop(clave, None)
