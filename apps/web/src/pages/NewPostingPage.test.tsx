import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ClientModule from "../api/client";
import { ApiError } from "../api/client";
import { renderApp } from "../test/render";

const { listPostings, createPosting, scorePosting } = vi.hoisted(() => ({
  listPostings: vi.fn(),
  createPosting: vi.fn(),
  scorePosting: vi.fn(),
}));
vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { listPostings, createPosting, scorePosting },
}));

describe("Add posting page", () => {
  beforeEach(() => {
    listPostings.mockReset().mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
    createPosting.mockReset().mockResolvedValue({ id: "44444444-4444-4444-8444-444444444444" });
    scorePosting.mockReset().mockResolvedValue({});
  });

  it("saves a posting from the pasted text alone and goes back to the list", async () => {
    renderApp({ route: "/postings/new" });
    await userEvent.type(screen.getByLabelText("Posting text"), "Senior Node Developer");
    await userEvent.click(screen.getByRole("button", { name: "Save posting" }));
    await waitFor(() => expect(createPosting).toHaveBeenCalledTimes(1));
    expect(createPosting.mock.calls[0]?.[0]).toMatchObject({
      title: "Senior Node Developer",
      company: "—",
      source: "manual",
      description: "Senior Node Developer",
    });
    expect((createPosting.mock.calls[0]?.[0] as { url: string }).url).toMatch(/^manual:[0-9a-f]{64}$/);
    expect(scorePosting).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/));
  });

  it("uses the fields the user filled and can score right away", async () => {
    renderApp({ route: "/postings/new" });
    await userEvent.type(screen.getByLabelText(/Posting text/), "Some text");
    await userEvent.type(screen.getByLabelText(/Title/), "Staff Engineer");
    await userEvent.type(screen.getByLabelText(/Link/), "https://acme.com/jobs/9");
    await userEvent.selectOptions(screen.getByLabelText(/Remote scope/), "latam");
    await userEvent.click(screen.getByLabelText("Score it right away"));
    await userEvent.click(screen.getByRole("button", { name: "Save posting" }));
    await waitFor(() => expect(scorePosting).toHaveBeenCalledWith("44444444-4444-4444-8444-444444444444"));
    expect(createPosting.mock.calls[0]?.[0]).toMatchObject({ title: "Staff Engineer", url: "https://acme.com/jobs/9", remoteScope: "latam" });
  });

  it("asks for the text before calling the API", async () => {
    renderApp({ route: "/postings/new" });
    await userEvent.click(screen.getByRole("button", { name: "Save posting" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Paste the posting text first.");
    expect(createPosting).not.toHaveBeenCalled();
  });

  it("tells the user when the posting already exists", async () => {
    createPosting.mockRejectedValue(new ApiError(409, "Conflict", "exists"));
    renderApp({ route: "/postings/new", language: "es" });
    await userEvent.type(screen.getByLabelText(/Texto de la oferta/), "Dev");
    await userEvent.click(screen.getByRole("button", { name: "Guardar oferta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esta oferta ya estaba guardada.");
  });

  it("reports an invalid link instead of sending it", async () => {
    renderApp({ route: "/postings/new" });
    await userEvent.type(screen.getByLabelText(/Posting text/), "Dev");
    await userEvent.type(screen.getByLabelText(/Link/), "not a url");
    await userEvent.click(screen.getByRole("button", { name: "Save posting" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Check the fields");
    expect(createPosting).not.toHaveBeenCalled();
  });
});
