import type { UserResponse } from "@jobradar/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { api, setUnauthorizedHandler } from "../api/client";
import { AuthContext, type AuthContextValue } from "./auth-context";

export const ME_KEY = ["me"] as const;

/**
 * Knows who is logged in. The session itself is an httpOnly cookie, so the app only holds the account's
 * id and email. Whenever the account changes (login, logout, session lost) every cached answer of the
 * previous account is dropped, so another person on the same browser never sees it.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ME_KEY, queryFn: () => api.me(), staleTime: Infinity, gcTime: Infinity, retry: false });

  const setUser = useCallback(
    (user: UserResponse | null) => {
      // Drop every cached answer except "who am I". Mutations are left alone: the one that just logged in is
      // still finishing, and clearing it would leave the form stuck on "Logging in…".
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_KEY[0] });
      queryClient.setQueryData(ME_KEY, user);
    },
    [queryClient],
  );

  // A protected call that finds the session gone sends the user back to the login screen.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, [setUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: me.data ?? null,
      loading: me.isPending,
      error: me.error,
      retry: () => void me.refetch(),
      login: async (email, password) => setUser(await api.login(email, password)),
      register: async (email, password) => setUser(await api.register(email, password)),
      refreshUser: async () => {
        await me.refetch();
      },
      logout: async () => {
        try {
          await api.logout();
        } catch {
          // The server could not be told. The browser forgets the account anyway: the cookie is httpOnly and
          // expires by itself, and being unable to log out must never trap the user in the app.
        }
        setUser(null);
      },
    }),
    [me, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
