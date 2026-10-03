#!/usr/bin/env bash
# Arranca Playbook Studio: revisa Node, crea .env, pregunta qué IA escribe (y su clave) si falta, instala, ofrece
# instalar ffmpeg (render final de los explicativos) y abre la app.
# Uso: bash iniciar.sh            (bash iniciar.sh --ia para cambiar de IA)
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

# 3. Qué IA escribe. Se pregunta si todavía no hay ninguna clave, o con: bash iniciar.sh --ia
has_key() { grep -Eq "^$1=.+" .env; }
# Escribe NOMBRE=valor en .env: reemplaza la línea (aunque esté comentada con "# ") o la agrega al final.
set_var() {
  NAME="$1" VALUE="$2" awk '
    $0 ~ "^(# )?" ENVIRON["NAME"] "=" { if (!done) print ENVIRON["NAME"] "=" ENVIRON["VALUE"]; done = 1; next }
    { print }
    END { if (!done) print ENVIRON["NAME"] "=" ENVIRON["VALUE"] }
  ' .env > .env.tmp
  mv .env.tmp .env
  chmod 600 .env
}
ask_key() {
  echo "Pegá la clave de $1 y apretá Enter (no se ve mientras la pegás)."
  read -rs key
  echo
  if [ -z "$key" ]; then
    echo "Sin clave: la app arranca en modo de muestra."
    return 1
  fi
  set_var "$2" "$key"
  echo "Guardé la clave en .env."
}
ask_model() {
  read -rp "Modelo [$1]: " model
  set_var KIMI_MODEL "${model:-$1}"
}

if [ "${1:-}" = "--ia" ] || { ! has_key KIMI_API_KEY && ! has_key ANTHROPIC_API_KEY; }; then
  echo
  echo "¿Qué IA escribe las historias?"
  echo "  1) Claude (Anthropic)"
  echo "  2) Kimi directo (Moonshot)"
  echo "  3) Kimi por NVIDIA"
  echo "  4) Kimi por OpenRouter"
  echo "  5) Ninguna por ahora (modo de muestra)"
  read -rp "Elegí un número: " choice
  case "$choice" in
    1)
      ask_key "Claude" ANTHROPIC_API_KEY && set_var LLM_PROVIDER claude
      ;;
    2)
      if ask_key "Kimi (Moonshot)" KIMI_API_KEY; then
        set_var LLM_PROVIDER kimi
        set_var KIMI_BASE_URL https://api.moonshot.ai/v1
        ask_model kimi-k3
      fi
      ;;
    3)
      echo "En NVIDIA, la clave es solo el texto que empieza con nvapi- (no todo el JSON)."
      if ask_key "NVIDIA" KIMI_API_KEY; then
        set_var LLM_PROVIDER kimi
        set_var KIMI_BASE_URL https://integrate.api.nvidia.com/v1
        ask_model moonshotai/kimi-k3
      fi
      ;;
    4)
      echo "En OpenRouter la clave empieza con sk-or-. Revisá el nombre exacto del modelo en openrouter.ai/models."
      if ask_key "OpenRouter" KIMI_API_KEY; then
        set_var LLM_PROVIDER kimi
        set_var KIMI_BASE_URL https://openrouter.ai/api/v1
        ask_model moonshotai/kimi-k3
      fi
      ;;
    *)
      echo "Modo de muestra. Para elegir después: bash iniciar.sh --ia"
      ;;
  esac
fi

# 4. Dependencias (solo la primera vez o si cambiaron).
if [ ! -d node_modules ] || [ package.json -nt node_modules ] || { [ -f package-lock.json ] && [ package-lock.json -nt node_modules ]; }; then
  echo "Instalando dependencias…"
  npm install
  touch node_modules
fi

# 5. ffmpeg, para el render final de los explicativos (H.264, CRF 16). Sin él, todo lo demás anda igual.
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo
  echo "No encontré ffmpeg. Hace falta solo para el render final de los explicativos."
  if command -v brew >/dev/null 2>&1; then
    read -rp "¿Lo instalo con Homebrew? [s/N]: " yes
    if [ "$yes" = "s" ] || [ "$yes" = "S" ]; then
      brew install ffmpeg
    fi
  else
    echo "Instalalo con: brew install ffmpeg (Mac) o sudo apt install ffmpeg (Linux)."
  fi
fi

# 6. Arrancar.
echo
echo "Abrí http://localhost:5173 en Chrome. Para cortar: Ctrl+C."
echo
npm run dev
