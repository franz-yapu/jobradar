import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ClientModule from "../api/client";
import { renderApp } from "../test/render";

const { listPostings, getProfile } = vi.hoisted(() => ({ listPostings: vi.fn(), getProfile: vi.fn() }));
vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  api: { listPostings, getProfile },
}));

describe("Layout", () => {
  beforeEach(() => {
    window.localStorage.clear();
    listPostings.mockReset().mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
    getProfile.mockReset().mockResolvedValue(null);
  });

  it("offers the screens in the sidebar and marks the current one", async () => {
    renderApp({ route: "/profile" });
    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    expect(nav.getAllByRole("link").map((link) => link.textContent)).toEqual(["Postings", "Add posting", "Profile", "Account", "API tokens"]);
    expect(nav.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Postings" })).not.toHaveAttribute("aria-current");
  });

  it("shows where you are in the breadcrumb, in the current language", async () => {
    renderApp({ route: "/postings/new", language: "es" });
    const crumbs = screen.getByRole("navigation", { name: "Ruta de navegación" });
    expect(crumbs).toHaveTextContent("JobRadar");
    expect(within(crumbs).getByText("Añadir oferta")).toHaveAttribute("aria-current", "page");
  });

  it("navigates between screens from the sidebar", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("link", { name: "Profile" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/profile");
    expect(await screen.findByRole("heading", { name: "Your profile" })).toBeInTheDocument();
  });

  it("has a skip link to the content", () => {
    renderApp();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });

  describe("phone drawer", () => {
    it("opens from the menu button and closes with Escape", async () => {
      renderApp();
      const open = screen.getByRole("button", { name: "Open menu" });
      expect(open).toHaveAttribute("aria-expanded", "false");
      await userEvent.click(open);
      expect(open).toHaveAttribute("aria-expanded", "true");
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(open).toHaveAttribute("aria-expanded", "false"));
    });

    it("closes when a link is chosen or the backdrop is pressed", async () => {
      const { container } = renderApp();
      const open = screen.getByRole("button", { name: "Open menu" });

      await userEvent.click(open);
      await userEvent.click(screen.getByRole("link", { name: "Add posting" }));
      expect(open).toHaveAttribute("aria-expanded", "false");

      await userEvent.click(open);
      const backdrop = container.ownerDocument.querySelector('[aria-hidden="true"].fixed.inset-0');
      expect(backdrop).not.toBeNull();
      await userEvent.click(backdrop as Element);
      expect(open).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("collapsible sidebar", () => {
    it("collapses to icons, keeps the labels for screen readers and remembers the choice", async () => {
      renderApp();
      const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
      expect(toggle).toHaveAttribute("aria-pressed", "false");

      await userEvent.click(toggle);
      expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-pressed", "true");
      // the label is still in the accessibility tree, just visually hidden
      expect(screen.getByRole("link", { name: "Postings" })).toBeInTheDocument();
      expect(window.localStorage.getItem("jobradar.sidebar.collapsed")).toBe("1");
    });

    it("starts collapsed when it was left collapsed", () => {
      window.localStorage.setItem("jobradar.sidebar.collapsed", "1");
      renderApp();
      expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    });
  });
});
