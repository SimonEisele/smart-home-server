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
- Neue Abhängigkeiten in `requirements.txt`: icalendar, recurring-ical-events (+ python-dateutil, x-wr-timezone,
  click, six). `deploy.sh` installiert sie automatisch.

## Nebenbei

- `DialogDirective`: Ein Dialog, der entfernt wurde, bevor er angezeigt war, hat den Zähler für die
  Seiten-Scrollsperre ins Minus gezogen. Danach blieb die Seite bei offenem Dialog scrollbar. Behoben.
