import type { UserResponse } from "@jobradar/shared";
import { createContext, useContext } from "react";

export interface AuthContextValue {
  /** The logged-in account, or null. Only meaningful once `loading` is false. */
  user: UserResponse | null;
  /** True until the first "who am I" answer arrives. */
  loading: boolean;
  /** Set when "who am I" failed for a reason other than "nobody is logged in" (e.g. the API is down). */
  error: unknown;
  retry: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
