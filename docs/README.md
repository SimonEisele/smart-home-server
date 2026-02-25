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
