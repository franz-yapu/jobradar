import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

/** What the server offers (today: Google yes or no). If it cannot be asked, the password form simply stands alone. */
export function useProviders(): { google: boolean } {
  const query = useQuery({ queryKey: ["providers"], queryFn: () => api.providers(), staleTime: 5 * 60 * 1000, retry: false });
  return { google: query.data?.google ?? false };
}
