# app/services/imagenes.py
"""
Validación de imágenes por MAGIC BYTES (dominio puro, sin I/O).

El Content-Type que declara el cliente es falsificable; el contenido real
no. Solo se aceptan los formatos del bucket: JPEG, PNG y WebP.
"""

TIPOS_PERMITIDOS = ("image/jpeg", "image/png", "image/webp")

_EXTENSION = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def detectar_tipo_imagen(datos: bytes) -> str | None:
    """Devuelve el MIME real según la firma binaria, o None si no es válido."""
    if len(datos) < 12:
        return None
    if datos[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if datos[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if datos[:4] == b"RIFF" and datos[8:12] == b"WEBP":
        return "image/webp"
    return None


def extension_para(content_type: str) -> str:
    return _EXTENSION[content_type]
