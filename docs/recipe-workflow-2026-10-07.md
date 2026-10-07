# Rezepte und Kochmodus

Diese Änderung baut auf der Zutatenverwaltung aus PR #8 auf. Zuerst PR #8, anschließend diesen Pull Request übernehmen und im Backend `python manage.py migrate` ausführen.

## Struktur

| Modell | Zuständigkeit |
| --- | --- |
| `Recipe` | Name, Beschreibung, Hinweise, Kategorie, Dauer, Basisportionen, Ausgabe-Einheit und Einheiten pro Person. |
| `RecipeIngredient` | Eine Gesamtmenge des Rezepts. Eine stabile UUID identifiziert die Position unabhängig vom Katalognamen. Optional einem Rezeptabschnitt zugeordnet. |
| `RecipeSection` | Benannter Abschnitt mit Reihenfolge und einer innerhalb des Rezepts eindeutigen Abschnitts-ID. |
| `RecipeStep` | Geordneter Zubereitungsschritt mit optionalem Abschnitt. |
| `RecipeStepIngredient` | Referenz auf eine Gesamtzutatenposition desselben Rezepts. Optional eine eigene Teilmenge und Einheit. Ohne eigene Menge wird die Gesamtmenge verwendet. |
| `RecipeNote` | Geordnete Begleitinformation wie Backtemperatur oder Ruhezeit. |

Gesamtmengen werden beim Bearbeiten einzelner Schritte nicht mehr überschrieben. Dieselbe Zutatenposition kann in mehreren Schritten vorkommen; innerhalb eines Schritts ist jede Position eindeutig. Entfernen einer Schrittverknüpfung entfernt keine Zutat aus dem Rezept. Beim Entfernen einer Gesamtzutat werden ihre Schrittverknüpfungen mit entfernt.

Die API prüft positive Basisportionen und Einheiten pro Person, nicht negative Dauer und Mengen, eindeutige Abschnitts- und Schrittnummern und rezeptinterne Verknüpfungen. Fremde Zutatenpositions-UUIDs werden zurückgewiesen. Speichern der gesamten Struktur erfolgt atomar. Reihenfolgeänderungen erhalten die UUIDs der Zutatenpositionen. Ältere Aufrufer ohne Positions-UUID werden bei eindeutiger Namens-/Abschnittszuordnung weiterhin unterstützt.

Das bestehende Feld `quantityPerPerson` bleibt im API kompatibel: Bei Rezeptzutaten bezeichnet es die Menge für die gesamte Rezeptbasis. In Kochschritten ist es eine optionale Teilmenge für dieselbe Rezeptbasis. Beim Kochen werden beide mit `gewünschte Ausgabe / baseServings` skaliert. Verschiedene Einheiten werden nicht automatisch ineinander umgerechnet.

`sections`, `steps` und `side_notes` sind nun Kompatibilitätseigenschaften über relationalen Datensätzen. Zuweisung und `Recipe.save()` bleiben möglich; ORM-Abfragen auf die entfernten JSON-Felder verwenden künftig die entsprechenden Beziehungen. Die Listenansicht lädt die Beziehungen vorab, um Abfragen pro einzelner Zutatenposition zu vermeiden.

## Oberfläche

Die Rezeptübersicht bietet Suche nach Rezeptnamen oder Zutaten, Kategoriefilter und Sortierung. Karten zeigen Dauer, Gesamtzutaten, Schrittzahl und Rezeptbasis. Ansehen und Kochen öffnen denselben globalen Dialog, der auch von Dashboard-Mahlzeiten verwendet wird. Die separate ältere Kochmodus-Komponente wurde entfernt.

Die Bearbeitung gliedert sich in Grundlagen, Zutaten und Zubereitung. Zutaten erhalten ihre Gesamtmengen einmalig. In Schritten werden vorhandene Zutaten verknüpft, optional mit eigener Menge. Schritte lassen sich nach oben und unten verschieben. Abschnittszuordnung und Begleitinfos sind ausdrücklich beschriftet. Leere Schritte, unbenannte Abschnitte und nicht ausgewählte Schrittverknüpfungen werden beim Speichern sichtbar beanstandet. Fehler erhalten die Eingaben. Löschen verlangt eine ausdrückliche Bestätigung innerhalb des Dialogs.

Der Kochdialog enthält:

- Eine skalierte Gesamtzutatenliste zum Abhaken der bereitgestellten Zutaten.
- Übersicht, allgemeine Hinweise und direkten Einstieg in einen beliebigen Schritt.
- Geführte Schritte mit ihren skalierten Teilmengen, Abschnittsfilter und Navigation per Tastatur oder Schrittauswahl.
- Fortschritt anhand ausdrücklich erledigter Schritte; bloßes Öffnen zählt nicht als Erledigung.
- Begleitinfos im Desktop-Seitenbereich; mobil zusätzlich ausklappbar während der Schrittansicht.
- Mengenwahl nach gewünschter Ausgabe beim direkten Öffnen eines Rezepts; im Dashboard nach Personen und Einheiten pro Person.
- Optionales Hinzufügen zur manuellen Einkaufsliste. Derselbe Gesamtumfang kann innerhalb eines geöffneten Kochvorgangs nicht mehrfach hinzugefügt werden. Fehler erlauben einen erneuten Versuch; verspätete Antworten werden nicht einem anderen geöffneten Rezept zugeordnet.

Ein Rezept für zwölf Muffins startet direkt mit zwölf Stück, unabhängig vom Richtwert je Person. Das Öffnen aus dem Menüplan verwendet weiterhin dessen Anwesenheitszahl. Kochfortschritt und Abhakliste gelten für den geöffneten Dialog und werden nicht dauerhaft gespeichert.

## Migration

Migration `0025_structured_recipes` übernimmt Abschnitte, Hinweise, Schritte und Schrittzutaten aus den bisherigen JSON-Feldern. Zutatenpositionen erhalten eindeutige UUIDs. Schritte werden in ihrer bisherigen Reihenfolge gespeichert und fortlaufend nummeriert. Vorhandene eigene Schrittmengen werden erhalten. Unklare Zutatenzuordnungen, unbekannte Abschnitte, doppelte Schrittverknüpfungen oder ungültige Schrittmengen brechen die atomare Migration mit Rezept-ID ab, statt Daten zu verwerfen.

Die Rückmigration schreibt die relationalen Inhalte wieder als JSON und stellt die bisherigen Abschnittsreferenzen wieder her. Migration und Rückmigration sind mit Bestandsdaten getestet. Der Django-Admin zeigt Abschnitte, Gesamtzutaten, Schritte und Begleitinfos als Inline-Tabellen.

## Validierung

54 Django-Tests und 101 Frontendtests bestehen. Der Produktionsbuild ist erfolgreich; bestehende Warnungen zu Gesamtbundle, Kalender und Einkaufsliste bleiben erhalten. Die Rezept-CSS liegt unter dem bisherigen Warnbudget.

Browserprüfung mit isoliertem echtem Django-Testbackend auf Desktop (1440 px) und Mobilgerät (390 px): Erfassen und erneuter Versuch nach Fehler, Abschnitte, Schrittverknüpfung mit Teilmenge, Erhalt der Gesamtmenge, Umsortieren, direkte Stückzahl, Kochfortschritt, Einkaufsliste und bestätigtes Löschen. Screenshots wurden lokal visuell geprüft.
