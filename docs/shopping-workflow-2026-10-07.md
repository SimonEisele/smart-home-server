# Einkaufsliste: Mengen, Herkunft und Bedienung

## Verhalten

Die dunkle Einkaufsansicht nutzt die Seitenbreite mit Warengruppen und einer Mengenübersicht. Auf Mobilgeräten erscheinen die Bereiche untereinander. Suche berücksichtigt Artikel, Warengruppe und Rezeptname; Herkunft und Kalenderwoche lassen sich filtern. Fortschritt, offene Artikel und abgehakte Artikel beziehen sich jeweils auf diese Ansicht. Abgehakte Menüplanartikel erscheinen ausschließlich im Bereich „Abgehakt“ und können wieder geöffnet werden.

Die Mengenübersicht addiert offene Einträge mit gleichem normalisiertem Namen und gleicher Einheit. Die einzelnen Einträge bleiben unabhängig bearbeitbar und abhakbar. Verschiedene Einheiten werden getrennt angezeigt; es gibt keine Dichte- oder Packungsumrechnung. Eine unbekannte Teilmenge bleibt sichtbar: „200 g + nach Bedarf“. Null bedeutet ausdrücklich 0 und wird angezeigt.

Hinzufügen und Bearbeiten verwenden denselben beschrifteten Dialog: Name, Menge, Einheit, Warengruppe und optionales Bild. Eine leere Menge bedeutet „Nach Bedarf“ und wird als `null` gespeichert. Name und Warengruppe können nun ebenfalls geändert werden. Katalogeinträge schlagen Einheit und Warengruppe vor; archivierte Katalogeinträge erscheinen nicht als Vorschlag. Historische Artikelvorschläge stammen nur aus dem aktiven Haushalt. Veraltete Suchantworten werden verworfen.

Der Rezeptdialog arbeitet mit der gewünschten **Gesamtzahl an Portionen oder Stücken**, zeigt die skalierten Zutaten vor dem Hinzufügen und übergibt `persons=1, unitsPerPerson=gewünschteGesamtmenge` an die bestehende API. Beispiel: 240 g Mehl für 12 Muffins ergeben 120 g für 6 Muffins, unabhängig von der im Rezept hinterlegten Stückzahl pro Person. Eine erneute Übernahme ist bewusst ein weiterer Einkauf; vorhandene Quellen werden nicht still überschrieben.

Speicher- und Importaktionen sind während des Requests gesperrt. Eingaben bleiben bei Fehlern erhalten. Artikelaktionen sperren nur den betroffenen Eintrag. Der Dashboard-Einkaufswidget behandelt fehlgeschlagenes Hinzufügen und Abhaken ebenfalls korrekt und zeigt unbekannte, partielle und Nullmengen an.

## Daten und API

`ShoppingItem` behält UUID, Haushaltsbezug, Mengen-, Quellen- und Wocheninformationen. Neu ist `quantity_incomplete`, im JSON `quantityIncomplete`: Eine numerische Menge kann zusätzlich einen noch unbekannten Bedarf enthalten. Der Dialog lässt diese Kennzeichnung erhalten oder bewusst entfernen.

Migration `0026_shopping_quantity_completeness` kennzeichnet bestehende `null`-Mengen und die bisher über den Quellenhinweis markierten unvollständigen Menüplanmengen. Namen, Mengen, Quellen und Abhakstatus werden nicht verändert. Der Menüplanexport schreibt die Kennzeichnung künftig direkt und öffnet einen abgehakten Artikel wieder, wenn sich die Menge oder ihre Vollständigkeit ändert.

Der Serializer validiert endliche Mengen ab 0, Quellen `manual`/`menuplan` und gültige ISO-Kalenderwochen für neu angelegte oder geänderte Menüplanquellen. Ältere Menüplanartikel ohne Woche bleiben bearbeitbar. Einheitenschreibweisen wie `Liter` und `stk.` werden normalisiert. Rezeptimporte lehnen ungültige Personen-/Portionswerte und nicht endliche Skalierungen ab, statt Ersatzwerte zu erfinden.

`POST /api/shopping-items/clear-checked/` erhält explizite `ids` (maximal 1000) und entfernt atomar nur die ausgewählten, aktuell abgehakten Artikel im aktiven Haushalt. Die Antwort `deletedIds` bestimmt, was die Oberfläche entfernt. Die Bestätigung zeigt die Artikelanzahl der aktuellen Ansicht. Offene Artikel, andere Wochen außerhalb des Filters und fremde Haushalte bleiben erhalten.

## Übernahme

Frontend und Backend gemeinsam aktualisieren; anschließend im Backend:

```powershell
python manage.py migrate
```

Der bestehende Menüplanexport mit Vorschau, Prüfung der Anwesenheiten und Wochenabgleich bleibt erhalten. Einkaufszustände werden nach dem Laden angezeigt; parallele Änderungen anderer Clients werden beim nächsten Laden sichtbar. Es gibt weiterhin keine Echtzeitsynchronisierung und keine automatische Bestandsverwaltung.

## Prüfung

- 64 Backendtests einschließlich Mengenvalidierung, Haushaltsgrenzen, selektivem Löschen, Stückrezepten, Menüplanmengen und Datenmigration mit Rückweg.
- 115 Frontendtests einschließlich Summen, Quellen-/Wochenfiltern, Nullmengen, Fehlern, wiederholten Aktionen, Suchantworten und Dashboardaktionen.
- Produktionsbuild, `makemigrations --check --dry-run` und `git diff --check`.
- Browserprüfung gegen eine isolierte echte Django-API mit Testdaten auf 1440 px und 390 px: Hinzufügen, Fehler und Wiederholen, Umbenennen, Menge leeren, Abhaken/Wiederöffnen, gefiltertes Entfernen und Stückrezeptübernahme.

Bestehende Warnungen für das initiale Frontendbundle, die Kalender-CSS und das lokale Django-Static-Verzeichnis bleiben bestehen. Die Einkaufs-CSS liegt innerhalb des Größenbudgets.
