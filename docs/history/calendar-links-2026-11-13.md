# Kalender verknüpfen (13.11.2026)

Externe Kalender (Outlook, Google, iCloud …) erscheinen im WG-Kalender, und der WG-Kalender lässt sich dort
abonnieren. Beides läuft über iCal-Links (Abo), ohne Anmeldung bei Microsoft oder Google.

## Externe Kalender einblenden

- Kalender → **Kalender verbinden** → Name, iCal-Link, Farbe und Sichtbarkeit. Der Link wird beim Speichern
  geprüft; ist er falsch (keine iCal-Daten, 404, lokale Adresse), kommt eine verständliche Meldung.
- **Sichtbarkeit pro Kalender:** *Nur ich* · *WG sieht «belegt»* (andere sehen nur „Belegt“, gestreift, ohne Titel,
  Ort und Notizen; als „frei“ markierte Termine gar nicht) · *WG sieht alles*. Den Link selbst sieht nur die
  Besitzerin oder der Besitzer.
- Externe Termine stehen im Wochenraster, in der Handy-Agenda und im Dashboard-Widget „Als Nächstes“, in der Farbe
  ihres Kalenders und mit Herkunft („Arbeit“, „Lisa · Uni“). Mehrtägige Ganztagstermine (Ferien) erscheinen an
  jedem Tag. Sie sind nur lesbar: Antippen zeigt Wann, Wo, Kalender, Notiz und den Stand der letzten Aktualisierung.
- Jeder verknüpfte Kalender hat in der Legende einen eigenen Schalter (wird im Browser gemerkt).
- Hat ein Kalender beim Aktualisieren einen Fehler, zeigt die Legende ein „!“ und der Dialog den Grund.

## Aktualisierung

- `features/calendar_sync.py` lädt den Link (nur öffentliche Adressen, max. 15 MB, über `assistant/web.fetch`),
  liest ihn mit `icalendar` und erweitert Wiederholungen mit `recurring-ical-events` (Ausnahmen, verschobene und
  abgesagte Termine, Outlook-Zeitzonen). Gespeichert werden die Einzeltermine von 2 Monaten zurück bis 13 Monate
  voraus (`ExternalEvent`).
- Schaut jemand den Kalender an und ein Kalender ist älter als 15 Minuten, wird er im Hintergrund neu geladen; die
  Seite fragt nach 8 Sekunden einmal nach. „↻“ im Dialog lädt sofort neu. Schlägt das Laden fehl, bleiben die alten
  Termine stehen.
- Optional per Cron, damit auch das Dashboard immer frisch ist:
  `*/30 * * * * cd /home/pi/smart-home-server/backend && venv/bin/python manage.py sync_calendars`

## WG-Kalender abonnieren

- Im selben Dialog: persönlicher Abo-Link (`/api/calendar/feed/<token>.ics`) mit allen WG-Terminen und den eigenen
  privaten Terminen (private als `CLASS:PRIVATE`), 3 Monate zurück bis 13 Monate voraus. Kopieren, „Auf iPhone/Mac
  abonnieren“ (webcal://) und Anleitungen für Outlook, Google und iPhone.
- „Neuen Link erzeugen“ macht den alten Link ungültig. Wer die WG verlässt, dessen Link liefert nichts mehr.
- Outlook im Web und Google holen Abos über das Internet ab. Ist die App nur im Heimnetz erreichbar, klappt das Abo
  nur auf Geräten im selben Netz.

## API

- `GET/POST /api/calendar/external/`, `PATCH/DELETE /api/calendar/external/<id>/`,
  `POST /api/calendar/external/<id>/sync/`
- `GET /api/calendar/external-events/?start=&end=` (höchstens 62 Tage)
- `GET/POST /api/calendar/feed/` (Link holen / neu erzeugen), `GET /api/calendar/feed/<token>.ics` (ohne Login)
- Migrationen `0027_external_calendars` und `0028_shared_calendars_and_files`. Neue Abhängigkeiten in `requirements.txt`: icalendar, recurring-ical-events (+ python-dateutil, x-wr-timezone,
  click, six). `deploy.sh` installiert sie automatisch.

## Nebenbei

- `DialogDirective`: Ein Dialog, der entfernt wurde, bevor er angezeigt war, hat den Zähler für die
  Seiten-Scrollsperre ins Minus gezogen. Danach blieb die Seite bei offenem Dialog scrollbar. Behoben.

## Nachtrag: Stundenpläne, Teilen mit einzelnen Personen, gemeinsame Kalender

Der Dialog heisst jetzt **Kalender** und hat drei Bereiche: *Gemeinsam*, *Einblenden*, *Abonnieren*.

- **Stundenplan / .ics-Datei:** Unter *Einblenden* statt eines Links eine Datei wählen (z. B. Export aus Untis,
  Moodle, dem Schulportal). Sie wird wie ein verknüpfter Kalender angezeigt (Farbe, Sichtbarkeit, Legende), nur
  lesbar. Ändert sich der Stundenplan, ersetzt «Neue Datei» den alten Stand. Max. 5 MB; Wiederholungen werden bei
  jeder Aktualisierung neu berechnet, damit sie bis ins nächste Jahr reichen (`source='file'`, `ics_data`).
- **Mit bestimmten Personen teilen:** Bei «belegt» oder «alles» zusätzlich *Ganze WG* oder *Bestimmte Personen*
  (`shared_with`; leer = ganze WG). Wer etwas nicht sehen darf, bekommt den Kalender gar nicht erst geliefert.
  Das letzte Häkchen lässt sich nicht entfernen, ohne «Ganze WG» bewusst zu wählen.
- **Von anderen freigegebene Kalender (Outlook/Google):** Solche Freigaben haben keinen eigenen Link für die
  empfangende Person. Die Anleitung im Dialog erklärt, wie die Besitzerin den iCal-Link veröffentlicht; den fügt man
  dann ganz normal ein. In der App geteilte Kalender anderer erscheinen unter «Mit dir geteilt».
- **Gemeinsame Kalender in der App** (`SharedCalendar`): z. B. «Paar», «Band», «Velotour» mit ausgewählten
  Mitgliedern. Alle Mitglieder sehen, erstellen, verschieben und ändern die Termine; alle anderen sehen nichts.
  Im Termin-Dialog steht der Kalender neben «WG» und «Nur für mich» zur Wahl. Eigene Farbe, eigener Schalter in der
  Legende, im Abo-Link enthalten (Kategorie = Kalendername). Austreten oder Löschen (löscht die Termine mit).
- Sichtbarkeit von App-Terminen zentral in `features/views/calendar.visible_events` (WG, eigene private, gemeinsame
  Kalender mit Mitgliedschaft); auch der Assistent nutzt sie und kann Termine in einen gemeinsamen Kalender
  vorschlagen (`propose_event` mit `sharedCalendar`).
- API: `GET/POST /api/calendar/shared/`, `PATCH/DELETE /api/calendar/shared/<id>/`, `GET /api/calendar/people/`;
  `POST/PATCH /api/calendar/external/` nehmen zusätzlich `icsContent`, `fileName`, `sharedWith`.
