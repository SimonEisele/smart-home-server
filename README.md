# Smart Home Server

Dashboard und Organisation für die WG: Kalender, Aufgaben, Putzplan, Menüplan,
Rezepte, Zutaten, Einkaufsliste und Wetter. Läuft auf einem Raspberry Pi.

- **Backend:** Django + Django REST Framework, JWT-Login, SQLite
- **Frontend:** Angular, wird beim Deploy gebaut und von Django ausgeliefert

## Ordnerstruktur

```text
backend/                Django-Projekt
  backend/              Einstellungen, URLs, API-Fehlerformat (api_errors.py)
  users/                Konten, WGs, Mitgliedschaften, Dashboard-Layout
  features/             Fachlogik der WG-Funktionen
    views/              ein Modul pro Bereich (todos, menus, shopping, …)
    test_*.py           Tests
frontend/               Angular-App
  src/app/core/         Login, Registrierung, Navigation, Kontoverwaltung
  src/app/dashboard/    Startseite mit den Widgets
  src/app/features/     ein Ordner pro Bereich: page/, widget/, service/, model/
  src/app/shared/       gemeinsame Services, Direktiven und utils/
  public/               Favicon und Icons
docs/                   API-Vertrag (Konventionen, Auth, Modelle)
  history/              datierte Änderungsnotizen und alte Screenshots
ai_agent/               eigenständiger KI-Code-Assistent (nutzt .ai/ als Index)
deploy.sh               Deploy auf dem Pi (Backup, Tests, Build, Neustart)
auto-deploy.sh          per Cron: deployt neue Commits auf main
backup-db.sh            Datenbank-Backup (auch nächtlich per Cron)
```

## Lokale Entwicklung

Einstellungen kommen aus einer `.env` im Projektordner, siehe
[.env.example](.env.example). Lokal reicht `DJANGO_DEBUG=true`.

```bash
cd backend
python -m venv venv
venv/Scripts/pip install -r requirements.txt   # Linux/macOS: venv/bin/pip
venv/Scripts/python manage.py migrate
venv/Scripts/python manage.py runserver
```

In einem zweiten Terminal:

```bash
cd frontend
npm ci
npm start
```

Die App läuft dann unter `http://localhost:4200/` und spricht mit der API unter
`http://127.0.0.1:8000/` (eingestellt in
`frontend/src/environments/environment.development.ts`).

## Tests

```bash
cd backend && venv/Scripts/python manage.py test
```

```bash
cd frontend && npx ng test --watch=false
```

Beides läuft auch in GitHub Actions bei jedem Push
(`.github/workflows/tests.yml`).

## Deploy

Der Pi holt per Cron `auto-deploy.sh` neue Commits von `main` und führt
`deploy.sh` aus: Backup, Backend-Tests, Frontend-Build, Migrationen, Neustart.
Schlagen Tests oder Build fehl, bleibt die laufende Version aktiv. Die
Pfade auf dem Pi stehen oben in den Skripten.

## Dokumentation

Siehe [docs/README.md](docs/README.md).
