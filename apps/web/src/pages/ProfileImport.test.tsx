import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ClientModule from "../api/client";
import { ApiError } from "../api/client";
import { renderApp } from "../test/render";

const { getProfile, saveProfile, importCv } = vi.hoisted(() => ({ getProfile: vi.fn(), saveProfile: vi.fn(), importCv: vi.fn() }));
vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { getProfile, saveProfile, importCv },
}));

const SAVED = {
  stack: ["COBOL"],
  seniority: "mid",
  allowedLocations: ["AR"],
  maxEnglishLevel: "A2",
  excludedContractTypes: [],
  summary: "Saved summary",
  education: [],
  experience: [],
  languages: [],
  certifications: [],
  version: 2,
  updatedAt: "2026-11-04T10:00:00.000Z",
};

const DRAFT = {
  stack: ["TypeScript", "NestJS"],
  seniority: "senior",
  allowedLocations: [],
  maxEnglishLevel: "B1",
  excludedContractTypes: [],
  summary: "Backend developer from the CV",
  education: [{ institution: "UMSA", degree: "BSc", field: "Informatics", startYear: 2008, endYear: 2013 }],
  experience: [{ company: "Acme", role: "Backend Developer", startYear: 2020, current: true, highlights: ["Built an API"] }],
  languages: [{ language: "English", level: "B1" }],
  certifications: ["AWS Cloud Practitioner"],
  warnings: ["location_missing", "seniority_estimated"],
};

const pdf = () => new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" });

async function chooseAndRead(file: File = pdf(), user = userEvent.setup()) {
  await screen.findByText("COBOL");
  await user.upload(screen.getByLabelText("CV file (PDF)"), file);
  await user.click(screen.getByRole("button", { name: "Read my CV" }));
}

