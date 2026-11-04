import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ClientModule from "../api/client";
import { ApiError } from "../api/client";
import { renderApp } from "../test/render";

const { listPostings, scorePosting } = vi.hoisted(() => ({ listPostings: vi.fn(), scorePosting: vi.fn() }));
vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { listPostings, scorePosting },
}));

const base = {
  company: "Acme",
  url: "https://acme.com/jobs/1",
  source: "getonboard",
  location: null,
  remoteScope: "latam",
  description: "",
  publishedAt: null,
  createdAt: "2026-11-04T10:00:00.000Z",
};
const FIT = {
  ...base,
  id: "11111111-1111-4111-8111-111111111111",
  title: "Backend Engineer",
  latestScore: {
    verdict: "fit",
    reasons: ["Stack matches NestJS", "Remote in LATAM"],
    blockers: [],
    scoredAt: "2026-11-04T10:00:00.000Z",
  },
};
const REJECT = {
  ...base,
  id: "22222222-2222-4222-8222-222222222222",
  title: "Java Architect",
  latestScore: {
    verdict: "reject",
    reasons: ["Needs C1 English"],
    blockers: [{ type: "english", evidence: "Fluent English (C1) required" }],
    scoredAt: "2026-11-04T10:00:00.000Z",
  },
};
const UNSCORED = { ...base, id: "33333333-3333-4333-8333-333333333333", title: "Data Engineer", url: "manual:" + "a".repeat(64), source: "manual", latestScore: null };

/** The i-th row of the list (fails the test if it is missing). */
async function rowAt(index: number): Promise<HTMLElement> {
  const rows = await screen.findAllByTestId("posting-row");
  const row = rows[index];
  if (!row) throw new Error(`No row at ${index}`);
  return row;
}

function page(items: unknown[], total = items.length, pageNumber = 1) {
  return { items, page: pageNumber, pageSize: 25, total };
}

describe("Postings page", () => {
  beforeEach(() => {
    listPostings.mockReset();
    scorePosting.mockReset();
    listPostings.mockResolvedValue(page([FIT, REJECT, UNSCORED]));
  });

  it("shows verdict, first reason and a link for each posting", async () => {
    renderApp();
    expect(await screen.findAllByTestId("posting-row")).toHaveLength(3);
    const [first, , third] = [await rowAt(0), await rowAt(1), await rowAt(2)];
    expect(within(first).getByRole("link", { name: "Backend Engineer" })).toHaveAttribute("href", "https://acme.com/jobs/1");
    expect(within(first).getByText("Stack matches NestJS")).toBeInTheDocument();
    // a pasted posting has no web link: plain text, flagged as pasted by hand
    expect(within(third).queryByRole("link")).toBeNull();
    expect(within(third).getByText(/Pasted by hand/)).toBeInTheDocument();
  });

  it("expands all reasons and blockers", async () => {
    renderApp();
    const row = await rowAt(1);
    await userEvent.click(within(row).getByRole("button", { name: "Details" }));
    expect(within(row).getByText("Fluent English (C1) required")).toBeInTheDocument();
    expect(within(row).getByText("English:")).toBeInTheDocument();
  });

  it("applies the verdict filter, keeps it in the URL and asks the API for it", async () => {
    renderApp();
    await screen.findAllByTestId("posting-row");
    await userEvent.selectOptions(screen.getByLabelText("Verdict"), "unscored");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/?verdict=unscored"));
    await waitFor(() => expect(listPostings).toHaveBeenLastCalledWith(expect.objectContaining({ verdict: "unscored", page: 1 })));
  });

  it("starts from the filters in the URL and sends the text search", async () => {
    renderApp({ route: "/?q=node&since=24h&source=manual" });
    await screen.findAllByTestId("posting-row");
    const call = listPostings.mock.calls[0]?.[0] as { q: string; source: string; createdSince?: string };
    expect(call).toMatchObject({ q: "node", source: "manual" });
    expect(call.createdSince).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(screen.getByLabelText("Search")).toHaveValue("node");

    await userEvent.clear(screen.getByLabelText("Search"));
    await userEvent.type(screen.getByLabelText("Search"), "nest{Enter}");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("q=nest"));
  });

  it("pages through results", async () => {
    listPostings.mockResolvedValue(page([FIT], 60));
    renderApp();
    await screen.findByText("Page 1 of 3");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("page=2"));
    await waitFor(() => expect(listPostings).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  });

  it("explains an empty filtered result differently from an empty database", async () => {
    listPostings.mockResolvedValue(page([]));
    renderApp({ route: "/?verdict=fit" });
    expect(await screen.findByText("No postings match these filters.")).toBeInTheDocument();
  });

  it("scores a posting and reloads the list", async () => {
    scorePosting.mockResolvedValue({});
    renderApp();
    const row = await rowAt(2);
    await userEvent.click(within(row).getByRole("button", { name: "Score now" }));
    await waitFor(() => expect(scorePosting).toHaveBeenCalledWith(UNSCORED.id));
    await waitFor(() => expect(listPostings.mock.calls.length).toBeGreaterThan(1));
  });

  it("explains a spent budget in the user's language", async () => {
    scorePosting.mockRejectedValue(new ApiError(429, "ai_budget_exceeded", "budget"));
    renderApp({ language: "es" });
    const row = await rowAt(2);
    await userEvent.click(within(row).getByRole("button", { name: "Evaluar ahora" }));
    expect(await within(row).findByRole("alert")).toHaveTextContent("Se agotó el presupuesto diario de IA");
  });
});
