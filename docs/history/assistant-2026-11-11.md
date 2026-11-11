# WG-Assistent (Sprachmodell)

Ein Chat, der Rezepte von Links übernimmt, Termine, Aufgaben, Menüplan-Einträge und Einkaufsartikel
vorschlägt und Fragen zu Woche, Aufgaben und Putzplan beantwortet.

## Einrichten

In der `.env` auf dem Pi (siehe `.env.example`):

```
OPENAI_API_KEY=sk-…          # oder ANTHROPIC_API_KEY=…
# ASSISTANT_PROVIDER=openai  # openai | anthropic, leer = der mit Schlüssel
# ASSISTANT_MODEL=           # sonst gpt-5.6-luna bzw. claude-sonnet-5-5
# ASSISTANT_RATE=40/hour     # Anfragen pro Person
```

Danach App neu starten. Ohne Schlüssel bleibt der Button ausgeblendet; die Seite „Assistent“ zeigt dann einen Hinweis.

## Bedienung

- Runder Button unten rechts auf jeder Seite öffnet den Chat als Panel (Handy: Vollbild); „Gross öffnen“ bzw. Menü
  *Mehr → Assistent* zeigt ihn als eigene Seite. Das Gespräch bleibt beim Seitenwechsel erhalten.
- **Nichts wird ohne Klick gespeichert.** Änderungen kommen als Karten (Rezept, Termin, Aufgabe, Einkaufsliste,
  Menüplan) mit „Übernehmen“ / „Verwerfen“. Nach dem Übernehmen führt „Öffnen →“ zur passenden Seite.

## Technik (`backend/assistant/`)

- `providers.py`: OpenAI (Chat Completions) und Anthropic (Messages) mit Tool-Calling über HTTPS, ohne SDK.
- `tools.py`: Lese-Werkzeuge (Webseite, Rezepte, Menüplan, Kalender, Aufgaben, Einkaufsliste, Putzplan) und
  `propose_*`-Werkzeuge. Vorschläge werden schon beim Erstellen mit den normalen Serializern geprüft; Fehler gehen
  zurück ans Modell. `apply_proposal` speichert über dieselben Serializer und WG-Prüfungen wie die Seiten.
- `web.py`: lädt Links nur aus dem öffentlichen Internet (keine lokalen/privaten Adressen, auch nicht über
  Weiterleitungen), max. 2 MB, 12 s. Liest schema.org-Rezeptdaten (JSON-LD), sonst den Seitentext.
- API: `GET /api/assistant/status/`, `POST /api/assistant/chat/` (`messages`, `context.page`),
  `POST /api/assistant/apply/` (`type`, `payload`). Chat ist gedrosselt (`ASSISTANT_RATE`).
- Der Verlauf liegt nur im Browser (Sitzung); der Server speichert keine Gespräche.
