# scripts/_bootstrap.py
"""
Permite ejecutar los scripts directamente (python scripts/seed.py) agregando
la carpeta backend/ al sys.path para que `import app` funcione.
"""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
