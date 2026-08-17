export interface Household {
  id: string;
  name: string;
  description: string;
  invite_code: string;
  role: 'owner' | 'admin' | 'member';
  member_count: number;
}

export interface HouseholdMember {
  id: string;
  user_id: string;
  user_email: string;
  user_first_name: string;
  user_last_name: string;
  user_is_household_account: boolean;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
}

export interface User {
  id: string;                         // UUID
  email: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
  active_household_id?: string | null;
  households: Household[];
  is_household_account?: boolean;
  created_at?: string;                // ISO-8601
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