# scripts/migrate_passwords.py
"""
Migra a hash bcrypt las contraseñas que estén guardadas en TEXTO PLANO en la
tabla `users`. Necesario tras el cambio de login en texto plano -> bcrypt.

Es IDEMPOTENTE y seguro de re-ejecutar: las contraseñas que ya son un hash
bcrypt (empiezan con $2a$/$2b$/$2y$) se dejan intactas.

Uso (desde la carpeta backend, con el venv activado):
    python scripts/migrate_passwords.py
"""

import _bootstrap  # noqa: F401  (agrega backend/ al sys.path)

from app.core.security import hash_password, is_bcrypt_hash
from app.db import SessionLocal
from app.models import User


def main() -> None:
    db = SessionLocal()
    migrados, ya_hash = 0, 0
    try:
        usuarios = db.query(User).all()
        for u in usuarios:
            if is_bcrypt_hash(u.password):
                ya_hash += 1
                continue

            # Estaba en texto plano: lo hasheamos conservando la misma clave.
            u.password = hash_password(u.password)
            migrados += 1
            print(f"[migrate] hasheado: {u.email}")

        db.commit()
    finally:
        db.close()

    print(f"\n[migrate] Listo. Migrados={migrados}, ya hasheados={ya_hash}.")


if __name__ == "__main__":
    main()
