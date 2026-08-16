# scripts/simulador_iot.py
"""
Simulador básico de sensores IoT: inserta una lectura cada 3 segundos.

OJO: este script genera ruido aleatorio, sirve solo para tener datos en el
dashboard. NO sirve para validar detección de anomalías, porque no tiene
modelo físico ni etiquetas: no hay forma de saber si el detector acertó.
El banco de pruebas con modos de degradación inyectables lo reemplaza
(ver scripts/banco_pruebas.py).

Ya NO poda la tabla: la historia se conserva y la retención la aplica la
base de datos por antigüedad (fn_depurar_retencion, 90 días).

Uso (desde la carpeta backend, con el venv activado):
    python scripts/simulador_iot.py      # Ctrl+C para detener
"""

import random
import time
from datetime import datetime, timezone

import _bootstrap  # noqa: F401  (agrega backend/ al sys.path)

from app.db import SessionLocal
from app.models import IotMetrica, Maquina

MAQUINAS = ["Plasma CNC", "Torno paralelo", "Fresadora", "Prensa hidráulica"]


def insertar_metrica_fake() -> None:
    db = SessionLocal()
    try:
        nombre = random.choice(MAQUINAS)
        maquina = db.query(Maquina).filter(Maquina.nombre == nombre).first()

        registro = IotMetrica(
            maquina=nombre,
            maquina_id=maquina.id if maquina else None,
            temperatura=round(random.uniform(25, 80), 1),
            humedad=round(random.uniform(30, 90), 1),
            consumo_kw=round(random.uniform(3, 15), 2),
            calidad="ok",
            timestamp=datetime.now(timezone.utc),
        )
        db.add(registro)
        db.commit()
        db.refresh(registro)

        print(
            f"[SIM IoT] Insertada id={registro.id} | {registro.maquina} | "
            f"T={registro.temperatura}°C H={registro.humedad}% kW={registro.consumo_kw}"
        )
    finally:
        db.close()


def main() -> None:
    print("Iniciando simulador IoT (Ctrl+C para detener)...")
    while True:
        insertar_metrica_fake()
        time.sleep(3)


if __name__ == "__main__":
    main()
