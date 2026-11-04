import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, useLocation } from "react-router-dom";
import { App } from "../App";
import { createI18n } from "../i18n";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

/** Renders the whole app on `route`; `data-testid="location"` exposes the current URL. */
export function renderApp(options: { language?: "en" | "es"; route?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <I18nextProvider i18n={createI18n(options.language ?? "en")}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[options.route ?? "/"]}>
          <App />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}
