# Datenmodelle

Dieses Dokument beschreibt die vom Frontend erwarteten Datenmodelle.
Das Backend liefert diese Strukturen exakt in der beschriebenen Form.

---

## General
- Alle Zeitstempel sind im ISO-8601-Format (`YYYY-MM-DDTHH:mm:ssZ`)
- Alle IDs sind UUID v4
- Frontend verwendet camelCase-Feldnamen; Backend serialisiert entsprechend
- Alle Responses sind JSON

## Auth

### User

```ts
interface User {
  data: {
    id: UUID;                 // Eindeutige Benutzer-ID (UUID)
    email: string;            // Login-Identifikation
    first_name: string;       // Vorname
    last_name: string;        // Nachname
    phone_number?: string;    //Telefonnummer
    phone_verified: boolean;  // Telefonnummer verifiziert
    created_at: string;       // ISO-8601
  }
}
```

### AuthResponse

```ts
interface AuthResponse {
  data: {
    access_token: string;     // Access Token
    refresh_token: string;    // Refresh Token
    user?: User;              // User
  }
}
```

### LoginDTO

```ts
interface LoginDTO {
  data: {
    email: string;
    password: string;
    rememberMe: boolean;
  }
}
```

### EmailCheckResponse

```ts
interface EmailCheckResponse {
  data: {
    exists: boolean;
  }
}
```

---

## Dashboard

### DashboardItem

```ts
interface DashboardItem {
  id: string;
  widget_type: string;
  x: number;
  y: number;
  cols: number;
  rows: number;
  minItemCols: number;
  maxItemCols?: number;
  minItemRows: number;
  maxItemRows?: number;
  title?: string;
  icon?: string;
  config?: any;
}
```

---

## Notes

### NoteCategory

```ts
interface NoteCategory {
  id: string;
  title: string;
  parentCategoryId?: string;
  order?: number;
}
```

### Note

```ts
interface Note {
  id: string;
  title: string;
  content: string;
  userID?: string;
  categoryID?: string;
  global?: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

## Todos

```ts
interface Todo {
  id: string;
  title: string;
  done: boolean;
  startDate?: string;
  dueDate?: string;
  progress?: number;
  durationMinutes?: number;
  userID: string;
  global?: boolean;
}
```

---

## Shopping List

```ts
interface ShoppingItem {
  id: string;
  name: string;
  quantity?: number;
  unit?: string;
  checked: boolean;
  userID?: string;
  global?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
```

---

## Recipes

```ts
interface RecipeIngredient {
  name: string;
  quantityPerPerson?: number;
  unit?: string;
}

interface Recipe {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  durationMinutes?: number;
  ingredients: RecipeIngredient[];
  createdAt?: string;
  updatedAt?: string;
}
```

---

## Menu Plan

```ts
interface Ingredient {
  name: string;
  quantityPerPerson: number;
  unit: string;
}

interface Dish {
  id: string;
  name: string;
  recipe?: string; // Recipe.id
  ingredients: Ingredient[];
}

interface Menu {
  id: string;
  date: string; // YYYY-MM-DD
  lunch?: Dish;
  dinner?: Dish;
}
```

---

## Calendar

```ts
interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string; // ISO-8601
  end?: string;  // ISO-8601
  allDay?: boolean;
  location?: string;
  createdAt?: string;
  updatedAt?: string;
}
```

---

## Smart Home

```ts
interface SmartDeviceState {
  [key: string]: string | number | boolean | null;
}

interface SmartDevice {
  id: string;
  name: string;
  deviceType: string;
  room?: string;
  state: SmartDeviceState;
  createdAt?: string;
  updatedAt?: string;
}
```

---

## Weather

```ts
interface CurrentWeather {
  temperature: number;
  weatherCode: number;
  precipitation: number;
  windSpeed: number;
  windDirection: number;
}

interface HourlyWeather {
  date: string;
  time: string;
  temperature: number;
  weatherCode: number;
  precipitation: number;
  windSpeed: number;
  windDirection: number;
}

interface DailyWeather {
  date: string;
  minTemperature: number;
  maxTemperature: number;
  weatherCode: number;
  precipitation: number;
}

interface WeatherData {
  current: CurrentWeather;
  hourly: HourlyWeather[];
  daily: DailyWeather[];
}
```