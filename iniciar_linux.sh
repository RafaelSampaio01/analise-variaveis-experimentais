#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
APPIMAGE="$(find "$ROOT/dist/linux" -maxdepth 1 -type f -name '*.AppImage' 2>/dev/null | sort | tail -n 1 || true)"

if [[ -z "$APPIMAGE" ]]; then
  echo "Nenhum AppImage encontrado em dist/linux."
  echo "Gere primeiro pelo 04_build_linux.bat no Windows ou por: npm run build:linux"
  exit 1
fi

chmod +x "$APPIMAGE"
exec "$APPIMAGE" "$@"
