# API Konventionen

Dieses Dokument definiert einheitliche Regeln für alle API Responses.
Frontend und Backend verlassen sich auf diese Struktur.

## ✅ Erfolgreiche Responses

### Einzelnes Objekt

```json
{
  "data": {
    "id": "string",
    "...": "..."
  }
}
```

### Liste von Objekten

```json
{
  "data": [
    { "id": "string" },
    { "id": "string" }
  ]
}
```

### Erfolg ohne Daten (Z.B. DELETE)

```json
{
  "success": true
}
```

## ❌ Fehler-Responses

Alle Fehlerantworten folgen immer diesem Format:
```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": "string | null"
  }
}
```

### Beispiele

#### 401 Unathorized

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required",
    "details": null
  }
}
```

#### 400 Validation Error
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": "email is required"
  }
}
```

#### 404 Not-Found
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "details": null
  }
}
```

#### 400 mit Feldfehlern

Bei Serializer-Fehlern enthält `details` die Fehler pro Feld, `message` alle
Texte zusammengefasst für die Anzeige:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dieses Feld darf nicht leer sein.",
    "details": { "title": ["Dieses Feld darf nicht leer sein."] }
  }
}
```

### Fehlercodes

| Status | `code` |
| --- | --- |
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHORIZED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |

### Umsetzung

- Backend: `backend/api_errors.py` wandelt alle DRF-Fehler in dieses Format um
  (`EXCEPTION_HANDLER`); eigene Fehler in Views über `api_error(message, status)`.
  Generische Views können `backend.api.DataEnvelopeMixin` nutzen, um Erfolge in
  `{"data": ...}` bzw. `{"success": true}` zu verpacken.
- Frontend: `apiErrorMessage(error, fallback)` aus `shared/utils/api-error.ts`
  liest `error.message`.
- Listen dürfen neben `data` Metadaten liefern (z. B. `count`, `warnings` beim
  Menüplan-Export).

## Regeln

- HTTP Status Codes müssen korrekt gesetzt sein
- Responses sind immer JSON
- Kein HTML, kein Plaintext
- Keine Stacktraces im Response
- Fehlercodes sind stabil und maschinenlesbar