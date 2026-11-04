import type { UserResponse } from "@jobradar/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, useLocation } from "react-router-dom";
import { App } from "../App";
import { AuthProvider, ME_KEY } from "../auth/AuthProvider";
import { createI18n } from "../i18n";

export const TEST_USER: UserResponse = { id: "0b0b6b8e-0000-4000-8000-0000000000aa", email: "jane@example.com" };

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname + location.search}</span>;
}

interface Options {
  language?: "en" | "es";
  route?: string;
  /**
   * Who is logged in when the app starts. Default: a test account (already known, no request is made).
   * `null`: nobody. `"ask"`: the app asks `api.me()` like it does in the browser.
   */
  user?: UserResponse | null | "ask";
}

/** Renders the whole app on `route`; `data-testid="location"` exposes the current URL. */
export function renderApp(options: Options = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const user = options.user === undefined ? TEST_USER : options.user;
  if (user !== "ask") client.setQueryData(ME_KEY, user);
  const view = render(
    <I18nextProvider i18n={createI18n(options.language ?? "en")}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[options.route ?? "/"]}>
          <AuthProvider>
            <App />
            <LocationProbe />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { ...view, client };
}
