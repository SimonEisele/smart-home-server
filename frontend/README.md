# Frontend

Angular-App des Smart Home Servers. Einrichtung und Überblick stehen im
[README im Projektordner](../README.md).

```bash
npm ci
npm start                    # Dev-Server auf http://localhost:4200/
npx ng test --watch=false    # Tests (Vitest)
npm run build                # Produktions-Build nach dist/
```

## Aufbau von `src/app`

- `core/`: Login, Registrierung, Navigation, Kontoverwaltung
- `dashboard/`: Startseite mit verschiebbaren Widgets
- `features/<bereich>/`: je Bereich `page/` (Seite), `widget/` (Dashboard-Kachel),
  `service/` (API), `model/` (Typen)
- `popovers/`, `widgets/`: Dialoge und das Widget-Register des Dashboards
- `shared/`: gemeinsame Services, Direktiven, Kochmodus und `utils/`

## Styling

Farben und gemeinsame Bausteine stehen in `src/styles.css`. Seiten verwenden
diese Klassen und definieren sie nicht neu:

- Seitenkopf: `page-header` mit `page-heading` (`eyebrow`, `page-title`,
  `page-subtitle` oder `badges`) und `page-actions`
- Buttons: `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-danger`, dazu
  `btn-sm` und `btn-icon`
- Filter und Ansichten: `chip-group` mit `chip` (`chip-danger`, `chip-warn`,
  `chip-info`), `segmented`, `toolbar`, `week-nav`
- Status: `badge` (`badge-danger`, `badge-warn`, `badge-info`, `badge-muted`),
  `empty-state`, `loading-state`, `form-feedback`

Farben immer über die Variablen (`--color-accent`, `--color-danger`, …), nicht
als feste Werte.
