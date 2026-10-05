#!/usr/bin/env bash
# Actualiza el juego a la última versión de GitHub sin perder perfiles.
set -euo pipefail
cd /opt/nightslord && git pull --ff-only
cd deploy && docker compose up -d --build
docker image prune -f >/dev/null
echo "Actualizado."
