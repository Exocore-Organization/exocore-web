export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  role: "admin" | "developer" | "viewer";
}

export interface Session {
  token: string;
  user: User;
  expiresAt: string;
}

export interface AuthRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: User;
  error?: string;
}
