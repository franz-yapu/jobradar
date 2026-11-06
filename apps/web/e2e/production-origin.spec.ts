import { expect, test } from "@playwright/test";

/**
 * Smoke test of the production-like origin: the Caddy image in front of the API image (SDD-012).
 * Run with E2E_BASE_URL=http://localhost:<port> (see deploy/README.md); skipped otherwise.
 * It checks what only the real stack can break: static serving, the /api route, SPA fallback, headers, cookies.
 */
test.skip(!process.env["E2E_BASE_URL"], "needs E2E_BASE_URL (a running production-like stack)");

const account = { email: `smoke-${Date.now()}@example.com`, password: "correct-horse-battery" };

test("security headers are set on the app and on the API", async ({ request }) => {
  for (const path of ["/", "/api/health"]) {
    const res = await request.get(path);
    const headers = res.headers();
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["strict-transport-security"], path).toContain("max-age=");
    expect(headers["content-security-policy"], path).toContain("script-src 'self'");
    expect(headers["server"], path).toBeUndefined();
  }
});

test("/api reaches the API; docs are not published", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: "ok", db: "up" });
  expect((await request.get("/api/docs")).status()).toBe(404);
  expect((await request.get("/api/profile")).status()).toBe(401);
  expect((await request.post("/api/internal/scoring/jobs/00000000-0000-4000-8000-000000000000/process")).status()).toBe(401);
});

test("a deep link loads the app (SPA fallback) and the hashed assets are cached for a year", async ({ page, request }) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/Content Security Policy|Refused to/i.test(msg.text())) violations.push(msg.text());
  });
  await page.goto("/profile");
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  expect(violations, "no CSP violation while loading the app").toEqual([]);

  const html = await (await request.get("/")).text();
  const asset = /\/assets\/[^"']+\.js/.exec(html)?.[0];
  expect(asset, "the index references a hashed script").toBeTruthy();
  const res = await request.get(asset ?? "/");
  expect(res.headers()["cache-control"]).toContain("immutable");
  expect((await request.get("/")).headers()["cache-control"]).toContain("no-cache");
});

test("registration and sign-in work through the proxy, with a Secure httpOnly session cookie", async ({ page, context }) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/Content Security Policy|Refused to/i.test(msg.text())) violations.push(msg.text());
  });
  await page.goto("/register");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel(/^Password/).fill(account.password);
  await page.getByLabel("Repeat the password").fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();

  const cookie = (await context.cookies()).find((c) => c.name === "jr_session");
  expect(cookie, "session cookie").toBeDefined();
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax" });

  await page.reload();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL("/login");
  expect(violations, "no CSP violation during the flow").toEqual([]);
});
