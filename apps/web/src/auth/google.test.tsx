import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp, TEST_USER } from "../test/render";

/** Real API client over a stubbed `fetch`, like auth.test.tsx. */

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;
let routes: Record<string, Handler>;
let calls: { method: string; path: string; body: unknown }[];
let google: boolean;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const coded = (status: number, error: string) => json({ statusCode: status, error, message: error }, status);
const noContent = () => new Response(null, { status: 204 });
const GOOGLE_ONLY = { ...TEST_USER, hasPassword: false, googleLinked: true, emailVerified: true };
const BOTH = { ...TEST_USER, hasPassword: true, googleLinked: true, emailVerified: true };

beforeEach(() => {
  calls = [];
  google = true;
  routes = {
    "GET /auth/me": () => coded(401, "unauthenticated"),
    "GET /auth/providers": () => json({ google }),
    "GET /postings": () => json({ items: [], page: 1, pageSize: 25, total: 0 }),
    "GET /profile": () => coded(404, "Not Found"),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^\/api/, "").split("?")[0] ?? "";
      const method = init?.method ?? "GET";
      calls.push({ method, path, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
      const handler = routes[`${method} ${path}`];
      return handler ? handler(init) : coded(404, `no stub for ${method} ${path}`);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("Continue with Google on login and registration", () => {
  it("shows a link to the server-side flow when Google is offered, with the page to return to", async () => {
    renderApp({ user: null, route: "/login" });
    const link = await screen.findByRole("link", { name: "Continue with Google" });
    expect(link).toHaveAttribute("href", "/api/auth/google/start?returnTo=%2F");
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("is also on the registration screen, in Spanish", async () => {
    renderApp({ user: null, route: "/register", language: "es" });
    expect(await screen.findByRole("link", { name: "Continuar con Google" })).toBeInTheDocument();
  });

  it("is hidden when the server does not offer Google, and the password form stays", async () => {
    google = false;
    renderApp({ user: null, route: "/login" });
    await screen.findByRole("heading", { name: "Log in" });
    await waitFor(() => expect(calls.some((c) => c.path === "/auth/providers")).toBe(true));
    expect(screen.queryByRole("link", { name: /Google/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  });

  it("is hidden when the server cannot be asked", async () => {
    routes["GET /auth/providers"] = () => coded(500, "boom");
    renderApp({ user: null, route: "/login" });
    await screen.findByRole("heading", { name: "Log in" });
    expect(screen.queryByRole("link", { name: /Google/ })).toBeNull();
  });

  it.each([
    ["google_link_required", /already exists.*Log in with your password/],
    ["google_taken", /already connected to another/],
    ["signup_disabled", /Registration is closed/],
    ["too_many_attempts", /Too many attempts/],
    ["google_failed", /did not complete/],
    ["something_unexpected", /did not complete/],
  ])("explains why a Google attempt failed (%s) without showing the raw code", async (code, message) => {
    renderApp({ user: null, route: `/login?error=${code}` });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert.textContent).not.toContain(code);
  });

  it("says it in Spanish", async () => {
    renderApp({ user: null, route: "/login?error=google_link_required", language: "es" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe una cuenta con ese correo");
  });
});

describe("Account screen", () => {
  it("is in the menu", async () => {
    renderApp({ route: "/settings/account" });
    expect(await screen.findByRole("heading", { name: "Account" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Account" })).toBeInTheDocument();
  });

  it("an account with a password can connect Google with a link that returns to this screen", async () => {
    renderApp({ route: "/settings/account" });
    const link = await screen.findByRole("link", { name: "Connect Google" });
    expect(link).toHaveAttribute("href", "/api/auth/google/link?returnTo=%2Fsettings%2Faccount%3Flinked%3D1");
    expect(screen.getByText("Not verified")).toBeInTheDocument();
    expect(screen.getByText("You can log in with your email and password.")).toBeInTheDocument();
  });

  it("an account with both methods disconnects Google in two steps, then asks who is logged in again", async () => {
    const user = userEvent.setup();
    let me: unknown = BOTH;
    routes["GET /auth/me"] = () => json(me);
    routes["DELETE /auth/google"] = () => {
      me = { ...BOTH, googleLinked: false };
      return noContent();
    };
    renderApp({ user: "ask", route: "/settings/account" });
    await user.click(await screen.findByRole("button", { name: "Disconnect Google" }));
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(0); // asks to confirm first
    await user.click(screen.getByRole("button", { name: "Yes, disconnect" }));
    expect(await screen.findByRole("link", { name: "Connect Google" })).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
  });

  it("a Google-only account cannot disconnect Google and can add a password", async () => {
    const user = userEvent.setup();
    let me: unknown = GOOGLE_ONLY;
    routes["GET /auth/me"] = () => json(me);
    routes["PUT /auth/password"] = () => {
      me = BOTH;
      return noContent();
    };
    renderApp({ user: "ask", route: "/settings/account" });
    expect(await screen.findByText(/Google is your only way in/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disconnect Google" })).toBeNull();

    await user.type(screen.getByLabelText("Password"), "short");
    await user.type(screen.getByLabelText("Repeat the password"), "short");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at least 10 characters");
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);

    await user.clear(screen.getByLabelText("Password"));
    await user.clear(screen.getByLabelText("Repeat the password"));
    await user.type(screen.getByLabelText("Password"), "a long enough password");
    await user.type(screen.getByLabelText("Repeat the password"), "a different one!!!");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("do not match");

    await user.clear(screen.getByLabelText("Repeat the password"));
    await user.type(screen.getByLabelText("Repeat the password"), "a long enough password");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "PUT")[0]?.body).toEqual({ password: "a long enough password" }));
    // the screen now shows the account as having a password, and Google can be disconnected
    expect(await screen.findByRole("button", { name: "Disconnect Google" })).toBeInTheDocument();
  });

  it("shows why connecting failed, and a success message after connecting", async () => {
    const { unmount } = renderApp({ route: "/settings/account?error=google_taken" });
    expect(await screen.findByRole("alert")).toHaveTextContent("already connected to another");
    unmount();
    renderApp({ route: "/settings/account?linked=1", user: BOTH });
    expect(await screen.findByRole("status")).toHaveTextContent("Google is now connected");
  });

  it("does not offer Google when the server does not, unless it is already connected", async () => {
    google = false;
    const { unmount } = renderApp({ route: "/settings/account" });
    await screen.findByRole("heading", { name: "Account" });
    await waitFor(() => expect(calls.some((c) => c.path === "/auth/providers")).toBe(true));
    expect(screen.queryByRole("link", { name: "Connect Google" })).toBeNull();
    unmount();
    renderApp({ route: "/settings/account", user: BOTH });
    expect(await screen.findByText("Connected")).toBeInTheDocument();
  });

  it("translates the server's refusal to disconnect", async () => {
    const user = userEvent.setup();
    routes["DELETE /auth/google"] = () => coded(409, "password_required");
    renderApp({ route: "/settings/account", user: BOTH });
    await user.click(await screen.findByRole("button", { name: "Disconnect Google" }));
    await user.click(screen.getByRole("button", { name: "Yes, disconnect" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Add a password first");
  });
});
