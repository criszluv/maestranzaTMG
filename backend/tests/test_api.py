"""
Pruebas e2e de la API con FastAPI TestClient sobre SQLite en memoria.

Cubren autenticación JWT, hashing de contraseñas, guardas de rol, rate limit
de login y el módulo de asistencia (con la API de Workera simulada, sin red).

Ejecución (desde la carpeta backend):

    python tests/test_api.py        # runner simple, imprime PASS/FAIL
    pytest tests/test_api.py        # si tienes pytest instalado

Requiere: pip install -r requirements-dev.txt
"""

import os
import sys

# Permite 'import app' al ejecutar el archivo directamente (agrega backend/ al path)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# DATABASE_URL ficticia: la app crea el engine de Postgres de forma perezosa
# (no conecta) porque sobreescribimos get_db con SQLite en memoria.
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg2://u:p@localhost/db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-no-usar-en-prod")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import BigInteger, create_engine  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402


# --- Shim SOLO para tests: BigInteger -> INTEGER en SQLite para que el PK
#     autoincremente (SQLite solo usa rowid con el token exacto INTEGER). ---
@compiles(BigInteger, "sqlite")
def _bigint_as_integer_sqlite(type_, compiler, **kw):  # noqa: ANN001
    return "INTEGER"


import app.routers.asistencia as asistencia_router  # noqa: E402
import app.routers.pedidos as pedidos_router  # noqa: E402
import app.routers.solicitudes as solicitudes_router  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.security import is_bcrypt_hash, verify_password  # noqa: E402
from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.services.workera import WorkeraNoConfigurado  # noqa: E402

# Motor SQLite en memoria compartido (StaticPool = misma conexión/datos).
engine = create_engine(
    "sqlite+pysqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    future=True,
)
TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base.metadata.create_all(engine)


def _override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_get_db
client = TestClient(app)


def _seed():
    from app.core.security import hash_password
    db = TestingSession()
    try:
        db.query(User).delete()
        db.add_all([
            User(email="admin@t.cl", password=hash_password("Admin123*"), nombre="Admin", rol="admin", estado="activo"),
            User(email="rrhh@t.cl", password=hash_password("Rrhh123*"), nombre="RRHH", rol="rrhh", estado="activo"),
            User(email="emp@t.cl", password=hash_password("Emp123*"), nombre="Empleado Uno", rol="empleado", estado="activo"),
            User(email="emp2@t.cl", password=hash_password("Emp123*"), nombre="Empleado Dos", rol="empleado", estado="activo"),
            User(email="off@t.cl", password=hash_password("Off123*"), nombre="Inactivo", rol="empleado", estado="inactivo"),
        ])
        db.commit()
        ids = {u.email: u.id for u in db.query(User).all()}
        return ids
    finally:
        db.close()


