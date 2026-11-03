#!/usr/bin/env bash
# Exporta el estado local de Playbook Studio (lo que git no versiona) a un zip con rutas relativas a la raíz del repo.
# Uso: bash scripts/sync-estado.sh [carpeta_salida]   (por defecto ./sync)
# Para importar: descomprimir el zip dentro de la carpeta marketing, pisando las mismas rutas.
# Nunca incluye .env, node_modules ni claves.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-sync}"
FECHA="$(date +%F)"
ZIP="$OUT/playbook-estado-$FECHA.zip"
mkdir -p "$OUT"
rm -f "$ZIP"

# Carpetas ignoradas por git que guardan estado de la app, más las series y herramientas modificadas o sin versionar.
CANDIDATOS=(biblioteca proyectos publicidad)
LISTA=()
for d in "${CANDIDATOS[@]}"; do [ -e "$d" ] && LISTA+=("$d"); done
# Archivos modificados o sin seguimiento en el repo (series editadas, herramientas nuevas), salvo .env y node_modules.
while IFS= read -r f; do
  case "$f" in .env*|node_modules*|*/node_modules/*) continue;; esac
  LISTA+=("$f")
done < <(git ls-files --modified --others --exclude-standard)

if command -v zip >/dev/null 2>&1; then
  zip -r -q "$ZIP" "${LISTA[@]}" -x '*/node_modules/*' '.env' '.env.*' '*.key' '*.log'
else
  # Sin el comando zip (p. ej. Windows con Git Bash): usa Python.
  PY=python3; command -v python3 >/dev/null 2>&1 || PY=python
  "$PY" - "$ZIP" "${LISTA[@]}" <<'PYEOF'
import os, sys, zipfile
zp, items = sys.argv[1], sys.argv[2:]
bad = lambda n: n == ".env" or n.startswith(".env.") or n.endswith((".key", ".log")) or "node_modules" in n.split("/")
with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
    for it in items:
        if os.path.isdir(it):
            for r, _, fs in os.walk(it):
                for f in fs:
                    n = os.path.join(r, f).replace(os.sep, "/")
                    if not bad(n): z.write(n, n)
        elif not bad(it):
            z.write(it, it)
PYEOF
fi
echo "Listo: $ZIP"
unzip -l "$ZIP" | tail -1
