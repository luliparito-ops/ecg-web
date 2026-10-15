#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
trap 's=$?; if [ "$s" -ne 0 ]; then echo "Error. Copiá el mensaje anterior para revisarlo."; read -r -p "Enter para cerrar..." _; fi' EXIT
if ! command -v npm >/dev/null 2>&1; then
 echo "Falta Node.js. Instalá Node.js LTS (22 o posterior) y volvé a ejecutar este archivo."
 exit 1
fi
if [ ! -d node_modules ]; then npm install; fi
npm run dev -- --open
