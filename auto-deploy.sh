#!/bin/bash
# Run from cron: deploys when origin/main has new commits.
set -euo pipefail

# Wrapped in main(): deploy.sh resets the checkout, which rewrites this file too.

PROJECT="/home/pi/smart-home-server"

main() {
    cd "$PROJECT"

    # Never run two deploys at once (tests and builds can outlast the cron interval).
    exec 9>"/tmp/smarthome-deploy.lock"
    if ! flock -n 9; then
        echo "=== Deploy läuft bereits ==="
        exit 0
    fi

    git fetch origin main

    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/main)
    FAILED_FILE="$PROJECT/.deploy/failed-commit"

    if [ "$LOCAL" = "$REMOTE" ]; then
        echo "=== Kein Update vorhanden ==="
    elif [ -f "$FAILED_FILE" ] && [ "$(cat "$FAILED_FILE")" = "$REMOTE" ]; then
        # Retrying the same broken commit every few minutes would only re-run the tests.
        echo "=== $REMOTE ist beim letzten Deploy fehlgeschlagen, warte auf neuen Commit ==="
    else
        echo "=== Neues Update gefunden ==="
        ./deploy.sh
    fi
}

main "$@"
exit $?
