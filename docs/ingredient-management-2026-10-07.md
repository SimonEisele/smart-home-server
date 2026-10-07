# Zutatenverwaltung

## Datenmodell

| Modell | Aufgabe |
| --- | --- |
| `Ingredient` | Gemeinsamer Zutatenstamm: Name, eindeutiger normalisierter Name, Einkaufskategorie, optionale Unterkategorie, Standard-Einheit und Archivstatus. |
| `RecipeIngredient` | Eine Zutatenposition eines Rezepts: geschützte Referenz auf den Katalog, Menge für die Basisportionen des Rezepts, tatsächlich verwendete Einheit, Reihenfolge und optionaler Rezeptabschnitt. Freie Zutaten ohne Katalogeintrag bleiben möglich. |

Die Menge gehört zum Rezept, nicht zum Katalog. Eine Änderung der Standard-Einheit ändert weder vorhandene Mengen noch deren Einheiten. `null` bedeutet eine unbekannte Menge; `0` bleibt ausdrücklich null Menge. Das bisherige API-Feld `quantityPerPerson` bleibt aus Kompatibilitätsgründen erhalten, bezeichnet aber weiterhin die Menge für die Basisportionen (`baseServings`). In der Datenbank heißt das Feld `quantity`.

Zutaten werden über `ingredientId` verknüpft. Alte API-Aufrufer ohne ID werden beim Speichern anhand des normalisierten Namens aufgelöst. Normalisierung berücksichtigt Unicode-NFKC, Groß-/Kleinschreibung und mehrfache Leerzeichen. Die Datenbank verhindert doppelte normalisierte Namen. Bekannte Einheitenschreibweisen wie `Stk.` werden bei API-Eingaben vereinheitlicht. Es werden keine Dichte- oder Mengenumrechnungen aus einer Änderung des Katalogs abgeleitet.

`Recipe.ingredients` ist nun eine Kompatibilitätseigenschaft über den relationalen Positionen, kein JSON-Datenbankfeld mehr. Zuweisung einer Zutatenliste und `save()` bleibt für vorhandene Import-/Exportabläufe möglich. ORM-Abfragen auf das entfernte JSON-Feld müssen stattdessen `ingredient_rows` verwenden. Kochschritte bleiben strukturierte JSON-Daten; die API prüft ihre Zutaten und löst verknüpfte Namen beim Lesen auf.

## Bedienung

- Suche über Name, Unterkategorie, Kategorie und Einheit; kombinierbar mit Kategorie und Archivstatus.
- Katalogübersicht mit aktiven, verwendeten und archivierten Zutaten.
- Ein gemeinsames Formular für Erfassen und Bearbeiten; bekannte Einheiten zur Auswahl, bestehende Sonder-Einheiten bleiben beim Bearbeiten verfügbar.
- Dublettenhinweis vor dem Speichern, zusätzlich serverseitige Prüfung.
- Fehler bleiben im geöffneten Formular sichtbar. Eingaben bleiben erhalten und können erneut gespeichert werden. Während einer Anfrage sind weitere Änderungen und Schließen gesperrt.
- `usageCount` zählt unterschiedliche Rezepte. Verwendete Zutaten sind durch `PROTECT` gegen Löschen geschützt; die API gibt bei Löschversuchen `409` zurück.
- Archivieren erhält bestehende Rezepte. Neue Verknüpfungen archivierter Zutaten werden abgelehnt; die Rezeptauswahl schlägt nur aktive Zutaten vor. Reaktivieren ist jederzeit möglich.
- Umbenennen wird in verknüpften Rezeptpositionen und Kochschritten sichtbar. Bereits erzeugte Einkaufspositionen bleiben historische Momentaufnahmen.
- Wird eine vorher freie Zutat nachträglich angelegt, werden passende freie Rezeptpositionen verknüpft.
- Der gemeinsame Katalog ist weiterhin global; Berechtigung und Geltungsbereich werden gegenüber der bisherigen Anwendung nicht geändert.

## Migration und Start

Nach Übernahme der Änderungen im Backend ausführen:

```powershell
python manage.py migrate
```

Migration `0024_relational_recipe_ingredients` übernimmt die bisherigen JSON-Positionen einschließlich Reihenfolge, Rezeptabschnitten, Einheiten und fehlenden bzw. null Mengen. Vorhandene Zutaten mit gleichem normalisiertem Namen werden auf den ältesten Katalogeintrag zusammengeführt. Dessen Kategorie und Standard-Einheit bleiben maßgebend. Ungültige Mengen brechen die atomare Migration mit dem betroffenen Rezept ab, statt Einträge zu verwerfen.

Die Rückmigration schreibt die relationalen Positionen wieder als JSON. Zusammengeführte Dubletten werden dabei nicht erneut angelegt. Der Django-Admin unterstützt die neuen Rezeptpositionen als Inline-Tabelle.

## Validierung

- 46 Django-Tests bestanden, einschließlich Migration und Rückmigration, geschütztem Löschen, Archivieren, Dubletten, Mengenvalidierung und Menüexport nach Umbenennen.
- 86 Frontendtests bestanden, einschließlich Formularfehlern, erneutem Speichern und Sperren während laufender Anfragen.
- Produktionsbuild erfolgreich; vorhandene Warnungen zu Gesamtbundle und CSS anderer Seiten bleiben bestehen.
- Browserprüfung mit isoliertem echten Django-Testbackend bei 1440 und 390 Pixeln: Erfassen, Fehler und erneuter Versuch, Archivieren/Reaktivieren, Löschen, geschützte Verwendung, Tastatur und Layout. Rezept- und Schrittbezüge nach Umbenennen zusätzlich über die echte API geprüft.
