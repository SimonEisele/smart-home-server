# Authentifizierung (JWT)

Dieses Projekt verwendet eine JWT-basierte Authentifizierung
mit Access Token und Refresh Token.

Das Frontend speichert die Tokens und sendet den Access Token
bei jedem geschützten API-Request im Authorization-Header.

## 🔐 Auth-Flow (Übersicht)

1. User loggt sich mit E-Mail und Passwort ein
2. Backend gibt Access Token und Refresh Token zurück
3. Frontend speichert die Tokens
4. Access Token wird bei jedem Request gesendet
5. Frontend ruft `/users/` auf, um den aktuellen User zu laden

## POST `/users/create/`

Erstellt einen neuen Benutzer.

### Headers

Authorization: Bearer <access-token>  // Nur wenn authentifiziert
Content-Type: application/json

### Request

Request entspricht User-Model (siehe models.md)

### Response (200)

Response entspricht User-Model (siehe models.md)

### Errors

- **400 Bad Request**: Ungültige Daten
- **409 Conflict**: E-Mail bereits vorhanden

## POST `/users/token/`

Login-Endpunkt. Gibt JWT Tokens zurück.

### Headers

Authorization: Bearer <access-token>  // Nur wenn authentifiziert
Content-Type: application/json

### Request

Request entspricht LoginDTO-Model (siehe models.md)

### Response (200)

Response entspricht AuthResponse-Model (siehe models.md)

### Errors

- **401 Unauthorized**: Falsche Zugangsdaten

## POST `/users/token/refresh/`

Erneuert den Access Token.

### Headers

Authorization: Bearer <access-token>  // Nur wenn authentifiziert
Content-Type: application/json

### Request

```json
{
  "refresh": "jwt-refresh-token"
}
```

### Response (200)

```json
{
  "access": "new-jwt-access-token"
}
```

### Errors

- **401 Unauthorized**: Ungültiger oder abgelaufener Refresh Token


## POST `/users/check-email/`

Prüft, ob eine E-Mail bereits existiert.

### Headers

Authorization: Bearer <access-token>  // Nur wenn authentifiziert
Content-Type: application/json

### Request

```json
{
  "email": "string"
}
```

### Response (200)

Response entspricht EmailCheckResponse-Model (siehe models.md)

## GET `/users/`

Gibt den aktuell eingeloggten Benutzer zurück.

### Headers

Authorization: Bearer <access-token>  // Nur wenn authentifiziert
Content-Type: application/json

### Response (200)

Response entspricht User-Model (siehe models.md)

### Errors

- **401 Unauthorized**: Nicht authentifiziert

# JWT Anforderungen

## Access Token

- Kurze Lebensdauer (z. B. 5–15 Minuten)
- Enthält mindestens:
  - user_id
  - exp(Ablaufzeit)

## Refresh Token

- Längere Lebensdauer
- Wird nur für /users/token/refresh/ verwendet