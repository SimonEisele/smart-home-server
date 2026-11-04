# Kochübersicht und eigener Schrittpopup

Die Kochübersicht bietet weiterhin Mengenwahl, Zutaten zum Abhaken und den optionalen Einkaufsexport. Zusatzinformationen (`sideNotes`) stehen nun als eigener Bereich bei der Rezeptbeschreibung und den Zubereitungshinweisen. Auf dem Handy erscheint dieser Bereich vor der Zutatenliste.

„Schritte im eigenen Popup öffnen“ oder das Anklicken eines einzelnen Schritts öffnet einen separaten fokussierten Dialog. Es ist jeweils nur ein modaler Dialog aktiv. Der Schrittpopup zeigt grosse Schritttexte, skalierte Zutaten für den aktuellen Schritt, Zusatzinformationen und aufklappbare Gesamtzutaten/Zubereitungshinweise. Die Navigation bleibt am unteren Rand erreichbar. Pfeiltasten wechseln Schritte; Escape, der Hintergrund und „Zur Übersicht“ kehren zur Kochübersicht zurück.

Mengen, Zutatenhäkchen, aktueller Schritt und erledigte Schritte bleiben dabei erhalten. Nach Abschluss aller Schritte führt „Fertig · Zur Übersicht“ zur Übersicht zurück; das Rezept wird nicht automatisch geschlossen. Beim Wechsel wird der Fokus wieder auf den Schrittmodus-Button gesetzt. Leere Abschnitte, ungültige Mengen und ein laufender Einkaufsexport verhindern das Öffnen des Schrittmodus.

Keine Änderung an Rezeptmodellen, gespeicherten Daten oder Backendmigrationen. Die Änderung ist unabhängig vom noch offenen Wetter-PR #11.

Prüfung: 119 Frontendtests und Produktionsbuild erfolgreich; `git diff --check` sauber. Browserprüfung mit Rezept-Testdaten auf Desktop (1440 px), Tablet (1024 px) und Smartphone (390 px): getrennte Dialoge, Zusatzinformationen, skalierte Teilmengen, Fortschritt/Zutaten/Mengen beim Wechsel, Tastatur, Fokus und Abschluss. Keine JavaScript-Laufzeitfehler, Dialoge passen in den Bildschirm. Bestehende Bundle- und Kalenderwarnungen bleiben.
