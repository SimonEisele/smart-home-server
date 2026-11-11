# Kochansicht für alle Geräte

Eine Ansicht mit zwei Modi statt Übersicht plus zweitem Popup (`shared/recipe-cook-overlay`).

- **Handy und Tablet (≤ 900 px)**: Vollbild. Bis 700 px Breite sind Zutaten und Zubereitung zwei Tabs, darüber zwei Spalten.
- **Kopfzeile**: Zurück/Schliessen, Rezeptname und ein grosser Stepper für Portionen bzw. Personen (Portionen pro Person im Menüplan-Fall aufklappbar bei den Zutaten).
- **Zutaten**: Menge zuerst und gross („400 ml Kokosmilch“), ganze Zeile antippbar zum Abhaken.
- **Kochen starten** als Hauptknopf; nach einer Pause „Weiter bei Schritt N“. Einkaufsliste als Nebenknopf.
- **Schritt-Modus**: grosser Schrifttext, Zutaten des Schritts als Chips, Fortschrittsbalken (antippbar), grosse Knöpfe Zurück/Weiter. „Weiter“ hakt den Schritt ab. Wischen links/rechts und Pfeiltasten wechseln den Schritt. Auf breiten Geräten steht die Zutaten-Checkliste daneben, auf dem Handy aufklappbar.
- **Timer**: Zeiten im Schritttext („20 Minuten“, „1 Std.“, „10–15 Min.“) werden erkannt und als „Timer starten“ angeboten. Laufende Timer stehen oben, auch beim Weiterblättern; am Ende Ton, Vibration und pulsierende Anzeige.
- **Abschluss**: nach dem letzten Schritt „En Guete!“-Seite; fehlen noch Schritte, springt „Fertig“ zum ersten offenen.
- Bildschirm bleibt an (Wake Lock), Ziele mindestens 44–56 px.
