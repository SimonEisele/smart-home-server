# «Im Katalog anlegen» meldete immer «bereits vorhanden» (2026-11-15)

- Jeder Datenbankfehler beim Anlegen (IntegrityError) wurde als «Diese Zutat ist bereits im Katalog vorhanden»
  ausgegeben, auch wenn es gar kein Doppel gab. Jetzt:
  - Gibt es wirklich einen Eintrag (gleicher Name in beliebiger Schreibweise, ß = ss, auch archiviert), wird er
    genannt.
  - Sonst kommt der tatsächliche Datenbankfehler zurück und wird im Server-Log protokolliert.
- Die Doppelprüfung sucht zusätzlich über den Namen (ohne Gross/Klein). Migration
  `0032_renormalize_ingredient_names` berechnet den Vergleichsschlüssel aller Katalogzutaten neu, falls ältere
  Einträge einen veralteten Schlüssel hatten.
- Rezept-Editor: Lehnt der Server das Anlegen ab, lädt er den Katalog neu.
  - Gibt es die Zutat schon, wird die Zeile direkt damit verknüpft («war schon im Katalog»).
  - Ist sie archiviert, wird «Wieder aktivieren» angeboten.
  - Sonst steht der Grund direkt im Hinweis bei der Zutat statt oben im Fenster.