describe("CV import on the profile screen", () => {
  beforeEach(() => {
    getProfile.mockReset().mockResolvedValue(SAVED);
    saveProfile.mockReset().mockImplementation(async (body: object) => ({ ...SAVED, ...body, version: 3 }));
    importCv.mockReset().mockResolvedValue(DRAFT);
  });

  it("fills the form with the draft, lists what to check and saves nothing yet", async () => {
    renderApp({ route: "/profile" });
    await chooseAndRead();

    expect(await screen.findByText("TypeScript")).toBeInTheDocument();
    expect(screen.queryByText("COBOL")).toBeNull();
    expect(screen.getByLabelText("Seniority")).toHaveValue("senior");
    expect(screen.getByDisplayValue("Backend developer from the CV")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Acme")).toBeInTheDocument();
    expect(screen.getByDisplayValue("UMSA")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("English");
    expect(screen.getByText("AWS Cloud Practitioner")).toBeInTheDocument();

    expect(screen.getByText(/Draft from your CV/)).toBeInTheDocument();
    expect(screen.getByText("No country was found: add where you can work from.")).toBeInTheDocument();
    expect(screen.getByText("Seniority was estimated from your years of experience.")).toBeInTheDocument();
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("sends the reviewed draft when saving, and the draft banner goes away", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/profile" });
    await chooseAndRead(pdf(), user);
    await screen.findByText("TypeScript");

    // the draft had no location: the candidate completes it before saving
    await user.type(screen.getByRole("combobox", { name: "Allowed locations" }), "bolivia{Enter}");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
    const body = saveProfile.mock.calls[0]?.[0];
    expect(body).toMatchObject({
      stack: ["TypeScript", "NestJS"],
      allowedLocations: ["BO"],
      seniority: "senior",
      education: [{ institution: "UMSA", degree: "BSc", field: "Informatics", endYear: 2013 }],
      experience: [{ company: "Acme", role: "Backend Developer", current: true, highlights: ["Built an API"] }],
      languages: [{ language: "English", level: "B1" }],
      certifications: ["AWS Cloud Practitioner"],
    });
    expect(body).not.toHaveProperty("warnings");
    expect(await screen.findByText("Profile saved (version 3).")).toBeInTheDocument();
    expect(screen.queryByText(/Draft from your CV/)).toBeNull();
  });

  it("refuses to save an incomplete draft (no location yet) without calling the API", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/profile" });
    await chooseAndRead(pdf(), user);
    await screen.findByText("TypeScript");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText(/Add at least one allowed location/)).toBeInTheDocument();
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("discards the draft and brings back the saved profile", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/profile" });
    await chooseAndRead(pdf(), user);
    await screen.findByText("TypeScript");
    await user.click(screen.getByRole("button", { name: "Discard draft" }));
    expect(screen.getByText("COBOL")).toBeInTheDocument();
    expect(screen.queryByText("TypeScript")).toBeNull();
    expect(screen.queryByText(/Draft from your CV/)).toBeNull();
  });

  it("does not upload a file that is not a PDF", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderApp({ route: "/profile", language: "es" });
    await screen.findByText("COBOL");
    await user.upload(screen.getByLabelText("Archivo del CV (PDF)"), new File(["hola"], "cv.docx", { type: "text/plain" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese archivo no es un PDF.");
    expect(screen.getByRole("button", { name: "Leer mi CV" })).toBeDisabled();
    expect(importCv).not.toHaveBeenCalled();
  });

  it("does not upload a file over 5 MB", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/profile" });
    await screen.findByText("COBOL");
    const big = new File([new ArrayBuffer(5 * 1024 * 1024 + 1)], "cv.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("CV file (PDF)"), big);
    expect(await screen.findByRole("alert")).toHaveTextContent("The file is too large");
    expect(importCv).not.toHaveBeenCalled();
  });

  it("explains API failures and leaves the saved profile untouched", async () => {
    importCv.mockRejectedValue(new ApiError(422, "cv_no_text", "no text"));
    renderApp({ route: "/profile" });
    await chooseAndRead();
    expect(await screen.findByRole("alert")).toHaveTextContent("The PDF has no readable text");
    expect(screen.getByText("COBOL")).toBeInTheDocument();
  });

  it("tells the user the CV text goes to the AI provider before anything is uploaded", async () => {
    renderApp({ route: "/profile" });
    await screen.findByText("COBOL");
    expect(screen.getByRole("note")).toHaveTextContent("sent to the AI provider");
  });
});

describe("background editors", () => {
  beforeEach(() => {
    getProfile.mockReset().mockResolvedValue(SAVED);
    saveProfile.mockReset().mockImplementation(async (body: object) => ({ ...SAVED, ...body, version: 3 }));
  });

  it("add, edit and remove jobs, studies and languages by hand; blank rows are not sent", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/profile" });
    await screen.findByText("COBOL");

    await user.click(screen.getByRole("button", { name: "Add job" }));
    await user.type(screen.getByLabelText("Company"), "Initech");
    await user.type(screen.getByLabelText("Role"), "Developer");
    const start = within(screen.getByRole("group", { name: "Start" }));
    await user.selectOptions(start.getByLabelText("Year"), "2019");
    await user.selectOptions(start.getByLabelText("Month"), "3");
    await user.type(screen.getByLabelText(/Highlights/), "Shipped the billing module");

    await user.click(screen.getByRole("button", { name: "Add education" }));
    await user.click(screen.getByRole("button", { name: "Add language" }));
    await user.click(screen.getByRole("button", { name: "Add language" }));
    const languages = screen.getAllByRole("combobox", { name: "Language" });
    await user.selectOptions(languages[0] as HTMLElement, "Spanish");
    await user.selectOptions(screen.getAllByLabelText("Level")[0] as HTMLElement, "native");

    // the empty education row and the empty second language are dropped when saving
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
    expect(saveProfile.mock.calls[0]?.[0]).toMatchObject({
      experience: [{ company: "Initech", role: "Developer", startYear: 2019, startMonth: 3, current: false, highlights: ["Shipped the billing module"] }],
      education: [],
      languages: [{ language: "Spanish", level: "native" }],
    });
  });

  it("a current job has no end year", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/profile" });
    await screen.findByText("COBOL");
    await user.click(screen.getByRole("button", { name: "Add job" }));
    const end = within(screen.getByRole("group", { name: "End" }));
    const endYear = end.getByLabelText("Year");
    await user.selectOptions(endYear, "2022");
    expect(endYear).toHaveValue("2022");

    await user.click(screen.getByLabelText("Current job"));
    expect(endYear).toBeDisabled();
    expect(endYear).toHaveValue("");
  });

  it("removes an item", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/profile" });
    await screen.findByText("COBOL");
    await user.click(screen.getByRole("button", { name: "Add language" }));
    const item = screen.getByTestId("background-item");
    await user.click(within(item).getByRole("button", { name: /Remove/ }));
    expect(screen.queryByTestId("background-item")).toBeNull();
  });

  it("manages certifications as chips", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/profile" });
    await screen.findByText("COBOL");
    await user.type(screen.getByRole("combobox", { name: /^Certifications/ }), "CKA{Enter}");
    // Enter picks the best suggestion; the curated list knows this certification by its full name
    expect(screen.getByText("Certified Kubernetes Administrator (CKA)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Certified Kubernetes Administrator (CKA)" }));
    expect(screen.queryByText("Certified Kubernetes Administrator (CKA)")).toBeNull();
  });
});
