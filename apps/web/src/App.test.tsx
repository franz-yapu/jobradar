import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api/client";
import type * as ClientModule from "./api/client";
import { App } from "./App";
import { createI18n } from "./i18n";

const { listPostings } = vi.hoisted(() => ({ listPostings: vi.fn() }));
vi.mock("./api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { listPostings },
}));

function renderApp(language: "en" | "es" = "en") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={createI18n(language)}>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const SCORED = {
  id: "0b0b6b8e-0000-4000-8000-000000000001",
  title: "Backend Engineer",
  company: "Acme",
  latestScore: { verdict: "fit", reasons: [], blockers: [], scoredAt: "2026-11-04T10:00:00.000Z" },
};

describe("App", () => {
  beforeEach(() => listPostings.mockReset());

  it("lists postings with their verdict", async () => {
    listPostings.mockResolvedValue({ items: [SCORED, { ...SCORED, id: "2", title: "Data Engineer", latestScore: null }], page: 1, pageSize: 25, total: 2 });
    renderApp();
    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText("Fit")).toBeInTheDocument();
    expect(screen.getByText("Not scored")).toBeInTheDocument();
  });

  it("switches the whole UI to Spanish and back without reloading", async () => {
    listPostings.mockResolvedValue({ items: [SCORED], page: 1, pageSize: 25, total: 1 });
    renderApp("en");
    await screen.findByText("Backend Engineer");
    expect(screen.getByRole("link", { name: "Profile" })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox"), "es");
    expect(screen.getByRole("link", { name: "Perfil" })).toBeInTheDocument();
    expect(screen.getByText("Encaja")).toBeInTheDocument();
    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox"), "en");
    expect(screen.getByRole("link", { name: "Profile" })).toBeInTheDocument();
  });

  it("shows a translated error with a retry when the API is down", async () => {
    listPostings.mockRejectedValueOnce(new ApiError(0, "network_error", "The API is unreachable"));
    listPostings.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
    renderApp("es");
    expect(await screen.findByRole("alert")).toHaveTextContent("No se puede conectar con la API");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getByText("Todavía no hay ofertas.")).toBeInTheDocument());
  });
});
