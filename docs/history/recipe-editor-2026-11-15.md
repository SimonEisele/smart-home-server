# Rezept-Editor überarbeitet (2026-11-15)

## Behoben
- Einheit beim Tippen: Bei «Zuckerwatte» blieb das «g» von «Zucker» stehen, weil die Einheit schon beim Präfix
  übernommen wurde. Jetzt wird die Katalog-Einheit nur bei exaktem Namen gesetzt und wieder entfernt, wenn
  weitergetippt wird. Eine von Hand eingegebene Einheit wird nie überschrieben.
- Eingefügte Listen: Zutaten ohne Menge («Salz») bekommen keine Standard-Einheit mehr.
- Der Katalog-Hinweis galt nur für die zuletzt bearbeitete Zutat. Andere neue Zutaten gingen verloren.
- «+ Zutat» setzt den Cursor direkt in die neue Zeile, «+ Schritt» in die neue Beschreibung.

## Neu
- Jede Zutat zeigt ihren Katalog-Status:
  - «✓ Katalog»
  - «Meinst du „Ei“?» bei Mehrzahl oder Zusatz («Eier», «Zwiebeln, gehackt»), ein Tipp übernimmt den Katalognamen
  - «Neu · anlegen?» öffnet direkt unter der Zeile das Anlegen im Katalog
  - «Archiviert» bietet «Wieder aktivieren»
- Unter jeder Zutat steht, in welchen Schritten sie verwendet wird.
- Zubereitung: Zutaten werden ohne Auswahlliste zugeordnet.
  - Chips «+ Mehl» für alle noch nicht verwendeten Zutaten.
  - Feld «Zutat hinzufügen (auch neue)» mit Menge und Einheit. Eine bestehende Zutat bekommt diese Menge als
    Schrittmenge. Eine neue Zutat landet mit der Menge in der Zutatenliste und wird mit dem Katalog verknüpft.
  - Verknüpfte Zutaten zeigen Name und Gesamtmenge, darunter optional die Menge für diesen Schritt.
- Handy: Menge, Einheit und Zeilen-Knöpfe in einer Zeile.

## Build
- Das Start-Bundle hatte die Fehlergrenze von 1.5 MB knapp überschritten. `npm run build` wäre beim Deploy
  gescheitert, und `deploy.sh` hätte zurückgerollt.
- Die Seiten werden jetzt erst beim ersten Öffnen geladen (`loadComponent` in `app.routes.ts`).
- Das Start-Bundle ist dadurch von rund 1.5 MB auf 746 kB gesunken.
