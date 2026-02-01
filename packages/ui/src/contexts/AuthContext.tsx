import { createContext, useContext } from "react";

export interface AuthUser {
  id: string | number;
  email: string;
  name: string;
  avatar?: string;
  role?: string;
  credits?: number;
  plan?: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
  refreshUser?: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  logout: async () => {},
});

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}
