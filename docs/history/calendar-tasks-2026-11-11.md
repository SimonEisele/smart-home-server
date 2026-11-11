# Kalender mit Aufgaben und Putzplan

Keine Migration nötig. Backend und Frontend zusammen deployen.

## Kalender

- **Pro Tag „Zu erledigen“**: Aufgaben mit Datum, wiederkehrende Aufgaben und fällige Putzaufgaben stehen im Tageskopf (Handy: in der Tageskarte) und lassen sich direkt abhaken. Danach erscheint 8 Sekunden lang „Rückgängig“.
- **Überfälliges** (einmalige Aufgaben und Putzaufgaben) steht gesammelt bei heute, rot markiert.
- **Noch einplanen** (Seitenleiste): nur einmalige, offene Aufgaben ohne Zeitblock – auch Blöcke in anderen Wochen zählen. Sortiert nach Fälligkeit.
- **Ein Dialog „Einplanen“** (Datum, Beginn, Dauer, optional in Blöcke aufteilen mit 15 Min. Pause) statt des bisherigen „Todo aufteilen“. Ziehen in den Kalender funktioniert weiterhin; lange Aufgaben (> 2 h) öffnen beim Ablegen den Dialog.
- **Termin-Dialog**: Titel, WG/„Nur für mich“, Datum und Zeit; Ort, Notiz und Farbe aufklappbar. Bei Aufgabenblöcken: „Aufgabe erledigt“ direkt im Dialog.
- Legende **WG · Privat · Aufgaben · Putzen** ist zugleich Filter.
- Überlappende Termine stehen nebeneinander; das Raster scrollt für sich und springt zur aktuellen Uhrzeit (Handy: zum heutigen Tag).
- Ansicht umbenannt: „Woche“ / „Wer isst mit?“.
- Links: `/calendar?date=YYYY-MM-DD` öffnet die Woche, `/calendar?plan=<todo-id>` den Einplanen-Dialog.

## Aufgaben und Putzplan

- Aufgabenkarten zeigen „Eingeplant · Fr., 13.11., 14:00“ (Link zur Kalenderwoche) oder „+ Einplanen“.
- Abhaken einer **wiederkehrenden Aufgabe** schliesst sie nicht mehr, sondern verschiebt sie auf das nächste Datum (Kalender und Aufgabenseite gleich).
- Aufgaben- und Putzseite haben einen Button „Im Kalender“; „Neue Aufgabe“ heisst auf der Putzseite jetzt „Neue Putzaufgabe“.

## API

- `POST /api/todos/<id>/complete/` mit optional `{"date": "YYYY-MM-DD"}`: einmalige Aufgaben → `done`, wiederkehrende → `startDate`/`dueDate` rücken auf das nächste Vorkommen nach diesem Tag. Antwort: `data`, `advancedTo` (Datum oder `null`), `previous` (für Rückgängig).
- Todos enthalten `plannedSlots: [{id, start, end}]` – die verknüpften Kalenderblöcke.
- Fix: private Termine werden nur noch für die aktive WG geliefert (vorher auch aus früheren WGs).

## „Wer isst mit?“ im Menüplan

- Die Anwesenheiten sind vom Kalender in den **Menüplan** gezogen: Umschalter „Menü / Wer isst mit?“ oben rechts, gleiche Woche wie der Plan. Direktlink: `/menuplan?view=attendance`.
- Neu: „Ganze Woche mitessen“. Nach jeder Änderung lädt der Menüplan die Personenzahlen neu.
- Die „Pers.“-Angabe in jeder Mahlzeit und der Link im Einkauf-Dialog führen direkt dorthin.
- Komponente: `frontend/src/app/features/menuplan/attendance/meal-attendance.*`. Die alte, ungenutzte Mitglieder-Verfügbarkeit (`members`/`availabilities`) lädt der Kalender nicht mehr.
