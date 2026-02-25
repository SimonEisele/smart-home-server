export interface User {
  id: string;                         // UUID
  email: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
  phone_verified: boolean;
  created_at: string;                 // ISO-8601
}

export interface AuthResponse {
  data: {
    access_token: string;
    refresh_token: string;
    user?: User;
  }
}

export interface LoginDTO {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface EmailCheckResponse {
  data: {
    exists: boolean;
  }
}