# Rezepte, Zutaten und Menüplan: Handling

Keine Migration nötig. Backend und Frontend zusammen deployen.

## Rezepteditor

- Schliessen mit ✕, Esc, Abbrechen oder Klick daneben fragt bei ungespeicherten Änderungen nach („Weiter bearbeiten“, „Verwerfen“, „Speichern“).
- **Liste einfügen** (Zutaten): eine Zutat pro Zeile, z. B. `500 g Mehl`, `1/2 TL Salz`, `½ Bund Petersilie`, `2 Zehen Knoblauch`, `Pfeffer`. Menge, Einheit und Katalogzutat werden erkannt. Parser: `frontend/src/app/features/recipes/utils/recipe-import.ts`.
- **Text einfügen** (Zubereitung): ein Schritt pro Zeile oder pro Absatz; Nummerierungen wie `1.` oder `Schritt 2:` werden entfernt.
- Zutaten lassen sich mit ↑/↓ sortieren; Enter in einer Zutatenzeile legt die nächste Zeile an.
- **Duplizieren** öffnet eine Kopie als neues Rezept (neue Zutaten-IDs, Schrittverknüpfungen bleiben erhalten).
- Hinweis, welche Zutaten nicht im Katalog sind (landen beim Einkauf unter „Sonstiges“).

## Menüplan

- Rezeptauswahl zeigt passende Kategorien zuerst, alle anderen unter „Weitere Rezepte“ – z. B. ein Zopf (Backen) als Frühstück. Die Suche findet auch Zutaten.
- Geplante Gerichte haben einen **Kochen**-Button; der Kochmodus öffnet sich mit der geplanten Personenzahl inkl. Reste.
- Rezepte werden beim Blättern zwischen Wochen nicht neu geladen.
- Ein Rezept ohne Zutaten blockiert den Einkaufs-Export nicht mehr (Hinweis unter `notices`, nicht `warnings`).

## Einkauf

- g/kg und ml/cl/dl/l werden zusammengezählt und lesbar ausgegeben (`600 g + 0.6 kg` → `1.2 kg`). Keine Umrechnung zwischen Gewicht und Volumen. Helfer: `to_base`/`readable` in `backend/features/ingredient_units.py`.
- `POST /api/shopping-items/add-recipe/` erhöht offene (nicht abgehakte) manuelle Einträge gleicher Zutat statt Duplikate anzulegen.

## Zutatenkatalog

- `GET /api/ingredients/unlinked/`: frei getippte Rezeptzutaten der aktiven WG ohne Katalogeintrag, mit Anzahl Rezepte und häufigster Einheit. Die Zutatenseite zeigt sie mit „Aufnehmen“ an; beim Anlegen verknüpft der Server passende Rezeptzeilen automatisch.
- `POST /api/ingredients/<id>/merge/` mit `{"targetId": <id>}`: führt Duplikate zusammen (Rezeptzeilen zeigen danach auf das Ziel, die Quelle wird gelöscht). Nur WG-Owner/Admin, da der Katalog WG-übergreifend ist.

## Aufräumen

- Beim Löschen eines Rezepts werden es als Extra und die Reste-Mahlzeiten, die darauf verweisen, aus dem Menüplan entfernt.
- `extraRecipes` behalten die geplante Reihenfolge, sind auf die WG beschränkt und werden ohne N+1-Abfragen geladen.
- Personenzahlen ≥ 0, Bewertungen 1–5, Kochdauer ≥ 0 werden validiert.
- Kochmodus hält den Bildschirm wach (Screen Wake Lock, wo der Browser es unterstützt).
