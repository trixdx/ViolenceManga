#!/bin/bash
set -e

export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq nginx curl

if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
fi

mkdir -p /var/www/violence/proxy

cd /var/www/violence/proxy
npm install --omit=dev

pm2 delete violence-proxy 2>/dev/null || true
pm2 start proxy-server.js --name violence-proxy
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

cp /var/www/violence/nginx-violence.conf /etc/nginx/sites-available/violence
ln -sf /etc/nginx/sites-available/violence /etc/nginx/sites-enabled/violence
rm -f /etc/nginx/sites-enabled/default

mkdir -p /etc/nginx/ssl
if [ ! -f /etc/nginx/ssl/violence.crt ]; then
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/violence.key \
    -out /etc/nginx/ssl/violence.crt \
    -subj "/CN=147.45.253.205" \
    -addext "subjectAltName=IP:147.45.253.205" 2>/dev/null || \
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/violence.key \
    -out /etc/nginx/ssl/violence.crt \
    -subj "/CN=147.45.253.205"
  chmod 600 /etc/nginx/ssl/violence.key
fi

nginx -t
systemctl reload nginx
systemctl enable nginx

IP=$(hostname -I | awk '{print $1}')
echo "OK: Violence deployed at https://${IP}"
