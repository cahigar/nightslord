#!/usr/bin/env bash
# Ejecuta el publicador de Instagram en un contenedor Node (no hace falta instalar Node en el VPS).
#   bash /opt/nightslord/social/publicar.sh comprobar
#   bash /opt/nightslord/social/publicar.sh estado
#   bash /opt/nightslord/social/publicar.sh            ← lo que lanza el cron
set -euo pipefail
cd /opt/nightslord
mkdir -p social/media
exec flock -n /tmp/mooonsters-publicar.lock \
  docker run --rm -e TZ=Europe/Madrid --env-file deploy/.env \
    -v /opt/nightslord/social:/social -w /social node:22-alpine \
    node publicar.mjs "$@"
