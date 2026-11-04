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
