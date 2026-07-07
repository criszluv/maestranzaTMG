# scripts/seed.py
"""
Crea las tablas (si faltan) y siembra usuarios de demostración con la
contraseña ya hasheada. Es IDEMPOTENTE: si el correo ya existe, no lo duplica.

Uso (desde la carpeta backend, con el venv activado):
    python scripts/seed.py
"""

import _bootstrap  # noqa: F401  (agrega backend/ al sys.path)

from app.core.security import hash_password
from app.db import Base, SessionLocal, engine
from app.models import User

# (email, password_plano, nombre, rol)
USUARIOS_DEMO = [
    ("admin@maestranzatmg.cl", "Admin123*", "Admin General", "admin"),
    ("rrhh@maestranzatmg.cl", "Rrhh123*", "Encargada RRHH", "rrhh"),
    ("empleado@maestranzatmg.cl", "Empleado123*", "Juan Pérez", "empleado"),
    ("empleado2@maestranzatmg.cl", "Empleado123*", "María Soto", "empleado"),
]


def main() -> None:
    print("[seed] Creando tablas que falten…")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    creados, omitidos = 0, 0
    try:
        for email, password, nombre, rol in USUARIOS_DEMO:
            existe = db.query(User).filter(User.email == email).first()
            if existe:
                omitidos += 1
                print(f"[seed] ya existe, se omite: {email}")
                continue

            db.add(
                User(
                    email=email,
                    password=hash_password(password),
                    nombre=nombre,
                    rol=rol,
                    estado="activo",
                )
            )
            creados += 1
            print(f"[seed] creado: {email} (rol={rol}, pass={password})")

        db.commit()
    finally:
        db.close()

    print(f"\n[seed] Listo. Creados={creados}, omitidos={omitidos}.")
    print("[seed] Contraseñas de demo arriba; cámbialas en producción.")


if __name__ == "__main__":
    main()
