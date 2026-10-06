#!/usr/bin/env bash
# Instalación en un VPS limpio con Ubuntu 24.04 (Hetzner, Hostinger VPS, Oracle...). Ejecutar como root:
#   curl -fsSL https://raw.githubusercontent.com/cahigar/nightslord/main/deploy/instalar.sh | bash -s juego.midominio.com tu@gmail.com [rama]
# (el segundo dato, opcional, es el Gmail de la cuenta master; el tercero, la rama de GitHub que se instala, por defecto main).
# El ID de Google se añade luego en /opt/nightslord/deploy/.env
set -euo pipefail
DOMAIN="${1:-}"
ADMIN="${2:-}"
BRANCH="${3:-main}"
[ -z "$DOMAIN" ] && { echo "Uso: instalar.sh tu.dominio.com [gmail-master]"; exit 1; }

echo "== Actualizando el sistema"
apt-get update -y && apt-get upgrade -y
apt-get install -y git ufw unattended-upgrades

echo "== Swap de 2 GB (por si acaso)"
if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== Cortafuegos: solo SSH, HTTP y HTTPS"
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

echo "== Docker"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

echo "== Código del juego"
mkdir -p /opt && cd /opt
[ -d nightslord ] || git clone -b "$BRANCH" https://github.com/cahigar/nightslord.git
cd nightslord/deploy
if [ ! -f .env ]; then
  WWW=""; [ "$(echo "$DOMAIN" | tr -cd '.' | wc -c)" = "1" ] && WWW="www.$DOMAIN" # dominio principal: también www
  { echo "DOMAIN=$DOMAIN"; echo "WWW_DOMAIN=$WWW"; echo "ADMIN_EMAILS=$ADMIN"; echo "GOOGLE_CLIENT_ID="; } > .env
fi

echo "== Compilando y arrancando (tarda unos minutos la primera vez)"
docker compose up -d --build

echo "== Copia de seguridad diaria de los perfiles (03:30)"
cat > /etc/cron.d/nightslord-backup <<CRON
30 3 * * * root cd /opt/nightslord/deploy && rm -f data/backup-\$(date +\%u).db && docker compose exec -T game-a node -e "new (require('node:sqlite').DatabaseSync)('data/profiles.db').exec(\"VACUUM INTO 'data/backup-\$(date +\%u).db'\")" >/dev/null 2>&1
CRON

echo
echo "Listo. Abre https://$DOMAIN (el certificado HTTPS tarda ~1 minuto la primera vez)."
echo "Estado: curl -s https://$DOMAIN/A/health"
