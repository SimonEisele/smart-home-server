#!/bin/bash
# Deploy origin/main: back up the database, run the backend tests, build the
# frontend, and only then migrate and restart. If the tests or the frontend
# build fail, the code is reset to the previous commit and the running server
# is left untouched.

set -euo pipefail

# Everything runs inside main(), so bash has parsed the whole script before
# `git reset` replaces this file on disk.

PROJECT="/home/pi/smart-home-server"
BACKEND="$PROJECT/backend"
FRONTEND="$PROJECT/frontend"
STATE_DIR="$PROJECT/.deploy"
FAILED_FILE="$STATE_DIR/failed-commit"

main() {
    mkdir -p "$STATE_DIR"
    cd "$PROJECT"

    echo "=== Smart Home Deploy gestartet ($(date '+%Y-%m-%d %H:%M:%S')) ==="

    PREVIOUS=$(git rev-parse HEAD)

    echo "=== Git Pull ==="
    git fetch origin
    TARGET=$(git rev-parse origin/main)
    git reset --hard "$TARGET"

    rollback() {
        echo "!!! $1 – zurück auf $PREVIOUS, der Server läuft mit der alten Version weiter."
        echo "$TARGET" > "$FAILED_FILE"
        git reset --hard "$PREVIOUS"
        cd "$BACKEND"
        pip install -q -r requirements.txt || true
        exit 1
    }

    echo "=== Datenbank-Backup ==="
    bash "$PROJECT/backup-db.sh"

    echo "=== Backend: Abhängigkeiten ==="
    cd "$BACKEND"
    source venv/bin/activate
    pip install -q -r requirements.txt || rollback "pip install fehlgeschlagen"

    echo "=== Backend: Tests ==="
    python manage.py test --noinput || rollback "Backend-Tests fehlgeschlagen"

    echo "=== Frontend: Build ==="
    cd "$FRONTEND"
    { npm ci && npm run build; } || rollback "Frontend-Build fehlgeschlagen"

    # From here on the database schema changes, so no automatic code rollback.
    # If something fails now, restore the backup made above by hand.
    echo "=== Backend: Migrationen ==="
    cd "$BACKEND"
    python manage.py migrate --noinput
    python manage.py collectstatic --noinput

    echo "=== Angular Dateien kopieren ==="
    cp -a "$FRONTEND/dist/frontend/browser/." /var/www/smarthome/browser/

    echo "=== Django neustarten ==="
    sudo -n /usr/bin/systemctl restart smarthome.service

    rm -f "$FAILED_FILE"
    echo "=== Deploy erfolgreich: $(git log --oneline -1) ==="
}

main "$@"
exit $?
