#!/bin/bash
set -e

cd /home/pi/smart-home-server

git fetch origin main

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "=== Neues Update gefunden ==="
    ./deploy.sh
else
    echo "=== Kein Update vorhanden ==="
fi
