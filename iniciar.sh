#!/usr/bin/env bash
# Arranca Playbook Studio: revisa Node, crea .env, pide la clave de Kimi si falta, instala y abre la app.
# Uso: bash iniciar.sh
set -euo pipefail
cd "$(dirname "$0")"

# 1. Node 22.12 o más nuevo.
if ! command -v node >/dev/null 2>&1; then
  echo "No encontré Node. Instalalo con:"
  echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash"
  echo "  source ~/.bashrc && nvm install 22"
  exit 1
fi
version=$(node -p 'process.versions.node')
major=${version%%.*}
minor=$(echo "$version" | cut -d. -f2)
if [ "$major" -lt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -lt 12 ]; }; then
  echo "Tenés Node $version y hace falta 22.12 o más nuevo. Actualizalo con: nvm install 22"
  exit 1
fi

# 2. El archivo .env (nunca se sube a GitHub).
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Creé el archivo .env."
fi

# 3. La clave: si no hay ninguna, pedir la de Kimi.
has_key() { grep -Eq "^$1=.+" .env; }
if ! has_key KIMI_API_KEY && ! has_key ANTHROPIC_API_KEY; then
  echo
  echo "Pegá tu clave de Kimi y apretá Enter (no se ve mientras la pegás)."
  echo "Si la dejás vacía, la app arranca en modo de muestra."
  read -rs key
  echo
  if [ -n "$key" ]; then
    KEY="$key" awk '/^KIMI_API_KEY=/ { print "KIMI_API_KEY=" ENVIRON["KEY"]; done = 1; next } { print } END { if (!done) print "KIMI_API_KEY=" ENVIRON["KEY"] }' .env > .env.tmp
    mv .env.tmp .env
    chmod 600 .env
    echo "Guardé la clave en .env."
  fi
fi

# 4. Dependencias (solo la primera vez o si cambiaron).
if [ ! -d node_modules ] || [ package.json -nt node_modules ] || { [ -f package-lock.json ] && [ package-lock.json -nt node_modules ]; }; then
  echo "Instalando dependencias…"
  npm install
  touch node_modules
fi

# 5. Arrancar.
echo
echo "Abrí http://localhost:5173 en Chrome. Para cortar: Ctrl+C."
echo
npm run dev
