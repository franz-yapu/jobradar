import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ClientModule from "../api/client";
import { ApiError } from "../api/client";
import { renderApp } from "../test/render";

const { listApiTokens, createApiToken, revokeApiToken } = vi.hoisted(() => ({
  listApiTokens: vi.fn(),
  createApiToken: vi.fn(),
  revokeApiToken: vi.fn(),
}));
vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { listApiTokens, createApiToken, revokeApiToken },
}));

const ACTIVE = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "n8n",
  prefix: "jr_abcde",
  createdAt: "2026-11-04T10:00:00.000Z",
  lastUsedAt: "2026-11-04T12:30:00.000Z",
  revokedAt: null,
};
const REVOKED = { ...ACTIVE, id: "22222222-2222-4222-8222-222222222222", name: "old script", prefix: "jr_zzzzz", lastUsedAt: null, revokedAt: "2026-11-04T11:00:00.000Z" };
const SECRET = "jr_super-secret-value-that-is-shown-once";

describe("API tokens screen", () => {
  beforeEach(() => {
    listApiTokens.mockReset().mockResolvedValue([ACTIVE, REVOKED]);
    createApiToken.mockReset().mockResolvedValue({ ...ACTIVE, id: "33333333-3333-4333-8333-333333333333", name: "ci", lastUsedAt: null, token: SECRET });
    revokeApiToken.mockReset().mockResolvedValue(undefined);
  });

  it("lists the tokens with prefix, dates and status, and never a secret", async () => {
    renderApp({ route: "/settings/tokens" });
    const rows = await screen.findAllByTestId("token-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText("n8n")).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText("jr_abcde…")).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText("Active")).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText(/last used/)).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("Revoked")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText(/never used/)).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).queryByRole("button", { name: /Revoke/ })).toBeNull();
    expect(screen.queryByTestId("new-token")).toBeNull();
    expect((document.body.textContent ?? "").replace("jr_your-token", "")).not.toMatch(/jr_[A-Za-z0-9_-]{20,}/);
  });

  it("shows the empty state", async () => {
    listApiTokens.mockResolvedValue([]);
    renderApp({ route: "/settings/tokens" });
    expect(await screen.findByText("No tokens yet.")).toBeInTheDocument();
  });

  it("creates a token, shows its secret once with a warning, and hides it when dismissed", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/settings/tokens" });
    await screen.findAllByTestId("token-row");

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "ci");
    await user.click(screen.getByRole("button", { name: "Create token" }));

    expect(await screen.findByTestId("new-token")).toHaveTextContent(SECRET);
    expect(screen.getByText(/shown only this once/)).toBeInTheDocument();
    // the guide's .env line now carries the real token, ready to paste
    expect(screen.getByText(`JOBRADAR_API_TOKEN=${SECRET}`)).toBeInTheDocument();
    expect(createApiToken).toHaveBeenCalledWith("ci");

    await user.click(screen.getByRole("button", { name: "I have saved it" }));
    expect(screen.queryByTestId("new-token")).toBeNull();
    expect(screen.queryByText(SECRET)).toBeNull();
    // after dismissing, the guide falls back to a placeholder: the secret is not kept anywhere
    expect(screen.getByText("JOBRADAR_API_TOKEN=jr_your-token")).toBeInTheDocument();
  });

  it("walks through connecting n8n in four steps, with a placeholder until a token is created", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    renderApp({ route: "/settings/tokens" });
    await screen.findAllByTestId("token-row");

    expect(screen.getByRole("heading", { name: "Connect n8n in 4 steps" })).toBeInTheDocument();
    const steps = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(steps).toEqual(["Create a token", "Put the token in your .env", "Restart n8n", "Import and activate the workflows"]);
    expect(screen.getByText("JOBRADAR_API_TOKEN=jr_your-token")).toBeInTheDocument();
    expect(screen.getByText("docker compose up -d n8n")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy the command" }));
    expect(writeText).toHaveBeenCalledWith("docker compose up -d n8n");
  });

  it("explains the steps in Spanish", async () => {
    renderApp({ route: "/settings/tokens", language: "es" });
    expect(await screen.findByRole("heading", { name: "Conecta n8n en 4 pasos" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reinicia n8n" })).toBeInTheDocument();
  });

  it("copies the secret to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    renderApp({ route: "/settings/tokens" });
    await screen.findAllByTestId("token-row");
    await user.click(screen.getByRole("button", { name: "Create token" }));
    await screen.findByTestId("new-token");
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(SECRET);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("does not create a token without a name", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/settings/tokens" });
    await screen.findAllByTestId("token-row");
    await user.clear(screen.getByLabelText("Name"));
    expect(screen.getByRole("button", { name: "Create token" })).toBeDisabled();
    expect(createApiToken).not.toHaveBeenCalled();
  });

  it("explains the limit of active tokens", async () => {
    createApiToken.mockRejectedValue(new ApiError(409, "too_many_tokens", "limit"));
    renderApp({ route: "/settings/tokens", language: "es" });
    await screen.findAllByTestId("token-row");
    await userEvent.click(screen.getByRole("button", { name: "Crear token" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya tienes 10 tokens activos");
  });

  it("asks for confirmation before revoking, and can be cancelled", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/settings/tokens" });
    await screen.findAllByTestId("token-row");

    await user.click(screen.getByRole("button", { name: "Revoke n8n" }));
    expect(revokeApiToken).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Revoke n8n" })).toBeInTheDocument();
    expect(revokeApiToken).not.toHaveBeenCalled();
  });

  it("revokes a token after confirming and reloads the list", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/settings/tokens" });
    await screen.findAllByTestId("token-row");
    const callsBefore = listApiTokens.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Revoke n8n" }));
    await user.click(screen.getByRole("button", { name: "Yes, revoke" }));

    await waitFor(() => expect(revokeApiToken).toHaveBeenCalledWith(ACTIVE.id));
    await waitFor(() => expect(listApiTokens.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("is reachable from the sidebar", async () => {
    renderApp({ route: "/" });
    await userEvent.click(await screen.findByRole("link", { name: "API tokens" }));
    expect(await screen.findByRole("heading", { name: "API tokens" })).toBeInTheDocument();
  });
});
