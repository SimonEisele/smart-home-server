# Kalender: Tag / Woche / Monat (14.11.2026)

## Ansichten

- Umschalter **Tag · Woche · Monat** in der Leiste. Die Wahl wird pro Gerätetyp gemerkt (`calendar:view:phone` bzw.
  `calendar:view:wide`). Standard: Handy → Tag, Tablet/Desktop → Woche. `?view=day|week|month` und `?date=` in der
  Adresse funktionieren weiterhin.
- Die Leiste zeigt den Zeitraum als Titel („Samstag, 14. November 2026“, „9.–15. Nov. 2026 KW 46“, „November 2026“;
  auf dem Handy kürzer), dazu ‹ › (Tag / Woche / Monat je nach Ansicht) und „Heute“.
- **Tag:** Zeitraster mit einer breiten Spalte, alles wie in der Woche (Ziehen, Grösse ändern, Aufgaben einplanen).
  Auf dem Handy oben eine Wochenleiste mit Punkten für belegte Tage.
- **Woche:** wie bisher; ein Klick auf den Wochentag öffnet diesen Tag. Auf dem Handy die Tagesliste (Agenda).
- **Monat** (`month/calendar-month.*`): ganze Wochen mit KW, Termine mit Uhrzeit und Kalenderfarbe, so viele pro Tag
  wie Platz haben (ResizeObserver), sonst „+ n weitere“. Mehrtägige Ganztagstermine an jedem Tag. Klick auf einen
  Tag → Tagesansicht; „+“ beim Überfahren legt einen Termin an; ✓-Zahl = offene Aufgaben/Putzen.
  Termine lassen sich auf einen anderen Tag ziehen (Uhrzeit bleibt), Aufgaben aus „Noch einplanen“ auf einen Tag
  ziehen öffnet den Einplanen-Dialog für diesen Tag. Auf dem Handy: Punkte pro Tag, der gewählte Tag steht darunter.

## Bedienung

- Tastatur (Desktop): ← → blättern, T = heute, D / W / M = Ansicht (nicht beim Tippen oder bei offenem Dialog).
- Handy: wischen nach links/rechts blättert; die Leiste bleibt beim Scrollen oben; Filter-Chips in einer
  scrollbaren Zeile.
- Bis 1180 px Breite ist „Noch einplanen“ ein ausklappbares Panel (Knopf „Einplanen n“), damit das Raster die ganze
  Breite hat.

## Technik

- `calendar.utils.ts`: `buildMonth`, `isoWeek`, `periodLabel`, `shiftDate`, Typ `CalendarView`.
- Seite: `anchor` (gewählter Tag), `gridDays` (Spalten im Raster), `rangeDays` (geladener Zeitraum: Woche oder
  Monatswochen); neu geladen wird nur, wenn der Zeitraum wechselt. Neue Styles in `calendar.views.css`.
- `month/calendar-day-strip.ts` für die Wochenleiste auf dem Handy.
- Tests: `views.spec.ts`, `calendar-month.spec.ts`, erweiterte `calendar.utils.spec.ts`.
