import { expect, test } from "@playwright/test";

/**
 * Main flow of the dashboard against the real API and database, with a deterministic AI (see apps/api/e2e).
 * One ordered scenario: each step builds on the data of the previous one.
 */
test("save profile, paste postings, score them, filter and switch language", async ({ page }) => {
  // 1. Empty state: no profile yet.
  await page.goto("/profile");
  await expect(page.getByText("No profile yet")).toBeVisible();

  // 2. Fill in and save the profile.
  await page.getByRole("textbox", { name: "Stack" }).fill("TypeScript");
  await page.getByRole("textbox", { name: "Stack" }).press("Enter");
  await page.getByRole("textbox", { name: "Allowed locations" }).fill("bo");
  await page.getByRole("textbox", { name: "Allowed locations" }).press("Enter");
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
  await page.getByLabel("Language").selectOption("es");
  await expect(page.getByRole("link", { name: "Ofertas" })).toBeVisible();
  await expect(page.getByTestId("verdict")).toHaveText(/Encaja/);
  await page.reload();
  await expect(page.getByRole("link", { name: "Perfil" })).toBeVisible();
});
