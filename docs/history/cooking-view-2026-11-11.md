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

## Nachtrag 13.11.2026: Im Hintergrund weiterkochen

- Im Kopf der Kochansicht gibt es **Minimieren** (–) und **Beenden** (✕). Minimiert läuft alles weiter: Schritt,
  abgehakte Zutaten, erledigte Schritte und Timer. Unten erscheint eine kleine Leiste mit Rezept, Schritt und dem
  nächsten Timer („Fertig!“ blinkt). Antippen öffnet die Kochansicht wieder an derselben Stelle.
- Schliessen per Hintergrund-Klick, Escape oder Zurück minimiert ein angefangenes Rezept; ein nur angesehenes Rezept
  wird einfach geschlossen. ✕ fragt bei Fortschritt nach (Weiterkochen / Minimieren / Beenden).
- Dasselbe Rezept erneut öffnen setzt fort. Ein anderes Rezept ersetzt das laufende; die neue Ansicht sagt das.
- Der Stand liegt beim Minimieren und beim Verlassen des Tabs in `localStorage` (`cook:session`, 12 h gültig). Nach
  einem Neuladen oder wenn das Handy den Tab verworfen hat, ist das Rezept wieder minimiert da, Timer mit richtiger
  Restzeit.
- Minimiert bleibt der Bildschirm nur an, solange ein Timer läuft.
- Nebenbei: Auf Tablets (700–899 px) lag der Assistent-Knopf hinter der unteren Navigation; er sitzt jetzt darüber.
