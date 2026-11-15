# Rezept: «+ Zutat» ohne Wirkung auf dem Pi (2026-11-15)

- Ursache: Der Rezept-Editor erzeugte IDs für neue Zutaten mit `crypto.randomUUID()`. Diese Funktion gibt es im
  Browser nur auf HTTPS-Seiten und auf localhost. Über `http://<pi>/` ist sie nicht vorhanden. Der Klick warf
  einen Fehler und es passierte nichts. Lokal und in den Tests (localhost) trat das nicht auf.
- Fix: `shared/utils/uuid.ts` nutzt `crypto.randomUUID()` wenn vorhanden, sonst `crypto.getRandomValues()`
  (überall verfügbar). Alle Aufrufe im Rezept-Editor verwenden den Helfer.
- Betraf auch: Zutat in einem Schritt neu hinzufügen, Liste einfügen, Abschnitte, Rezept duplizieren.
- Andere Browser-Funktionen, die nur mit HTTPS gehen (Bildschirm wach halten beim Kochen, Kopieren in die
  Zwischenablage), sind bereits abgesichert und fallen ohne HTTPS still weg.
