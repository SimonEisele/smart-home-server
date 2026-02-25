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

## Regeln

- HTTP Status Codes müssen korrekt gesetzt sein
- Responses sind immer JSON
- Kein HTML, kein Plaintext
- Keine Stacktraces im Response
- Fehlercodes sind stabil und maschinenlesbar