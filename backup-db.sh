#!/bin/bash
# Consistent copy of the SQLite database, safe while the server is running.
#
# Usage:  bash backup-db.sh         (e.g. nightly from cron; deploy.sh also runs it)
# Env:    BACKUP_DIR   target folder        (default: /home/pi/smarthome-backups)
#         KEEP_DAYS    delete older backups (default: 30)
#
# Cron example (every night at 03:15):
#   15 3 * * * bash /home/pi/smart-home-server/backup-db.sh >> /home/pi/smarthome-backups/backup.log 2>&1
#
# Tip: point BACKUP_DIR at a USB stick or a network share, so a dead SD card
# does not take the backups with it.

set -euo pipefail

PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB="$PROJECT/backend/db.sqlite3"
BACKUP_DIR="${BACKUP_DIR:-/home/pi/smarthome-backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"

if [ -z "${PYTHON:-}" ]; then
    PYTHON="$PROJECT/backend/venv/bin/python"
    [ -x "$PYTHON" ] || PYTHON="$(command -v python3)"
fi

if [ ! -f "$DB" ]; then
    echo "Keine Datenbank gefunden: $DB" >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"
TARGET="$BACKUP_DIR/db-$(date +%Y-%m-%d_%H-%M-%S).sqlite3"

"$PYTHON" - "$DB" "$TARGET" <<'EOF'
import sqlite3, sys
source, target = sys.argv[1], sys.argv[2]
src = sqlite3.connect(source)
dst = sqlite3.connect(target)
with dst:
    src.backup(dst)
ok = dst.execute("PRAGMA integrity_check").fetchone()[0]
dst.close()
src.close()
if ok != "ok":
    sys.exit(f"Backup ist beschädigt: {ok}")
EOF

gzip "$TARGET"
echo "Backup erstellt: $TARGET.gz"

find "$BACKUP_DIR" -name 'db-*.sqlite3.gz' -mtime +"$KEEP_DAYS" -delete
