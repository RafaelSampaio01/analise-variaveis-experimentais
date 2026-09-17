#!/usr/bin/env bash
set -euo pipefail

SOURCE="${1:-$(pwd)}"
SOURCE="$(cd "$SOURCE" && pwd)"
WORK="$HOME/.cache/analise-variaveis-experimentais-build"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "ERRO: Node.js e npm precisam estar instalados no WSL/Linux."
  exit 1
fi

rm -rf "$WORK"
mkdir -p "$WORK"

# Copia somente o projeto fonte para um filesystem Linux. Isso evita
# reutilizar node_modules do Windows em dependências nativas como serialport.
(
  cd "$SOURCE"
  tar \
    --exclude='./node_modules' \
    --exclude='./dist' \
    --exclude='./artifacts' \
    --exclude='./.git' \
    -cf - .
) | (cd "$WORK" && tar -xf -)

cd "$WORK"
node scripts/sync-github-config.cjs || true
npm install
npm test
npm run build:linux

mkdir -p "$SOURCE/dist/linux"
rm -f "$SOURCE/dist/linux"/*
cp -f dist/linux/* "$SOURCE/dist/linux/"

chmod +x "$SOURCE/iniciar_linux.sh" 2>/dev/null || true

echo
echo "Build Linux concluído:"
ls -lh "$SOURCE/dist/linux" || true