def _login(email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# Marcas crudas de Workera de ejemplo (formato real de /attendanceData).
MARCAS_FAKE = [
    {
        "employee": {
            "code": "11111111", "identification": "11.111.111-1",
            "name": "ERICK ALEXANDER", "lastName": "RIVAS CORRALES",
            "branchOffice": "Matriz", "department": "Producción",
        },
        "attendanceDate": "2026-06-29T08:02:00",
        "attendanceType": 0,          # entrada
        "attendanceStatus": "Activo",
    },
    {
        "employee": {
            "code": "11111111", "identification": "11.111.111-1",
            "name": "ERICK ALEXANDER", "lastName": "RIVAS CORRALES",
            "branchOffice": "Matriz", "department": "Producción",
        },
        "attendanceDate": "2026-06-29T17:32:00",
        "attendanceType": 1,          # salida
        "attendanceStatus": "Activo",
    },
    {
        "employee": {"code": "22222222", "name": "MARIA", "lastName": "SOTO"},
        "attendanceDate": "2026-06-29T09:00:00",
        "attendanceType": 0,          # entrada sin salida -> jornada en curso
        "attendanceStatus": "Activo",
    },
]


# --------------------------- CHECKS ---------------------------

CHECKS = []

def check(nombre, cond):
    CHECKS.append((nombre, bool(cond)))


def run():
    ids = _seed()

    # 1) Login credenciales malas -> 401
    check("login password incorrecta -> 401", _login("admin@t.cl", "mala").status_code == 401)

    # 2) Login usuario inactivo -> 403
    check("login usuario inactivo -> 403", _login("off@t.cl", "Off123*").status_code == 403)

    # 3) Login admin OK -> 200 con token
    r = _login("admin@t.cl", "Admin123*")
    admin_token = r.json().get("access_token") if r.status_code == 200 else None
    check("login admin -> 200 + token", r.status_code == 200 and bool(admin_token))
    check("login no expone password", "password" not in r.json().get("user", {}))

    rrhh_token = _login("rrhh@t.cl", "Rrhh123*").json()["access_token"]
    emp_token = _login("emp@t.cl", "Emp123*").json()["access_token"]
    emp2_token = _login("emp2@t.cl", "Emp123*").json()["access_token"]

    # 4) /auth/me
    check("/auth/me sin token -> 401", client.get("/api/auth/me").status_code == 401)
    check("/auth/me con token -> 200", client.get("/api/auth/me", headers=_auth(emp_token)).status_code == 200)

    # 5) IoT requiere autenticacion
    check("GET /iot/metricas sin token -> 401", client.get("/api/iot/metricas").status_code == 401)
    check("GET /iot/metricas con token -> 200", client.get("/api/iot/metricas", headers=_auth(emp_token)).status_code == 200)

    # 6) Guardas de rol en /rrhh/usuarios
    check("empleado lista usuarios -> 403", client.get("/api/rrhh/usuarios", headers=_auth(emp_token)).status_code == 403)
    check("rrhh lista usuarios -> 200", client.get("/api/rrhh/usuarios", headers=_auth(rrhh_token)).status_code == 200)
    check("sin token lista usuarios -> 401", client.get("/api/rrhh/usuarios").status_code == 401)

    # 7) RRHH no puede crear admin (escalada) -> 403
    nuevo_admin = {"email": "x@t.cl", "password": "Zx9#vTq2wp", "nombre": "X", "rol": "admin", "estado": "activo"}
    check("rrhh crea admin -> 403", client.post("/api/rrhh/usuarios", json=nuevo_admin, headers=_auth(rrhh_token)).status_code == 403)

    # 8) Rol invalido -> 422 (Literal)
    invalido = {"email": "y@t.cl", "password": "Zx9#vTq2wp", "nombre": "Y", "rol": "superuser", "estado": "activo"}
    check("rol invalido -> 422", client.post("/api/rrhh/usuarios", json=invalido, headers=_auth(admin_token)).status_code == 422)

    # 8b) Política de contraseñas: menos de 8 caracteres -> 422
    corta = {"email": "z@t.cl", "password": "Ab1*", "nombre": "Z", "rol": "empleado", "estado": "activo"}
    check("password corta -> 422", client.post("/api/rrhh/usuarios", json=corta, headers=_auth(admin_token)).status_code == 422)

    # 8c) Política de contraseñas (fortaleza): casos que deben rechazarse (422)
    def _crea(email, password):
        return client.post(
            "/api/rrhh/usuarios",
            json={"email": email, "password": password, "nombre": "P", "rol": "empleado", "estado": "activo"},
            headers=_auth(admin_token),
        ).status_code

    check("password sin complejidad (solo minúsculas) -> 422", _crea("p1@t.cl", "holamundoxy") == 422)
    check("password con secuencia trivial (12345) -> 422", _crea("p2@t.cl", "Segura12345!") == 422)
    check("password común de la blocklist -> 422", _crea("p3@t.cl", "Password2020!") == 422)
    check("password que contiene el correo -> 422", _crea("pepe@t.cl", "Pepe#Segura9") == 422)

    # 9) RRHH crea empleado -> 201 y se guarda HASHEADO
    emp_nuevo = {"email": "nuevo@t.cl", "password": "Kp7#wR2xvz", "nombre": "Nuevo", "rol": "empleado", "estado": "activo"}
    r = client.post("/api/rrhh/usuarios", json=emp_nuevo, headers=_auth(rrhh_token))
    check("rrhh crea empleado -> 201", r.status_code == 201)
    db = TestingSession()
    try:
        u = db.query(User).filter(User.email == "nuevo@t.cl").first()
        check("password se guarda hasheada (bcrypt)", u is not None and is_bcrypt_hash(u.password))
        check("password hash verifica con la clave", u is not None and verify_password("Kp7#wR2xvz", u.password))
        check("hash != texto plano", u is not None and u.password != "Kp7#wR2xvz")
    finally:
        db.close()

    # 10) Solicitud: empleado solo para si mismo
    sol_otro = {"trabajador_id": ids["emp2@t.cl"], "tipo": "Vacaciones", "motivo": "x", "fecha_inicio": "2026-07-01", "fecha_fin": "2026-07-05"}
    check("empleado crea solicitud de otro -> 403", client.post("/api/rrhh/solicitudes", json=sol_otro, headers=_auth(emp_token)).status_code == 403)
    sol_propia = {"trabajador_id": ids["emp@t.cl"], "tipo": "Vacaciones", "motivo": "x", "fecha_inicio": "2026-07-01", "fecha_fin": "2026-07-05"}
    r = client.post("/api/rrhh/solicitudes", json=sol_propia, headers=_auth(emp_token))
    sol_id = r.json().get("id") if r.status_code == 201 else None
    check("empleado crea solicitud propia -> 201", r.status_code == 201)

    # 11) Solicitud con fecha_fin < inicio -> 422
    sol_mal = {"trabajador_id": ids["emp@t.cl"], "tipo": "Vacaciones", "motivo": "x", "fecha_inicio": "2026-07-10", "fecha_fin": "2026-07-01"}
    check("fecha_fin < inicio -> 422", client.post("/api/rrhh/solicitudes", json=sol_mal, headers=_auth(emp_token)).status_code == 422)

    # 12) Cambiar estado: empleado -> 403; estado invalido -> 422; rrhh valido -> 200
    check("empleado cambia estado solicitud -> 403", client.patch(f"/api/rrhh/solicitudes/{sol_id}/estado", json={"estado": "Aprobada"}, headers=_auth(emp_token)).status_code == 403)
    check("estado solicitud invalido -> 422", client.patch(f"/api/rrhh/solicitudes/{sol_id}/estado", json={"estado": "Quizas"}, headers=_auth(rrhh_token)).status_code == 422)
    check("rrhh aprueba solicitud -> 200", client.patch(f"/api/rrhh/solicitudes/{sol_id}/estado", json={"estado": "Aprobada"}, headers=_auth(rrhh_token)).status_code == 200)

    # 12b) Saldo de vacaciones: la solicitud aprobada (Vacaciones 07-01..07-05,
    #      3 días hábiles) descuenta del saldo anual de 15.
    r = client.get("/api/rrhh/mis-vacaciones", headers=_auth(emp_token))
    saldo = r.json() if r.status_code == 200 else {}
    check("saldo vacaciones -> 200", r.status_code == 200)
    check("saldo: 15 días anuales", saldo.get("dias_anuales") == 15)
    check("saldo: 3 días hábiles usados", saldo.get("dias_usados") == 3)
    check("saldo: 12 disponibles", saldo.get("dias_disponibles") == 12)
    check("rrhh ve saldo de un trabajador -> 200", client.get(f"/api/rrhh/vacaciones/{ids['emp@t.cl']}", headers=_auth(rrhh_token)).status_code == 200)
    check("empleado no ve saldo ajeno -> 403", client.get(f"/api/rrhh/vacaciones/{ids['emp2@t.cl']}", headers=_auth(emp_token)).status_code == 403)

    # 12b-2) Lista de saldos de TODOS los trabajadores (RRHH/Admin)
    r = client.get("/api/rrhh/vacaciones", headers=_auth(rrhh_token))
    lista_saldos = r.json() if r.status_code == 200 else []
    check("lista de saldos rrhh -> 200", r.status_code == 200)
    check("lista de saldos: emp con 3 usados / 12 disponibles", any(
        x.get("trabajador_id") == ids["emp@t.cl"] and x.get("dias_usados") == 3 and x.get("dias_disponibles") == 12
        for x in lista_saldos
    ))
    check("lista de saldos empleado -> 403", client.get("/api/rrhh/vacaciones", headers=_auth(emp_token)).status_code == 403)
    check("solicitud aprobada expone dias_habiles=3", any(
        s.get("dias_habiles") == 3 for s in client.get(f"/api/rrhh/mis-solicitudes/{ids['emp@t.cl']}", headers=_auth(emp_token)).json()
    ))

    # 12c) Adjunto (foto-documento) de la solicitud (Storage simulado)
    orig_sub = solicitudes_router.subir_objeto
    orig_url = solicitudes_router.url_firmada
    orig_del = solicitudes_router.eliminar_objeto
    try:
        solicitudes_router.subir_objeto = lambda ruta, datos, ct: None
        solicitudes_router.url_firmada = lambda ruta, expira_segundos=None: f"https://storage.test/firmada/{ruta}"
        solicitudes_router.eliminar_objeto = lambda ruta: None
        PNG_ADJ = b"\x89PNG\r\n\x1a\n" + b"0" * 120

        def _subir_adj(token, contenido=PNG_ADJ, nombre="doc.png"):
            return client.post(
                f"/api/rrhh/solicitudes/{sol_id}/adjunto",
                files={"archivo": (nombre, contenido, "image/png")},
                headers=_auth(token),
            )

        check("adjunto: dueño sube -> 201", _subir_adj(emp_token).status_code == 201)
        check("adjunto: archivo no-imagen -> 415", _subir_adj(emp_token, contenido=b"solo texto").status_code == 415)
        r = client.get(f"/api/rrhh/solicitudes/{sol_id}/adjunto", headers=_auth(emp_token))
        check("adjunto: URL firmada -> 200", r.status_code == 200 and str(r.json().get("url", "")).startswith("https://storage.test/firmada/solicitud_"))
        check("adjunto: solicitud marca tiene_adjunto", any(
            s.get("tiene_adjunto") for s in client.get(f"/api/rrhh/mis-solicitudes/{ids['emp@t.cl']}", headers=_auth(emp_token)).json()
        ))
        check("adjunto: otro empleado no gestiona -> 403", _subir_adj(emp2_token).status_code == 403)
        check("adjunto: rrhh puede verlo -> 200", client.get(f"/api/rrhh/solicitudes/{sol_id}/adjunto", headers=_auth(rrhh_token)).status_code == 200)
        check("adjunto: dueño elimina -> 204", client.delete(f"/api/rrhh/solicitudes/{sol_id}/adjunto", headers=_auth(emp_token)).status_code == 204)
        check("adjunto: tras eliminar, GET -> 404", client.get(f"/api/rrhh/solicitudes/{sol_id}/adjunto", headers=_auth(emp_token)).status_code == 404)
    finally:
        solicitudes_router.subir_objeto = orig_sub
        solicitudes_router.url_firmada = orig_url
        solicitudes_router.eliminar_objeto = orig_del

    # 13) Pedidos: crear (rrhh), empleado solo mueve los suyos
    ped = {"pedido": "Soporte", "estado": "pendiente", "encargado_id": ids["emp@t.cl"]}
    r = client.post("/api/pedidos", json=ped, headers=_auth(rrhh_token))
    ped_id = r.json().get("id") if r.status_code == 201 else None
    check("rrhh crea pedido -> 201", r.status_code == 201)
    check("empleado2 mueve pedido ajeno -> 403", client.patch(f"/api/pedidos/{ped_id}/estado", json={"estado": "en proceso"}, headers=_auth(emp2_token)).status_code == 403)
    check("empleado dueño mueve su pedido -> 200", client.patch(f"/api/pedidos/{ped_id}/estado", json={"estado": "en proceso"}, headers=_auth(emp_token)).status_code == 200)
    check("encargado no-empleado -> 400", client.post("/api/pedidos", json={"pedido": "Z", "encargado_id": ids["admin@t.cl"]}, headers=_auth(rrhh_token)).status_code == 400)

    # 13b) FOTOS de progreso (Storage simulado: sin red)
    PNG_FALSO = b"\x89PNG\r\n\x1a\n" + b"0" * 120
    subidas: list[str] = []

    orig_subir = pedidos_router.subir_objeto
    orig_firmar = pedidos_router.url_firmada
    orig_eliminar = pedidos_router.eliminar_objeto
    orig_max = settings.FOTO_MAX_POR_PEDIDO
    try:
        pedidos_router.subir_objeto = lambda ruta, datos, ct: subidas.append(ruta)
        pedidos_router.url_firmada = lambda ruta, expira_segundos=None: f"https://storage.test/firmada/{ruta}"
        pedidos_router.eliminar_objeto = lambda ruta: None
        settings.FOTO_MAX_POR_PEDIDO = 2

        def _subir(token, contenido=PNG_FALSO, nombre="avance.png", tipo="image/png"):
            return client.post(
                f"/api/pedidos/{ped_id}/fotos",
                files={"archivo": (nombre, contenido, tipo)},
                headers=_auth(token),
            )

        check("fotos sin token -> 401", client.get(f"/api/pedidos/{ped_id}/fotos").status_code == 401)
        check("empleado NO asignado ve fotos -> 403", client.get(f"/api/pedidos/{ped_id}/fotos", headers=_auth(emp2_token)).status_code == 403)

        r = _subir(emp_token)
        foto1 = r.json() if r.status_code == 201 else {}
        check("empleado asignado sube foto -> 201", r.status_code == 201)
        check("foto trae URL firmada", str(foto1.get("url", "")).startswith("https://storage.test/firmada/pedido_"))
        check("ruta generada por el servidor (uuid)", "avance" not in str(foto1.get("url", "")))

        check(
            "archivo que NO es imagen (magic bytes) -> 415",
            _subir(emp_token, contenido=b"solo texto plano, no imagen", nombre="malo.png").status_code == 415,
        )

        r = client.get(f"/api/pedidos/{ped_id}/fotos", headers=_auth(rrhh_token))
        check("rrhh ve fotos del pedido -> 200 con 1 visible", r.status_code == 200 and len(r.json()) == 1)

        check("segunda foto -> 201", _subir(emp_token).status_code == 201)
        check("tercera foto supera el límite -> 409", _subir(emp_token).status_code == 409)

        check("empleado NO asignado borra foto -> 403", client.delete(f"/api/pedidos/{ped_id}/fotos/{foto1['id']}", headers=_auth(emp2_token)).status_code == 403)
        check("dueño oculta su foto -> 204", client.delete(f"/api/pedidos/{ped_id}/fotos/{foto1['id']}", headers=_auth(emp_token)).status_code == 204)
        check("foto oculta ya no se lista", len(client.get(f"/api/pedidos/{ped_id}/fotos", headers=_auth(emp_token)).json()) == 1)
        check("ocultar dos veces -> 404", client.delete(f"/api/pedidos/{ped_id}/fotos/{foto1['id']}", headers=_auth(admin_token)).status_code == 404)

        # Resguardo: el registro sigue en la BD como 'oculta' (soft-delete real)
        from app.models import PedidoFoto
        db = TestingSession()
        try:
            oculta = db.query(PedidoFoto).filter(PedidoFoto.id == foto1["id"]).first()
            check("soft-delete: registro conservado con estado oculta", oculta is not None and oculta.estado == "oculta" and oculta.oculta_por is not None)
        finally:
            db.close()
    finally:
        pedidos_router.subir_objeto = orig_subir
        pedidos_router.url_firmada = orig_firmar
        pedidos_router.eliminar_objeto = orig_eliminar
        settings.FOTO_MAX_POR_PEDIDO = orig_max

    # 14) admin es superusuario: puede listar usuarios y crear admin
    check("admin lista usuarios -> 200", client.get("/api/rrhh/usuarios", headers=_auth(admin_token)).status_code == 200)
    check("admin crea admin -> 201", client.post("/api/rrhh/usuarios", json={"email": "a2@t.cl", "password": "Mq4#tY8rbz", "nombre": "A2", "rol": "admin", "estado": "activo"}, headers=_auth(admin_token)).status_code == 201)

    # 15) Token manipulado -> 401
    check("token invalido -> 401", client.get("/api/auth/me", headers=_auth(admin_token + "xx")).status_code == 401)

    # 16) Asistencia (Workera): guardas de rol + agregación (API simulada)
    original = asistencia_router.obtener_marcas
    try:
        asistencia_router.obtener_marcas = lambda **kw: list(MARCAS_FAKE)

        check("empleado ve asistencia -> 403", client.get("/api/rrhh/asistencia/historial", headers=_auth(emp_token)).status_code == 403)
        check("asistencia sin token -> 401", client.get("/api/rrhh/asistencia/historial").status_code == 401)

        r = client.get("/api/rrhh/asistencia/historial", headers=_auth(rrhh_token))
        cuerpo = r.json() if r.status_code == 200 else []
        erick = next((j for j in cuerpo if j.get("trabajador_id") == "11111111"), None)
        maria = next((j for j in cuerpo if j.get("trabajador_id") == "22222222"), None)
        check("rrhh ve asistencia -> 200", r.status_code == 200)
        # 9.5 h brutas - 2 h de colación = 7.5 h netas
        check("jornada neto con colación (7.5 h)", erick is not None and erick.get("horas_trabajadas") == 7.5)
        check("jornada expone horas_brutas (9.5 h)", erick is not None and erick.get("horas_brutas") == 9.5)
        check("jornada sin salida -> horas None (en curso)", maria is not None and maria.get("horas_trabajadas") is None)

        check("rango de fechas invertido -> 400", client.get("/api/rrhh/asistencia/historial?desde=2026-07-10&hasta=2026-07-01", headers=_auth(rrhh_token)).status_code == 400)

        # Reporte mensual (mismas marcas simuladas de junio 2026)
        r = client.get("/api/rrhh/asistencia/reporte?anio=2026&mes=6", headers=_auth(rrhh_token))
        rep = r.json() if r.status_code == 200 else []
        erick_rep = next((x for x in rep if str(x.get("trabajador_id")) == "11111111"), None)
        maria_rep = next((x for x in rep if str(x.get("trabajador_id")) == "22222222"), None)
        check("reporte mensual rrhh -> 200", r.status_code == 200)
        check("reporte: Erick 1 día asistido", erick_rep is not None and erick_rep.get("dias_asistidos") == 1)
        check("reporte: Erick horas netas 7.5", erick_rep is not None and erick_rep.get("horas_trabajadas") == 7.5)
        check("reporte: Maria jornada incompleta (sin salida)", maria_rep is not None and maria_rep.get("jornadas_incompletas") == 1)
        check("reporte: empleado -> 403", client.get("/api/rrhh/asistencia/reporte?anio=2026&mes=6", headers=_auth(emp_token)).status_code == 403)
        check("reporte: mes inválido -> 422", client.get("/api/rrhh/asistencia/reporte?anio=2026&mes=13", headers=_auth(rrhh_token)).status_code == 422)

        def _sin_config(**kw):
            raise WorkeraNoConfigurado("Falta configurar Workera")

        asistencia_router.obtener_marcas = _sin_config
        check("workera sin configurar -> 503", client.get("/api/rrhh/asistencia/historial", headers=_auth(rrhh_token)).status_code == 503)
    finally:
        asistencia_router.obtener_marcas = original

    # 17) Rate limit de login: al 6º intento fallido responde 429
    for _ in range(5):
        _login("bruto@t.cl", "clave-mala")
    check("fuerza bruta en login -> 429", _login("bruto@t.cl", "clave-mala").status_code == 429)

    # 18) Privacidad (Ley 21.719): transparencia + acceso/portabilidad
    check("politica sin token -> 401", client.get("/api/privacidad/politica").status_code == 401)
    r = client.get("/api/privacidad/politica", headers=_auth(emp_token))
    check("politica con token -> 200 + responsable", r.status_code == 200 and "responsable" in r.json())

    r = client.get("/api/privacidad/mis-datos", headers=_auth(emp_token))
    cuerpo = r.json() if r.status_code == 200 else {}
    check("mis-datos -> 200", r.status_code == 200)
    check("mis-datos trae la cuenta propia", cuerpo.get("cuenta", {}).get("email") == "emp@t.cl")
    check("mis-datos no expone password", "password" not in cuerpo.get("cuenta", {}))
    check(
        "mis-datos incluye solicitudes propias",
        isinstance(cuerpo.get("solicitudes_dias_libres"), list)
        and len(cuerpo["solicitudes_dias_libres"]) >= 1,
    )

    # 19) Anonimización (derecho de supresión compatible con retención)
    check("rrhh anonimiza -> 403", client.post(f"/api/rrhh/usuarios/{ids['emp2@t.cl']}/anonimizar", headers=_auth(rrhh_token)).status_code == 403)
    check("admin se anonimiza a sí mismo -> 400", client.post(f"/api/rrhh/usuarios/{ids['admin@t.cl']}/anonimizar", headers=_auth(admin_token)).status_code == 400)
    r = client.post(f"/api/rrhh/usuarios/{ids['emp2@t.cl']}/anonimizar", headers=_auth(admin_token))
    check("admin anonimiza empleado -> 200", r.status_code == 200)
    check("anonimizado: email seudónimo", r.json().get("email", "").startswith("anonimizado."))
    check("anonimizado: cuenta inactiva", r.json().get("estado") == "inactivo")
    check("anonimizado no puede iniciar sesión", _login("emp2@t.cl", "Emp123*").status_code == 401)

    # 20) Validación estricta del parámetro que viaja a Workera (anti-injection)
    check(
        "empleados con caracteres de inyección -> 422",
        client.get(
            "/api/rrhh/asistencia/historial?empleados=1;drop%20table",
            headers=_auth(rrhh_token),
        ).status_code == 422,
    )

    # 21) Headers de seguridad presentes en respuestas de la API
    h = client.get("/api/auth/me", headers=_auth(emp_token)).headers
    check("header X-Content-Type-Options=nosniff", h.get("x-content-type-options") == "nosniff")
    check("header X-Frame-Options=DENY", h.get("x-frame-options") == "DENY")
    check("header Cache-Control=no-store en /api", h.get("cache-control") == "no-store")
    check("header Content-Security-Policy en /api", "default-src 'none'" in (h.get("content-security-policy") or ""))
    check("header Strict-Transport-Security presente", "max-age=" in (h.get("strict-transport-security") or ""))
    check("header Permissions-Policy presente", "camera=()" in (h.get("permissions-policy") or ""))

    # 22) Inyección de fórmulas en CSV (CWE-1236): el nombre de máquina malicioso
    #     se neutraliza con un apóstrofo al exportar.
    client.post(
        "/api/iot/metricas",
        json={"maquina": "=SUM(A1:A9)", "temperatura": 20.0, "humedad": 50.0, "consumo_kw": 1.0},
        headers=_auth(admin_token),
    )
    csv_texto = client.get("/api/iot/exportar_csv", headers=_auth(admin_token)).text
    check("CSV neutraliza fórmula con apóstrofo", "'=SUM(A1:A9)" in csv_texto)
    check("CSV no deja la fórmula sin neutralizar", ",=SUM(A1:A9)" not in csv_texto)

    # 23b) CLIENTES: CRUD con contactos/entidades anidados (solo RRHH/Admin)
    check("clientes: empleado -> 403", client.get("/api/clientes", headers=_auth(emp_token)).status_code == 403)
    check("clientes: sin token -> 401", client.get("/api/clientes").status_code == 401)

    cliente_nuevo = {
        "nombre": "AGRICOLA DE PRUEBA LTDA",
        "email": "prueba@agricola.cl",
        "fecha_ingreso": "2026-01-15",
        "contactos": [
            {"nombre": "Juan Pagos", "telefono": "987654321", "nota": "pagos"},
            {"nombre": "Ana Terreno", "telefono": "+56 9 1234-5678"},
        ],
        "entidades": [{"rut": "76.358.680-4", "nombre": "Matriz"}],
    }
    r = client.post("/api/clientes", json=cliente_nuevo, headers=_auth(rrhh_token))
    cli = r.json() if r.status_code == 201 else {}
    check("clientes: rrhh crea -> 201", r.status_code == 201)
    check("clientes: contactos anidados guardados", len(cli.get("contactos", [])) == 2)
    check("clientes: RUT normalizado", cli.get("entidades", [{}])[0].get("rut") == "76.358.680-4")

    check("clientes: RUT sin puntos se normaliza", client.post(
        "/api/clientes",
        json={"nombre": "CLIENTE RUT PLANO", "entidades": [{"rut": "76358680-4"}]},
        headers=_auth(rrhh_token),
    ).json().get("entidades", [{}])[0].get("rut") == "76.358.680-4")

    check("clientes: RUT con DV malo -> 422", client.post(
        "/api/clientes",
        json={"nombre": "CLIENTE RUT MALO", "entidades": [{"rut": "76.358.680-5"}]},
        headers=_auth(rrhh_token),
    ).status_code == 422)
    check("clientes: teléfono inválido -> 422", client.post(
        "/api/clientes",
        json={"nombre": "CLIENTE TEL MALO", "contactos": [{"telefono": "no-es-fono!"}]},
        headers=_auth(rrhh_token),
    ).status_code == 422)
    check("clientes: nombre duplicado -> 409", client.post(
        "/api/clientes",
        json={"nombre": "agricola de prueba ltda"},
        headers=_auth(rrhh_token),
    ).status_code == 409)

    r = client.get("/api/clientes?buscar=76.358.680", headers=_auth(rrhh_token))
    check("clientes: buscar por RUT encuentra", r.status_code == 200 and any(
        c["nombre"] == "AGRICOLA DE PRUEBA LTDA" for c in r.json()
    ))

    r = client.put(
        f"/api/clientes/{cli['id']}",
        json={"contactos": [{"nombre": "Solo Uno", "telefono": "911112222"}]},
        headers=_auth(rrhh_token),
    )
    check("clientes: editar reemplaza contactos", r.status_code == 200 and len(r.json()["contactos"]) == 1)

    check("clientes: deshabilitar -> 200", client.post(
        f"/api/clientes/{cli['id']}/deshabilitar", headers=_auth(rrhh_token)
    ).status_code == 200)
    check("clientes: deshabilitado fuera del resumen", all(
        c["id"] != cli["id"]
        for c in client.get("/api/clientes/resumen", headers=_auth(rrhh_token)).json()
    ))
    client.post(f"/api/clientes/{cli['id']}/habilitar", headers=_auth(rrhh_token))

    # 23c) TRABAJOS: registro por cliente (solo RRHH/Admin; DELETE solo admin)
    check("trabajos: empleado -> 403", client.get("/api/trabajos", headers=_auth(emp_token)).status_code == 403)

    trabajo_nuevo = {
        "cliente_id": cli["id"],
        "fecha": "2026-07-01",
        "hora": "10:30:00",
        "valor": 48000,
        "detalle": "Soldar oreja a tiro de carro",
    }
    r = client.post("/api/trabajos", json=trabajo_nuevo, headers=_auth(rrhh_token))
    tra = r.json() if r.status_code == 201 else {}
    check("trabajos: rrhh crea -> 201", r.status_code == 201)
    check("trabajos: trae nombre del cliente", tra.get("cliente_nombre") == "AGRICOLA DE PRUEBA LTDA")
    check("trabajos: cliente inexistente -> 404", client.post(
        "/api/trabajos",
        json={**trabajo_nuevo, "cliente_id": 999999},
        headers=_auth(rrhh_token),
    ).status_code == 404)
    check("trabajos: valor negativo -> 422", client.post(
        "/api/trabajos",
        json={**trabajo_nuevo, "valor": -5},
        headers=_auth(rrhh_token),
    ).status_code == 422)

    r = client.get(f"/api/trabajos?cliente_id={cli['id']}", headers=_auth(rrhh_token))
    check("trabajos: filtro por cliente", r.status_code == 200 and len(r.json()) == 1)
    r = client.get("/api/trabajos?buscar=oreja", headers=_auth(rrhh_token))
    check("trabajos: búsqueda por detalle", r.status_code == 200 and len(r.json()) == 1)

    r = client.put(
        f"/api/trabajos/{tra['id']}",
        json={"estado": "En proceso", "valor": 50000},
        headers=_auth(rrhh_token),
    )
    check("trabajos: editar -> 200", r.status_code == 200 and r.json()["valor"] == 50000)

    check("trabajos: rrhh NO elimina -> 403", client.delete(
        f"/api/trabajos/{tra['id']}", headers=_auth(rrhh_token)
    ).status_code == 403)
    check("trabajos: admin elimina -> 204", client.delete(
        f"/api/trabajos/{tra['id']}", headers=_auth(admin_token)
    ).status_code == 204)

    # 23d) FACTURAS (pagos pendientes): híbrido cliente_id/cliente_texto
    check("facturas: empleado -> 403", client.get("/api/facturas", headers=_auth(emp_token)).status_code == 403)
    check("facturas: sin token -> 401", client.get("/api/facturas").status_code == 401)

    # Sin cliente_id NI texto -> 422 (regla del híbrido)
    check("facturas: sin cliente ni texto -> 422", client.post(
        "/api/facturas", json={"numero": 100, "monto": 5000},
        headers=_auth(rrhh_token),
    ).status_code == 422)

    # Solo texto libre (cliente que no está en la cartera) -> 201 sin vínculo
    r = client.post(
        "/api/facturas",
        json={"cliente_texto": "COPEVAL", "numero": 1932, "monto": 77350, "fecha_emision": "2025-01-07"},
        headers=_auth(rrhh_token),
    )
    fac_libre = r.json() if r.status_code == 201 else {}
    check("facturas: solo texto -> 201", r.status_code == 201)
    check("facturas: sin vínculo queda cliente_id null", fac_libre.get("cliente_id") is None)

    # Vinculada a cliente real: hereda el nombre como texto
    r = client.post(
        "/api/facturas",
        json={"cliente_id": cli["id"], "numero": 2000, "monto": 130900, "fecha_emision": "2026-06-01"},
        headers=_auth(rrhh_token),
    )
    fac_vinc = r.json() if r.status_code == 201 else {}
    check("facturas: vinculada -> 201 con nombre", fac_vinc.get("cliente_nombre") == "AGRICOLA DE PRUEBA LTDA")
    check("facturas: texto heredado del cliente", fac_vinc.get("cliente_texto") == "AGRICOLA DE PRUEBA LTDA")
    check("facturas: cliente inexistente -> 404", client.post(
        "/api/facturas", json={"cliente_id": 999999, "monto": 100},
        headers=_auth(rrhh_token),
    ).status_code == 404)
    check("facturas: monto negativo -> 422", client.post(
        "/api/facturas", json={"cliente_texto": "X", "monto": -1},
        headers=_auth(rrhh_token),
    ).status_code == 422)

    # Filtros: solo_sin_vincular y búsqueda por número
    r = client.get("/api/facturas?solo_sin_vincular=true", headers=_auth(rrhh_token))
    check("facturas: filtro sin vincular", r.status_code == 200 and all(
        f["cliente_id"] is None for f in r.json()
    ) and len(r.json()) >= 1)
    r = client.get("/api/facturas?buscar=1932", headers=_auth(rrhh_token))
    check("facturas: búsqueda por número", r.status_code == 200 and any(
        f["numero"] == 1932 for f in r.json()
    ))

    # Vincular después (PUT) la factura de texto libre al cliente real
    r = client.put(
        f"/api/facturas/{fac_libre['id']}",
        json={"cliente_id": cli["id"]},
        headers=_auth(rrhh_token),
    )
    check("facturas: vincular después -> 200", r.status_code == 200 and r.json()["cliente_nombre"] == "AGRICOLA DE PRUEBA LTDA")
    check("facturas: texto original se conserva", r.json()["cliente_texto"] == "COPEVAL")

    # Pagar / reabrir
    r = client.post(f"/api/facturas/{fac_vinc['id']}/pagar", headers=_auth(rrhh_token))
    check("facturas: pagar -> 200 con fecha", r.status_code == 200 and r.json()["estado"] == "pagada" and r.json()["pagada_en"] is not None)
    check("facturas: pagar dos veces -> 409", client.post(
        f"/api/facturas/{fac_vinc['id']}/pagar", headers=_auth(rrhh_token)
    ).status_code == 409)
    r = client.get("/api/facturas?estado=pendiente", headers=_auth(rrhh_token))
    check("facturas: pagada sale de pendientes", all(f["id"] != fac_vinc["id"] for f in r.json()))
    r = client.post(f"/api/facturas/{fac_vinc['id']}/reabrir", headers=_auth(rrhh_token))
    check("facturas: reabrir -> 200 pendiente", r.status_code == 200 and r.json()["estado"] == "pendiente" and r.json()["pagada_en"] is None)

    # Eliminar: solo admin
    check("facturas: rrhh NO elimina -> 403", client.delete(
        f"/api/facturas/{fac_libre['id']}", headers=_auth(rrhh_token)
    ).status_code == 403)
    check("facturas: admin elimina -> 204", client.delete(
        f"/api/facturas/{fac_libre['id']}", headers=_auth(admin_token)
    ).status_code == 204)
    client.delete(f"/api/facturas/{fac_vinc['id']}", headers=_auth(admin_token))

    # 23e) CIERRE COMERCIAL DEL PEDIDO: el encargado lo deja 'terminado' y
    #      RRHH lo deriva -> 'pagado' crea un Trabajo realizado; 'pendiente'
    #      crea una Factura por cobrar. Se cierra UNA sola vez y queda congelado.
    def _pedido_terminado(cliente_id=None):
        cuerpo = {
            "pedido": "Torneado de eje",
            "descripcion": "Eje 40 mm",
            "valor": 90000,
            "encargado_id": ids["emp@t.cl"],
        }
        if cliente_id is not None:
            cuerpo["cliente_id"] = cliente_id
        pid = client.post("/api/pedidos", json=cuerpo, headers=_auth(rrhh_token)).json()["id"]
        # El propio encargado lo marca como terminado (flujo real).
        client.patch(
            f"/api/pedidos/{pid}/estado",
            json={"estado": "terminado"},
            headers=_auth(emp_token),
        )
        return pid

    r = client.post(
        "/api/pedidos",
        json={"pedido": "Con cliente", "cliente_id": cli["id"]},
        headers=_auth(rrhh_token),
    )
    ped_cli_id = r.json().get("id") if r.status_code == 201 else None
    check("pedidos: crear con cliente -> 201 con nombre",
          r.status_code == 201 and r.json().get("cliente_nombre") == "AGRICOLA DE PRUEBA LTDA")
    check("pedidos: cliente inexistente -> 404", client.post(
        "/api/pedidos", json={"pedido": "X", "cliente_id": 999999}, headers=_auth(rrhh_token),
    ).status_code == 404)

    check("cierre: pedido no terminado -> 409", client.post(
        f"/api/pedidos/{ped_cli_id}/cerrar", json={"tipo": "pagado"}, headers=_auth(rrhh_token),
    ).status_code == 409)

    ped_sin_cli = _pedido_terminado()
    check("cierre: sin cliente asignado -> 400", client.post(
        f"/api/pedidos/{ped_sin_cli}/cerrar", json={"tipo": "pagado"}, headers=_auth(rrhh_token),
    ).status_code == 400)

    # --- Cierre PAGADO -> Trabajo realizado ---
    ped_pagado = _pedido_terminado(cli["id"])
    check("cierre: empleado NO cierra -> 403", client.post(
        f"/api/pedidos/{ped_pagado}/cerrar", json={"tipo": "pagado"}, headers=_auth(emp_token),
    ).status_code == 403)
    r = client.post(
        f"/api/pedidos/{ped_pagado}/cerrar",
        json={"tipo": "pagado", "fecha": "2026-07-20"},
        headers=_auth(rrhh_token),
    )
    cerrado = r.json() if r.status_code == 200 else {}
    check("cierre pagado -> 200", r.status_code == 200)
    check("cierre pagado marca tipo y fecha",
          cerrado.get("cierre_tipo") == "pagado" and cerrado.get("cerrado_en") is not None)
    check("cierre pagado enlaza trabajo (no factura)",
          cerrado.get("trabajo_id") is not None and cerrado.get("factura_id") is None)
    trabajos_cli = client.get(
        f"/api/trabajos?cliente_id={cli['id']}", headers=_auth(rrhh_token)
    ).json()
    check("cierre pagado crea el trabajo con el valor del pedido", any(
        t["id"] == cerrado.get("trabajo_id") and t["valor"] == 90000
        and t["estado"] == "Finalizado" for t in trabajos_cli
    ))

    check("cierre: cerrar dos veces -> 409", client.post(
        f"/api/pedidos/{ped_pagado}/cerrar", json={"tipo": "pendiente"}, headers=_auth(rrhh_token),
    ).status_code == 409)
    check("cierre: pedido cerrado no cambia de estado -> 409", client.patch(
        f"/api/pedidos/{ped_pagado}/estado", json={"estado": "en proceso"},
        headers=_auth(rrhh_token),
    ).status_code == 409)
    check("cierre: pedido cerrado no cambia de cliente -> 409", client.put(
        f"/api/pedidos/{ped_pagado}", json={"cliente_id": 999999}, headers=_auth(rrhh_token),
    ).status_code == 409)
    check("cierre: pedido cerrado sí admite corregir texto -> 200", client.put(
        f"/api/pedidos/{ped_pagado}", json={"descripcion": "texto corregido"},
        headers=_auth(rrhh_token),
    ).status_code == 200)

    # --- Cierre PENDIENTE -> Factura por cobrar ---
    ped_cobrar = _pedido_terminado(cli["id"])
    r = client.post(
        f"/api/pedidos/{ped_cobrar}/cerrar",
        json={"tipo": "pendiente", "numero": 3050, "valor": 120000, "nota": "30 días"},
        headers=_auth(rrhh_token),
    )
    cobrar = r.json() if r.status_code == 200 else {}
    check("cierre pendiente -> 200", r.status_code == 200)
    check("cierre pendiente enlaza factura (no trabajo)",
          cobrar.get("factura_id") is not None and cobrar.get("trabajo_id") is None)
    pendientes_f = client.get("/api/facturas?estado=pendiente", headers=_auth(rrhh_token)).json()
    check("cierre pendiente crea la factura por cobrar", any(
        f["id"] == cobrar.get("factura_id") and f["numero"] == 3050
        and f["monto"] == 120000 and f["cliente_id"] == cli["id"] for f in pendientes_f
    ))

    # --- Corregir el cobro: pagado <-> pendiente, manteniendo el pedido ---
    # El pedido cerrado como PAGADO pasa a por cobrar: se borra el trabajo,
    # nace una factura y el pedido queda marcado 'pendiente'.
    r = client.post(
        f"/api/trabajos/{cerrado.get('trabajo_id')}/a-pendiente",
        headers=_auth(rrhh_token),
    )
    fac_conv = r.json() if r.status_code == 201 else {}
    check("convertir: trabajo -> pendiente 201", r.status_code == 201)
    check("convertir: la factura hereda cliente y monto",
          fac_conv.get("cliente_id") == cli["id"] and fac_conv.get("monto") == 90000
          and fac_conv.get("estado") == "pendiente")
    check("convertir: el trabajo original desaparece", all(
        t["id"] != cerrado.get("trabajo_id")
        for t in client.get(f"/api/trabajos?cliente_id={cli['id']}", headers=_auth(rrhh_token)).json()
    ))
    ped_tras = [
        p for p in client.get("/api/pedidos", headers=_auth(rrhh_token)).json()
        if p["id"] == ped_pagado
    ][0]
    check("convertir: el pedido queda 'pendiente' y apunta a la factura",
          ped_tras["cierre_tipo"] == "pendiente"
          and ped_tras["factura_id"] == fac_conv.get("id")
          and ped_tras["trabajo_id"] is None)

    # Y de vuelta: la factura se da por pagada y regresa a trabajos.
    r = client.post(
        f"/api/facturas/{fac_conv.get('id')}/a-trabajo", headers=_auth(rrhh_token)
    )
    tra_conv = r.json() if r.status_code == 201 else {}
    check("convertir: factura -> trabajo 201", r.status_code == 201)
    check("convertir: el trabajo hereda cliente y valor",
          tra_conv.get("cliente_id") == cli["id"] and tra_conv.get("valor") == 90000)
    ped_tras2 = [
        p for p in client.get("/api/pedidos", headers=_auth(rrhh_token)).json()
        if p["id"] == ped_pagado
    ][0]
    check("convertir: el pedido vuelve a 'pagado'",
          ped_tras2["cierre_tipo"] == "pagado"
          and ped_tras2["trabajo_id"] == tra_conv.get("id")
          and ped_tras2["factura_id"] is None)
    check("convertir: empleado no puede -> 403", client.post(
        f"/api/trabajos/{tra_conv.get('id')}/a-pendiente", headers=_auth(emp_token)
    ).status_code == 403)
    check("convertir: trabajo inexistente -> 404", client.post(
        "/api/trabajos/999999/a-pendiente", headers=_auth(rrhh_token)
    ).status_code == 404)

    # Una factura sin cliente vinculado no puede pasar a trabajos (FK NOT NULL).
    fac_suelta = client.post(
        "/api/facturas", json={"cliente_texto": "CLIENTE SUELTO", "monto": 1000},
        headers=_auth(rrhh_token),
    ).json()
    check("convertir: factura sin cliente -> 400", client.post(
        f"/api/facturas/{fac_suelta['id']}/a-trabajo", headers=_auth(rrhh_token)
    ).status_code == 400)
    client.delete(f"/api/facturas/{fac_suelta['id']}", headers=_auth(admin_token))

    # Un cliente dado de baja no se puede asignar a pedidos nuevos.
    client.post(f"/api/clientes/{cli['id']}/deshabilitar", headers=_auth(rrhh_token))
    check("pedidos: cliente deshabilitado -> 400", client.post(
        "/api/pedidos", json={"pedido": "Y", "cliente_id": cli["id"]}, headers=_auth(rrhh_token),
    ).status_code == 400)
    client.post(f"/api/clientes/{cli['id']}/habilitar", headers=_auth(rrhh_token))

    # 24) Visor de auditoría. En SQLite no hay triggers, así que insertamos una
    #     fila directa para verificar lectura, filtro y guardas de rol.
    from datetime import datetime, timezone
    from app.models import Auditoria
    dbx = TestingSession()
    try:
        dbx.add(Auditoria(
            tabla="users", operacion="UPDATE", registro_id="1",
            actor_app="1|admin@t.cl",
            datos_antes={"nombre": "Antes"}, datos_despues={"nombre": "Despues"},
            ocurrido_en=datetime.now(timezone.utc),
        ))
        dbx.commit()
    finally:
        dbx.close()

    r = client.get("/api/auditoria", headers=_auth(admin_token))
    aud = r.json() if r.status_code == 200 else []
    check("auditoría admin -> 200", r.status_code == 200)
    check("auditoría lista el cambio (actor_app)", any(
        a.get("tabla") == "users" and a.get("actor_app") == "1|admin@t.cl" for a in aud
    ))
    check("auditoría expone datos_antes/después", any(
        a.get("datos_despues", {}).get("nombre") == "Despues" for a in aud
    ))
    check("auditoría rrhh -> 200", client.get("/api/auditoria", headers=_auth(rrhh_token)).status_code == 200)
    check("auditoría empleado -> 403", client.get("/api/auditoria", headers=_auth(emp_token)).status_code == 403)
    check("auditoría sin token -> 401", client.get("/api/auditoria").status_code == 401)
    check("auditoría filtro por tabla", all(
        a.get("tabla") == "users"
        for a in client.get("/api/auditoria?tabla=users", headers=_auth(admin_token)).json()
    ))

    # Resumen
    ok = sum(1 for _, c in CHECKS if c)
    total = len(CHECKS)
    print("\n================ RESULTADOS ================")
    for nombre, c in CHECKS:
        print(f"  [{'PASS' if c else 'FAIL'}] {nombre}")
    print(f"============================================\n{ok}/{total} checks OK")
    return ok == total


if __name__ == "__main__":
    sys.exit(0 if run() else 1)
