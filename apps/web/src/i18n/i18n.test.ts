import { describe, expect, it } from "vitest";
import en from "./en.json";
import es from "./es.json";
import { detectLanguage, LANGUAGE_STORAGE_KEY, saveLanguage } from "./language";

function keysOf(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key));
}

describe("dictionaries", () => {
  it("English and Spanish define exactly the same keys", () => {
    expect(keysOf(es).sort()).toEqual(keysOf(en).sort());
  });

  it("no translation is empty", () => {
    const values = (dict: unknown): string[] =>
      typeof dict === "object" && dict !== null ? Object.values(dict).flatMap(values) : [String(dict)];
    for (const dict of [en, es]) expect(values(dict).every((text) => text.trim().length > 0)).toBe(true);
  });
});

describe("detectLanguage", () => {
  const storage = (value: string | null) => ({ getItem: () => value });

  it("prefers the saved choice over the browser language", () => {
    expect(detectLanguage(storage("en"), "es-BO")).toBe("en");
  });

  it("falls back to the browser language, then English", () => {
    expect(detectLanguage(storage(null), "es-BO")).toBe("es");
    expect(detectLanguage(storage(null), "fr-FR")).toBe("en");
    expect(detectLanguage(null, undefined)).toBe("en");
  });

  it("ignores an unknown saved value and blocked storage", () => {
    expect(detectLanguage(storage("de"), "es")).toBe("es");
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(detectLanguage(blocked, "es")).toBe("es");
  });

  it("saves the choice and survives blocked storage", () => {
    const saved = new Map<string, string>();
    saveLanguage({ setItem: (key, value) => void saved.set(key, value) }, "es");
    expect(saved.get(LANGUAGE_STORAGE_KEY)).toBe("es");
    expect(() =>
      saveLanguage(
        {
          setItem: () => {
            throw new Error("blocked");
          },
        },
        "en",
      ),
    ).not.toThrow();
  });
});
