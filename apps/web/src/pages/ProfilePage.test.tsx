import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ClientModule from "../api/client";
import { ApiError } from "../api/client";
import { renderApp } from "../test/render";

const { getProfile, saveProfile } = vi.hoisted(() => ({ getProfile: vi.fn(), saveProfile: vi.fn() }));
vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { getProfile, saveProfile },
}));

const SAVED = {
  stack: ["TypeScript", "NestJS"],
  seniority: "senior",
  allowedLocations: ["BO", "latam"],
  maxEnglishLevel: "B1",
  excludedContractTypes: ["temporary"],
  summary: "Full stack developer",
  education: [{ institution: "UMSA", degree: "BSc" }],
  experience: [{ company: "Acme", role: "Backend", current: true, highlights: ["Built an API"] }],
  languages: [{ language: "English", level: "B1" }],
  certifications: ["AWS Cloud Practitioner"],
  version: 3,
  updatedAt: "2026-11-04T10:00:00.000Z",
};

describe("Profile page", () => {
  beforeEach(() => {
    getProfile.mockReset().mockResolvedValue(SAVED);
    saveProfile.mockReset().mockImplementation(async (body: object) => ({ ...SAVED, ...body, version: 4 }));
  });

  it("shows the saved profile", async () => {
    renderApp({ route: "/profile" });
    expect(await screen.findByText("NestJS")).toBeInTheDocument();
    expect(screen.getByText("Latin America")).toBeInTheDocument();
    expect(screen.getByText("Bolivia")).toBeInTheDocument();
    expect(screen.getByLabelText("Seniority")).toHaveValue("senior");
    expect(screen.getByLabelText("Highest English level required that you accept")).toHaveValue("B1");
    expect(screen.getByRole("button", { name: /Contracts to exclude/ })).toHaveTextContent("Temporary");
    await userEvent.click(screen.getByRole("button", { name: /Contracts to exclude/ }));
    expect(screen.getByRole("checkbox", { name: "Temporary" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Freelance" })).not.toBeChecked();
  });

  it("edits chips, normalizes locations and saves the whole profile", async () => {
    renderApp({ route: "/profile" });
    await screen.findByText("NestJS");

    await userEvent.type(screen.getByRole("combobox", { name: "Stack" }), "postgres{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Remove NestJS" }));
    await userEvent.type(screen.getByRole("combobox", { name: "Allowed locations" }), "argentina{Enter}");
    await userEvent.click(screen.getByRole("button", { name: /Contracts to exclude/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Freelance" }));
    await userEvent.selectOptions(screen.getByLabelText("Seniority"), "lead");
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
    expect(saveProfile.mock.calls[0]?.[0]).toEqual({
      stack: ["TypeScript", "PostgreSQL"],
      seniority: "lead",
      allowedLocations: ["BO", "latam", "AR"],
      maxEnglishLevel: "B1",
      excludedContractTypes: ["temporary", "freelance"],
      summary: "Full stack developer",
      // the imported background is sent back untouched, so saving here never wipes it
      education: SAVED.education,
      experience: SAVED.experience,
      languages: SAVED.languages,
      certifications: SAVED.certifications,
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Profile saved (version 4).");
  });

  it("finds countries by name in the active language and offers nothing else", async () => {
    renderApp({ route: "/profile", language: "es" });
    await screen.findByText("NestJS");
    const input = screen.getByRole("combobox", { name: "Ubicaciones permitidas" });
    await userEvent.type(input, "alemania");
    expect(screen.getByRole("option", { name: "Alemania" })).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, "zzzz{Enter}");
    expect(screen.getByText("Sin coincidencias")).toBeInTheDocument();
  });

  it("starts empty when no profile exists and refuses to save an incomplete one", async () => {
    getProfile.mockResolvedValue(null);
    renderApp({ route: "/profile", language: "es" });
    expect(await screen.findByText(/Todavía no hay perfil/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar perfil" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Añade al menos una ubicación permitida");
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("shows API errors when saving fails", async () => {
    saveProfile.mockRejectedValue(new ApiError(0, "network_error", "down"));
    renderApp({ route: "/profile" });
    await screen.findByText("NestJS");
    await userEvent.click(screen.getByRole("button", { name: "Remove NestJS" })); // an unchanged profile cannot be saved
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The API is unreachable");
  });
});

describe("Profile page unsaved changes", () => {
  it("disables Save and Cancel until something changes, and Cancel restores the saved profile after confirming", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderApp({ route: "/profile" });
    await screen.findByText("NestJS");
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Remove NestJS" }));
    expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled();
    expect(screen.getByText("You have unsaved changes")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByText("NestJS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
    confirm.mockRestore();
  });

  it("keeps the edits when the confirmation is refused", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderApp({ route: "/profile" });
    await screen.findByText("NestJS");
    await userEvent.click(screen.getByRole("button", { name: "Remove NestJS" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("NestJS")).toBeNull();
    confirm.mockRestore();
  });
});

describe("Profile page inline validation", () => {
  it("flags the missing half of a row after leaving the field and focuses it on a save attempt", async () => {
    renderApp({ route: "/profile" });
    await screen.findByText("NestJS");
    await userEvent.click(screen.getByRole("button", { name: "Add job" }));
    const company = screen.getAllByRole("combobox", { name: "Company" }).at(-1) as HTMLElement;
    const role = () => screen.getAllByRole("combobox", { name: "Role" }).at(-1) as HTMLElement;
    await userEvent.type(company, "Acme");
    expect(screen.queryByText("Required")).toBeNull();
    await userEvent.tab(); // leaving the field starts showing errors
    await userEvent.click(role());
    await userEvent.tab();
    expect(await screen.findByText("Required")).toBeInTheDocument();
    expect(role()).toHaveAttribute("aria-invalid", "true");

    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(saveProfile).not.toHaveBeenCalled();
    await waitFor(() => expect(role()).toHaveFocus());
  });
});
