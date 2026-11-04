import { expect, test, type Page } from "@playwright/test";
import { makePdf } from "../../api/test/helpers/make-pdf";

/**
 * Main flows of the dashboard against the real API and database, with a deterministic AI (see apps/api/e2e).
 * Each test gets a fresh browser context (no cookies, no local storage), so it logs in again.
 * The tests run in order and share data through the accounts they create.
 */
const ACCOUNT_A = { email: "ana@example.com", password: "correct-horse-battery" };
const ACCOUNT_B = { email: "bruno@example.com", password: "another-good-password" };
const ACCOUNT_C = { email: "carla@example.com", password: "a-third-good-password" };

async function register(page: Page, account: { email: string; password: string }) {
  await page.goto("/register");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel(/^Password/).fill(account.password);
  await page.getByLabel("Repeat the password").fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
}

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Log in" }).click();
  // The app returns to whatever page sent us to the login screen, so do not assume "/".
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL("/login");
}

test.describe.serial("accounts", () => {
  test("anonymous visitors are sent to the login screen", async ({ page }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create one" })).toBeVisible();
  });

  test("account A saves a profile, pastes postings, scores them, filters and switches language", async ({ page }) => {
    await register(page, ACCOUNT_A);
    // A new account sees the shared catalog straight away, and is asked to fill in its profile.
    await expect(page.getByTestId("posting-row")).toHaveCount(2);
    await expect(page.getByText("Fill in your profile to see which jobs fit you.")).toBeVisible();

    // 1. No profile yet for this account.
    await page.goto("/profile");
    await expect(page.getByText("No profile yet")).toBeVisible();

    // 2. Fill in and save the profile.
    await page.getByRole("combobox", { name: "Stack" }).fill("TypeScript");
    await page.getByRole("combobox", { name: "Stack" }).press("Enter");
    await page.getByRole("combobox", { name: "Allowed locations" }).fill("bolivia");
    await page.getByRole("combobox", { name: "Allowed locations" }).press("Enter");
    await page.getByLabel("Seniority").selectOption("senior");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status")).toContainText("Profile saved (version 1)");

    // 3. Paste a posting with only its text and score it right away: it is a fit.
    await page.getByRole("link", { name: "Add posting" }).click();
    await page.getByLabel("Posting text").fill("Senior TypeScript Developer\nRemote in LATAM. NestJS and PostgreSQL.");
    await page.getByLabel("Score it right away").check();
    await page.getByRole("button", { name: "Save posting" }).click();
    await expect(page).toHaveURL("/");
    const fitRow = page.getByTestId("posting-row").filter({ hasText: "Senior TypeScript Developer" });
    await expect(fitRow.getByTestId("verdict")).toHaveText(/Fit/);
    await expect(fitRow.getByText("Pasted by hand")).toBeVisible();

    // 4. Paste a second posting without scoring it: it stays "Not scored".
    await page.getByRole("link", { name: "Add posting" }).click();
    await page.getByLabel("Posting text").fill("Platform Engineer\nProficient English (C2) required.");
    await page.getByRole("button", { name: "Save posting" }).click();
    const pendingRow = page.getByTestId("posting-row").filter({ hasText: "Platform Engineer" });
    await expect(pendingRow.getByTestId("verdict")).toHaveText(/Not scored/);

    // 5. Pasting the very same text again is detected as a duplicate.
    await page.getByRole("link", { name: "Add posting" }).click();
    await page.getByLabel("Posting text").fill("Platform Engineer\nProficient English (C2) required.");
    await page.getByRole("button", { name: "Save posting" }).click();
    await expect(page.getByText("This posting is already saved.")).toBeVisible();

    // 6. Score it from the list: the C2 requirement makes it a reject with an English blocker.
    await page.getByRole("link", { name: "Postings" }).click();
    await pendingRow.getByRole("button", { name: "Score now" }).click();
    await expect(pendingRow.getByTestId("verdict")).toHaveText(/Reject/);
    await pendingRow.getByRole("button", { name: "Details" }).click();
    await expect(pendingRow.getByText("Proficient English (C2) required")).toBeVisible();

    // 7. Filter by verdict: the URL keeps the filter and only the fit remains.
    await page.getByLabel("Verdict").selectOption("fit");
    await expect(page).toHaveURL(/verdict=fit/);
    await expect(page.getByTestId("posting-row")).toHaveCount(1);
    await expect(page.getByText("Senior TypeScript Developer")).toBeVisible();

    // 8. Switch to Spanish without reloading, and it survives a reload.
    await page.getByRole("button", { name: "Language" }).click();
    await page.getByRole("option", { name: "Español" }).click();
    await expect(page.getByRole("link", { name: "Ofertas" })).toBeVisible();
    await expect(page.getByTestId("verdict")).toHaveText(/Encaja/);
    await page.reload();
    await expect(page.getByRole("link", { name: "Perfil" })).toBeVisible();
  });

  test("account B sees none of account A's data, and A still sees its own after logging back in", async ({ page }) => {
    // B registers: a brand-new account starts empty.
    await register(page, ACCOUNT_B);
    await expect(page.getByTestId("posting-row")).toHaveCount(2); // only the shared catalog, none of A's pasted postings
    await expect(page.getByText("Senior TypeScript Developer")).toHaveCount(0);

    await page.goto("/profile");
    await expect(page.getByText("No profile yet")).toBeVisible();

    await logout(page);

    // A logs back in and finds its postings and profile untouched.
    await login(page, ACCOUNT_A);
    await page.goto("/");
    const fitRow = page.getByTestId("posting-row").filter({ hasText: "Senior TypeScript Developer" });
    await expect(fitRow.getByTestId("verdict")).toHaveText(/Fit/);

    await page.goto("/profile");
    await expect(page.getByRole("listitem").filter({ hasText: "TypeScript" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Bolivia" })).toBeVisible();
  });

  /**
   * Runs after the scenarios above (profile version 1 already exists for account A).
   * The API reads the PDF for real; only the AI answer is the deterministic fake.
   */
  test("import a CV, review the draft, complete it and save", async ({ page }) => {
    await login(page, ACCOUNT_A);
    await page.goto("/profile");
    await expect(page.getByText("Profile saved")).toHaveCount(0);

    // The privacy notice is shown before anything is uploaded.
    await expect(page.getByRole("note")).toContainText("sent to the AI provider");

    const cv = makePdf([["Backend developer", "TypeScript, NestJS, PostgreSQL", "BSc Informatics, UMSA"]]);
    await page.getByLabel("CV file (PDF)").setInputFiles({ name: "cv.pdf", mimeType: "application/pdf", buffer: cv });
    await page.getByRole("button", { name: "Read my CV" }).click();

    // The draft replaces the form, but nothing is saved yet.
    await expect(page.getByText(/Draft from your CV/)).toBeVisible();
    await expect(page.getByText("No country was found")).toBeVisible();
    await expect(page.getByText("Seniority was estimated")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Company" })).toHaveValue("Acme");
    await expect(page.getByRole("textbox", { name: "Institution" })).toHaveValue("UMSA");
    // jobs keep their start month and year, picked with selects
    const jobStart = page.getByRole("group", { name: "Start" }).first();
    await expect(jobStart.getByLabel("Year")).toHaveValue("2020");
    await expect(jobStart.getByLabel("Month")).toHaveValue("3");
    await expect(page.getByText("AWS Cloud Practitioner")).toBeVisible();
    await expect(page.getByLabel("Seniority")).toHaveValue("senior");

    // The CV had no country, so saving is refused until the candidate adds one.
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText(/Add at least one allowed location/)).toBeVisible();

    await page.getByRole("combobox", { name: "Allowed locations" }).fill("bolivia");
    await page.getByRole("combobox", { name: "Allowed locations" }).press("Enter");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Profile saved (version 2)" })).toBeVisible();
    await expect(page.getByText(/Draft from your CV/)).toHaveCount(0);

    // It is really stored: a reload shows the imported background.
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Company" })).toHaveValue("Acme");
    await expect(page.getByRole("combobox", { name: "Language" }).first()).toHaveValue("English");

    // And the preview of an unsaved draft can be discarded.
    await page.getByLabel("CV file (PDF)").setInputFiles({ name: "cv.pdf", mimeType: "application/pdf", buffer: cv });
    await page.getByRole("button", { name: "Read my CV" }).click();
    await page.getByRole("button", { name: "Discard draft" }).click();
    await expect(page.getByText(/Draft from your CV/)).toHaveCount(0);
  });

  /** The path of a brand-new person: look around, fill in the profile, get their own verdicts. */
  test("a new account sees the shared jobs, fills in its profile and scores the newest jobs; technical screens stay hidden", async ({ page }) => {
    await register(page, ACCOUNT_C);
    await expect(page.getByTestId("posting-row")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Score the newest jobs" })).toHaveCount(0);

    // The technical screens are for administrators.
    await expect(page.getByRole("link", { name: "API tokens" })).toHaveCount(0);
    await page.goto("/settings/tokens");
    await expect(page).toHaveURL("/");

    // The banner leads to the profile.
    await page.getByRole("link", { name: "Fill in my profile" }).click();
    await expect(page).toHaveURL("/profile");
    await page.getByRole("combobox", { name: "Stack" }).fill("TypeScript");
    await page.getByRole("combobox", { name: "Stack" }).press("Enter");
    await page.getByRole("combobox", { name: "Allowed locations" }).fill("bolivia");
    await page.getByRole("combobox", { name: "Allowed locations" }).press("Enter");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status")).toContainText("Profile saved (version 1)");

    // From the confirmation straight to the jobs, now scored on demand.
    await page.getByRole("link", { name: "See the jobs" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByText("Fill in your profile to see which jobs fit you.")).toHaveCount(0);
    await page.getByRole("button", { name: "Score the newest jobs" }).click();
    await expect(page.getByText("Scored 2 jobs.")).toBeVisible();
    await expect(page.getByTestId("posting-row").filter({ hasText: "Staff Backend Engineer" }).getByTestId("verdict")).toHaveText(/Fit/);
    await expect(page.getByTestId("posting-row").filter({ hasText: "Support Lead" }).getByTestId("verdict")).toHaveText(/Reject/);

    // Verdicts are personal: another account still sees the shared jobs unscored.
    await logout(page);
    await login(page, ACCOUNT_B);
    await expect(page.getByTestId("posting-row").filter({ hasText: "Staff Backend Engineer" }).getByTestId("verdict")).toHaveText(/Not scored/);
  });
});
