#!/usr/bin/env bash
# Programa el publicador cada 10 minutos (solo publica lo que ya toca según calendario.json).
set -euo pipefail
LINEA='*/10 * * * * bash /opt/nightslord/social/publicar.sh >> /opt/nightslord/social/publicar.log 2>&1'
( crontab -l 2>/dev/null | grep -v 'social/publicar.sh' ; echo "$LINEA" ) | crontab -
echo "Cron instalado. Registro: tail -f /opt/nightslord/social/publicar.log"
