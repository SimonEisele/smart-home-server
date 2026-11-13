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

- `providers.py`: OpenAI (Responses API) und Anthropic (Messages) mit Tool-Calling über HTTPS, ohne SDK.
- `tools.py`: Lese-Werkzeuge (Webseite, Rezepte, Menüplan, Kalender, Aufgaben, Einkaufsliste, Putzplan) und
  `propose_*`-Werkzeuge. Vorschläge werden schon beim Erstellen mit den normalen Serializern geprüft; Fehler gehen
  zurück ans Modell. `apply_proposal` speichert über dieselben Serializer und WG-Prüfungen wie die Seiten.
- `web.py`: lädt Links nur aus dem öffentlichen Internet (keine lokalen/privaten Adressen, auch nicht über
  Weiterleitungen), max. 2 MB, 12 s. Liest schema.org-Rezeptdaten (JSON-LD), sonst den Seitentext.
- API: `GET /api/assistant/status/`, `POST /api/assistant/chat/` (`messages`, `context.page`),
  `POST /api/assistant/apply/` (`type`, `payload`). Chat ist gedrosselt (`ASSISTANT_RATE`).
- Der Verlauf liegt nur im Browser (Sitzung); der Server speichert keine Gespräche.

## Nachtrag 13.11.2026: Rezeptkarten, Zutaten pro Schritt, Bearbeiten

- **Rezeptkarte zeigt alles:** Eckdaten (Portionen, Dauer, Kategorie), Beschreibung, Quelle, alle Zutaten mit Menge
  und alle Schritte nummeriert. Der Server liefert dafür `details` (`ingredients`, `steps`) fertig formatiert mit.
- **Zutaten pro Schritt:** `propose_recipe` nimmt Schritte als `{description, ingredients: [{name, quantity, unit}]}`.
  Jede Zutat bekommt eine feste ID, die Schritte verweisen darauf (`recipeIngredientId`), auch mit Teilmengen
  (z. B. 200 g Zucker in Schritt 3, 50 g in Schritt 4). Nicht eindeutig zuordenbare Namen meldet das Werkzeug ans
  Modell zurück, statt den Vorschlag zu verwerfen. Die Karte zeigt die Zutaten als Chips unter jedem Schritt.
- **Bearbeiten mit Vorschlag:** `propose_recipe_update`, `propose_event_update`, `propose_todo_update`,
  `propose_shopping_update`. Die Lese-Werkzeuge liefern dafür die IDs. Karten zeigen „vorher → nachher“, bei Rezepten
  zusätzlich die Zutatenliste mit *neu / geändert / entfernt* und die neuen Schritte. Bestehende Zutaten behalten ihre
  ID (auch für bestehende Schritt-Verknüpfungen); entfernte Zutaten verschwinden aus den Schritten.
- **Sicher übernehmen:** Gespeichert wird als Teil-Update über die normalen Serializer mit denselben Sichtbarkeitsregeln
  (fremde private Termine/Aufgaben bleiben tabu). Wurde der Eintrag seit dem Vorschlag geändert (`updatedAt`), wird
  abgelehnt. „Erledigt“ bei Aufgaben läuft über dieselbe Logik wie das Abhaken (wiederkehrende springen weiter);
  `complete_todo` und `sync_todo_events` liegen dafür neu als Funktionen in `features/views/todos.py`.
- Offene Rezeptkarten gehen als Text in den Verlauf, damit „mach 6 Portionen daraus“ funktioniert. Eine neue Antwort
  wird ab ihrem Anfang angezeigt, nicht ab dem letzten Knopf.
- Löschen kann der Assistent bewusst nicht.
