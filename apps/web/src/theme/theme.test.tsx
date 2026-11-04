import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { renderApp } from "../test/render";
import { applyTheme, readTheme, saveTheme, THEME_STORAGE_KEY } from "./theme";

describe("theme storage", () => {
  const store = (value: string | null) => ({ getItem: () => value });

  it("reads a saved choice and falls back to the system", () => {
    expect(readTheme(store("dark"))).toBe("dark");
    expect(readTheme(store("light"))).toBe("light");
    expect(readTheme(store(null))).toBe("system");
    expect(readTheme(store("purple"))).toBe("system");
    expect(readTheme(null)).toBe("system");
  });

  it("survives blocked storage in both directions", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readTheme(blocked)).toBe("system");
    expect(() => saveTheme(blocked, "dark")).not.toThrow();
    expect(() => saveTheme(blocked, "system")).not.toThrow();
  });

  it("saves light and dark, and forgets the choice for system", () => {
    const data = new Map<string, string>();
    const storage = { setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
    saveTheme(storage, "dark");
    expect(data.get(THEME_STORAGE_KEY)).toBe("dark");
    saveTheme(storage, "system");
    expect(data.has(THEME_STORAGE_KEY)).toBe(false);
  });

  it("forces a theme with data-theme and lets the system decide with none", () => {
    const root = document.createElement("html");
    applyTheme(root, "dark");
    expect(root.dataset["theme"]).toBe("dark");
    applyTheme(root, "light");
    expect(root.dataset["theme"]).toBe("light");
    applyTheme(root, "system");
    expect(root.dataset["theme"]).toBeUndefined();
  });
});

describe("theme switcher", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset["theme"];
  });

  it("starts on the system theme and switches to dark and light, remembering the choice", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/profile", user: null });
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    expect(document.documentElement.dataset["theme"]).toBeUndefined();

    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset["theme"]).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.dataset["theme"]).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    await user.click(screen.getByRole("radio", { name: "System" }));
    expect(document.documentElement.dataset["theme"]).toBeUndefined();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("restores the saved theme on the next visit, in the logged-in shell and on the login screen alike", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    renderApp({ route: "/" });
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  });

  it("is labelled in Spanish", () => {
    renderApp({ route: "/login", user: null, language: "es" });
    expect(screen.getByRole("radiogroup", { name: "Tema" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Oscuro" })).toBeInTheDocument();
  });
});
