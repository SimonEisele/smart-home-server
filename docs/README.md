# Smart Home Server – API Dokumentation

Diese Dokumentation beschreibt die Schnittstellen und Datenmodelle
zwischen Frontend (Angular) und Backend.

Ziel:
- parallele Entwicklung von Frontend & Backend
- klar definierter API-Vertrag
- keine impliziten Annahmen oder Logik im Frontend

Die Authentifizierung erfolgt über JWT (Access Token + Refresh Token).

---

## 📚 Dokumente

- Authentifizierung: `auth.md`
- Datenmodelle: `models.md`
- API Konventionen (Responses & Errors): `api-conventions.md`

Weitere Module (Notes, Dashboard, Automationen) bauen auf diesen
Grundlagen auf.

---

## Review and screenshots

See [the October 2026 review](review-2026-10-04.md) for tested fixes, deployment notes, and remaining findings.

See [the household workspace rework](workspace-rework-2026-10-05.md) for the current interface and validation. Older screenshots show the previous design.

## 🛠️ Development

Für die lokale Entwicklung werden das Django-Backend und das Angular-Frontend
separat gestartet.

### Backend starten

In das Backend-Verzeichnis wechseln, die Abhängigkeiten installieren und den
Django-Entwicklungsserver starten:

```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Das Backend ist anschließend standardmäßig unter
`http://127.0.0.1:8000/` erreichbar.

### Frontend starten

In einem zweiten Terminal das Frontend installieren und starten:

```bash
cd frontend
npm install
ng serve
```

Das Frontend ist anschließend unter `http://localhost:4200/` erreichbar.

Die lokale API-Adresse wird in
`frontend/src/environments/environment.development.ts` konfiguriert.

### Tests und Build

Frontend-Tests können mit folgendem Befehl ausgeführt werden:

```bash
cd frontend
ng test
```

Ein Produktions-Build des Frontends wird mit folgendem Befehl erstellt:

```bash
cd frontend
ng build
```
