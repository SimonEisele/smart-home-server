export interface User {
  id: number;
  username: string;
  firstname?: string;
  lastname?: string;
  email?: string;
  phone_number?: string;
  is_guest?: boolean;
}