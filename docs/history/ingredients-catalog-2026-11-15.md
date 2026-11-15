# Zutaten: falsche «bereits im Katalog»-Meldung, Assistent nutzt den Katalog (2026-11-15)

## Fehler
- Beim Anlegen einer Zutat aus einem Rezept stand «bereits im Katalog», obwohl die Liste sie nicht zeigte.
  Ursachen:
  - Der Server vergleicht Namen mit `casefold` (ß = ss), das Frontend nicht. «Weisswein» galt im Browser als neu,
    der Server kannte aber «Weißwein».
  - Archivierte Zutaten fehlen in der Auswahl, existieren aber.
- Behoben:
  - `ingredientKey` behandelt ß wie ss.
  - Die Rezeptseite erkennt archivierte Einträge und bietet «Wieder aktivieren» an.
  - Die Meldung nennt jetzt den vorhandenen Eintrag («Gibt es schon im Katalog als „Weißwein“», ggf. «archiviert»).
  - Nach «Zum Katalog hinzufügen» werden die Rezeptzeilen (und Schritt-Verknüpfungen) direkt mit der neuen Zutat
    verknüpft.
- Migration `0031_swiss_spelling_ingredients`: Katalognamen mit ß werden in Schweizer Schreibweise umbenannt
  (Weisswein, Sojasosse, Süsskartoffel …), auch in verknüpften Rezeptzeilen.

## Assistent
- Neues Werkzeug `get_ingredient_catalog`. Der Assistent holt es vor jedem Rezeptvorschlag und verwendet die
  Katalognamen: «Salz und Pfeffer» wird aufgeteilt, «Fett für die Form» → Butter, «Zwiebeln, in Ringen» → Zwiebel
  (das Schneiden gehört in den Schritt).
- Der Server gleicht zusätzlich mechanisch ab (`features/ingredient_match.py`): Schreibweise, Teil vor Komma/Klammer,
  einfache Mehrzahl.
- Nur was wirklich fehlt, wird als neue Zutat vorgeschlagen: Badge «neue Zutat» auf der Karte, Hinweis in der
  Zusammenfassung. Die Zutat wird erst beim «Übernehmen» im Katalog angelegt (`payload.newIngredients`).
