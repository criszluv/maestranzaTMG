# scripts/simulador_iot.py
"""
Simulador de sensores IoT: inserta una métrica aleatoria cada 3 segundos y
poda la tabla para mantener como máximo MAX_METRICAS filas.

Uso (desde la carpeta backend, con el venv activado):
    python scripts/simulador_iot.py      # Ctrl+C para detener
"""

import random
import time
from datetime import datetime, timezone

import _bootstrap  # noqa: F401  (agrega backend/ al sys.path)

from app.db import SessionLocal
from app.models import IotMetrica
from app.services.iot_metricas import MAX_METRICAS, podar_metricas

MAQUINAS = ["Plasma CNC", "Torno paralelo", "Fresadora", "Prensa hidráulica"]


def insertar_metrica_fake() -> None:
    db = SessionLocal()
    try:
        registro = IotMetrica(
            maquina=random.choice(MAQUINAS),
            temperatura=round(random.uniform(25, 80), 1),
            humedad=round(random.uniform(30, 90), 1),
            consumo_kw=round(random.uniform(3, 15), 2),
            timestamp=datetime.now(timezone.utc),
        )
        db.add(registro)
        db.commit()
        db.refresh(registro)

        print(
            f"[SIM IoT] Insertada id={registro.id} | {registro.maquina} | "
            f"T={registro.temperatura}°C H={registro.humedad}% kW={registro.consumo_kw}"
        )

        # Poda automática (misma lógica que usa la API: app/services/iot_metricas.py)
        borradas = podar_metricas(db, MAX_METRICAS)
        if borradas > 0:
            print(f"[SIM IoT] Limpieza automática: {borradas} filas antiguas eliminadas")
    finally:
        db.close()


def main() -> None:
    print("Iniciando simulador IoT (Ctrl+C para detener)...")
    while True:
        insertar_metrica_fake()
        time.sleep(3)


if __name__ == "__main__":
    main()
