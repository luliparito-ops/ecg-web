#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then npm install; fi
npm test
npm run build
echo "Sitio estático generado en dist."
