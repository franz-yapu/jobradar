import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { returnPath } from "../pages/LoginPage";
import { renderApp, TEST_USER } from "../test/render";

/** These tests use the real API client over a stubbed `fetch`, so cookies, 401s and 204s behave like in the browser. */

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;
let routes: Record<string, Handler>;
let calls: { method: string; path: string; body: unknown }[];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const coded = (status: number, error: string) => json({ statusCode: status, error, message: error }, status);
const EMPTY_PAGE = { items: [], page: 1, pageSize: 25, total: 0 };

beforeEach(() => {
  calls = [];
  routes = {
    "GET /auth/me": () => coded(401, "unauthenticated"),
    "GET /postings": () => json(EMPTY_PAGE),
    "GET /profile": () => coded(404, "Not Found"),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^\/api/, "").split("?")[0] ?? "";
      const method = init?.method ?? "GET";
      calls.push({ method, path, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
      const handler = routes[`${method} ${path}`];
      if (!handler) return coded(404, `no stub for ${method} ${path}`);
      return handler(init);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const called = (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);

describe("returnPath", () => {
  it("only returns to local paths", () => {
    expect(returnPath({ from: "/profile?x=1" })).toBe("/profile?x=1");
    for (const bad of [undefined, null, {}, { from: 5 }, { from: "https://evil.example" }, { from: "//evil.example" }, { from: "javascript:alert(1)" }]) {
      expect(returnPath(bad)).toBe("/");
    }
  });
});

describe("guarding the app", () => {
  it("sends an anonymous visitor to the login screen", async () => {
    renderApp({ user: "ask" });
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
    expect(called("GET", "/postings")).toHaveLength(0); // no protected data is requested without a session
  });

  it("returns to the page that was asked for once logged in", async () => {
    routes["POST /auth/login"] = () => json(TEST_USER);
    const user = userEvent.setup();
    renderApp({ user: "ask", route: "/profile" });

    await user.type(await screen.findByLabelText("Email"), "jane@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/profile"));
    expect(await screen.findByRole("heading", { name: "Your profile" })).toBeInTheDocument();
    expect(called("POST", "/auth/login")[0]?.body).toEqual({ email: "jane@example.com", password: "correct horse battery" });
  });

  it("does not show the login screen to someone who is already logged in", async () => {
    routes["GET /auth/me"] = () => json(TEST_USER);
    renderApp({ user: "ask", route: "/login" });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/));
    expect(await screen.findByRole("heading", { name: "Postings" })).toBeInTheDocument();
  });

  it("explains that the API is down and can try again", async () => {
    let up = false;
    routes["GET /auth/me"] = () => (up ? json(TEST_USER) : Promise.reject(new TypeError("fetch failed")));
    renderApp({ user: "ask" });
    expect(await screen.findByRole("alert")).toHaveTextContent("The API is unreachable");

    up = true;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Postings" })).toBeInTheDocument();
  });
});

describe("logging in", () => {
  it("shows a clear message for a wrong password and stays on the screen", async () => {
    routes["POST /auth/login"] = () => coded(401, "invalid_credentials");
    const user = userEvent.setup();
    renderApp({ user: null, route: "/login" });
    await user.type(screen.getByLabelText("Email"), "jane@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password.");
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
  });

  it("tells the user to wait when there were too many attempts, in Spanish", async () => {
    routes["POST /auth/login"] = () => coded(429, "too_many_attempts");
    const user = userEvent.setup();
    renderApp({ user: null, route: "/login", language: "es" });
    await user.type(screen.getByLabelText("Correo electrónico"), "jane@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "wrong");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos");
  });

  it("uses autocomplete hints so password managers work", () => {
    renderApp({ user: null, route: "/login" });
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });
});

describe("creating an account", () => {
  async function fill(email: string, password: string, confirm: string) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), email);
    await user.type(screen.getByLabelText(/^Password/), password);
    await user.type(screen.getByLabelText("Repeat the password"), confirm);
    await user.click(screen.getByRole("button", { name: "Create account" }));
  }

  it("registers, logs in and lands on the postings", async () => {
    routes["POST /auth/register"] = () => json(TEST_USER, 201);
    renderApp({ user: null, route: "/register" });
    await fill("jane@example.com", "correct horse battery", "correct horse battery");

    expect(await screen.findByRole("heading", { name: "Postings" })).toBeInTheDocument();
    expect(called("POST", "/auth/register")[0]?.body).toEqual({ email: "jane@example.com", password: "correct horse battery" });
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
  });

  it("checks the password before sending anything", async () => {
    renderApp({ user: null, route: "/register" });
    await fill("jane@example.com", "short", "short");
    expect(await screen.findByRole("alert")).toHaveTextContent("at least 10 characters");

    await userEvent.clear(screen.getByLabelText(/^Password/));
    await userEvent.clear(screen.getByLabelText("Repeat the password"));
    await userEvent.type(screen.getByLabelText(/^Password/), "correct horse battery");
    await userEvent.type(screen.getByLabelText("Repeat the password"), "correct horse batterz");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("do not match");
    expect(called("POST", "/auth/register")).toHaveLength(0);
  });

  it("says when the email already has an account, and when registration is closed", async () => {
    routes["POST /auth/register"] = () => coded(409, "email_taken");
    renderApp({ user: null, route: "/register" });
    await fill("jane@example.com", "correct horse battery", "correct horse battery");
    expect(await screen.findByText("There is already an account with that email.")).toBeInTheDocument();
  });

  it("explains a closed registration", async () => {
    routes["POST /auth/register"] = () => coded(403, "signup_disabled");
    renderApp({ user: null, route: "/register" });
    await fill("jane@example.com", "correct horse battery", "correct horse battery");
    expect(await screen.findByText("Registration is closed on this server.")).toBeInTheDocument();
  });

  it("links between login and registration", async () => {
    renderApp({ user: null, route: "/login" });
    await userEvent.click(screen.getByRole("link", { name: "Create one" }));
    expect(await screen.findByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Log in" }));
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });
});

describe("leaving", () => {
  it("logs out on the server, returns to the login screen and forgets the account's data", async () => {
    routes["POST /auth/logout"] = () => new Response(null, { status: 204 });
    const { client } = renderApp({ route: "/" });
    await screen.findByRole("heading", { name: "Postings" });
    await waitFor(() => expect(client.getQueryCache().find({ queryKey: ["postings"], exact: false })).toBeDefined());

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(called("POST", "/auth/logout")).toHaveLength(1);
    // nothing of the previous account stays cached for the next person on this browser
    expect(client.getQueryCache().find({ queryKey: ["postings"], exact: false })).toBeUndefined();
  });

  it("still leaves the account when the logout call fails", async () => {
    routes["POST /auth/logout"] = () => Promise.reject(new TypeError("fetch failed"));
    renderApp({ route: "/" });
    await screen.findByRole("heading", { name: "Postings" });
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });

  it("sends the user to the login screen when the session ends in the middle of using the app", async () => {
    routes["GET /postings"] = () => coded(401, "unauthenticated");
    const { client } = renderApp({ route: "/" });
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(client.getQueryData(["me"])).toBeNull();
  });

  it("shows the logged-in account's email in the header", async () => {
    renderApp({ route: "/" });
    await screen.findByRole("heading", { name: "Postings" });
    expect(screen.getByText(TEST_USER.email)).toBeInTheDocument();
  });
});
