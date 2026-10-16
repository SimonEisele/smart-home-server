#!/bin/bash

set -e

PROJECT="/home/pi/smart-home-server"
BACKEND="$PROJECT/backend"
FRONTEND="$PROJECT/frontend"

echo "=== Smart Home Deploy gestartet ==="

cd "$PROJECT"

echo "=== Git Pull ==="
git fetch origin
git reset --hard origin/main

echo "=== Backend ==="
cd "$BACKEND"
source venv/bin/activate

pip install -r requirements.txt

python manage.py migrate
python manage.py collectstatic --noinput

echo "=== Frontend ==="
cd "$FRONTEND"

npm ci
npm run build

echo "=== Angular Dateien kopieren ==="
sudo mkdir -p /var/www/smarthome/browser
sudo cp -a "$FRONTEND/dist/frontend/browser/." /var/www/smarthome/browser/

echo "=== Django neustarten ==="
sudo systemctl restart smarthome.service

echo "=== Deploy erfolgreich ==="
