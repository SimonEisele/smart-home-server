# Wetter: Ortswahl und Vorhersage

Die Wetterseite bietet einen aktuellen Überblick mit Temperatur, gefühlter Temperatur, Wind, Böen und Luftfeuchte. Die Wochenübersicht zeigt Minima, Maxima, Niederschlagswahrscheinlichkeit und Tagesmenge. Ein ausgewählter Tag steuert Stundenverlauf und Detailkarten für Niederschlag, Wind, UV und Tageslicht. Für heute zeigt der Stundenverlauf die aktuelle Stunde und die folgenden 23 Stunden, einschließlich des Datumswechsels.

Alle Vorhersagezeiten bleiben Ortszeiten des Wetterorts. Browser in anderen Zeitzonen verändern weder Sonnenzeiten noch Stundenbeschriftungen. Die Ladezeit wird in der Gerätezeitzone angezeigt. Windrichtungen beschreiben die Herkunft des Winds; Standortdruck wird nicht mehr pauschal als Hoch- oder Tiefdruck eingeordnet.

## Ort und Daten

Ohne gespeicherten Ort öffnet sich die Suche. Die Standortberechtigung wird erst über „Meinen Standort verwenden“ angefragt. Die Ortssuche bietet Lade-, Leer- und Fehlerzustände. Veraltete Suchanfragen werden abgebrochen; die Suche wird auch beim Schließen und Verlassen der Seite beendet. Bei verweigerter Standortberechtigung bleibt die Suche verfügbar.

Nur erfolgreich geladene Orte werden gespeichert. Der jeweils neueste Wetterrequest ersetzt den vorherigen. Bei einem Aktualisierungsfehler bleiben die vorhandenen Daten sichtbar und können erneut geladen werden. Requests haben ein Zeitlimit von 15 Sekunden. Unvollständige aktuelle Daten werden als Fehler behandelt. Fehlende einzelne Zahlenwerte werden im gemeinsamen Modell als NaN abgebildet und in Seite und Widget als „—“ dargestellt; tatsächliche Nullwerte bleiben 0.

Der UV-Wert der aktuellen Stunde stammt aus der Stundenreihe. Stundenicons berücksichtigen Tag/Nacht. Doppelte, irreführende Interface-Deklarationen wurden entfernt. Geolokalisierte Koordinaten werden als „Mein Standort“ angezeigt, da eine Zeitzone keinen Ortsnamen bestimmt. Der bisherige automatische Berliner Ersatzort im Widget entfällt; das Widget verlinkt zur Ortswahl und zeigt Ladefehler mit Wiederholen an.

Die Wetterkarte wird erst nach „Karte laden“ eingebettet. Ein gemeinsamer Kartenausschnitt bietet Ort/Europa und Niederschlag/Wind/Wolken/Temperatur. Die sichere iframe-URL bleibt bei unverändertem Zustand stabil, statt bei jeder UI-Aktualisierung neu erzeugt zu werden. Die Karte zeigt eine eigene Windy-Vorhersage; sie ist kein Live-Niederschlagsradar.

## Prüfung

- 131 Frontendtests; neue Tests für Requestkonkurrenz, Speicherfehler, erfolgreiche Ortsübernahme, Suchfehler, Abbruch, Zeitzonen, aktuelle Stunde, Tageswechsel, Tagesauswahl, fehlende Daten und Widgetzustände.
- Produktionsbuild und `git diff --check`.
- Browserprüfung mit API-Testantworten auf 1440, 1024 und 390 px in einer anderen Browserzeitzone: Tagesauswahl, Stunden, Ortssuche, Fehler/Wiederholen, Speicherung, Kartenebenen und Kartenausschnitt.
- Erster Einstieg, verweigerte Standortberechtigung und erfolglose Suche im Browser geprüft. Keine JavaScript-Laufzeitfehler und kein horizontales Seitenüberlaufen.

Die API-Antworten und Windy-Inhalte wurden für die Browserprüfung simuliert; Live-Verfügbarkeit und Genauigkeit der Wetteranbieter wurden nicht geprüft. Bestehende Bundle- und Kalenderwarnungen bleiben. Keine Backendänderung und keine neue Migration erforderlich.
