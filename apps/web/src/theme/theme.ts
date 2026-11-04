export const THEME_CHOICES = ["light", "dark", "system"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
export const THEME_STORAGE_KEY = "jobradar.theme";

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === "string" && (THEME_CHOICES as readonly string[]).includes(value);
}

/** The saved choice, or "system". Storage may be blocked (private windows), which is not an error. */
export function readTheme(storage: Pick<Storage, "getItem"> | null): ThemeChoice {
  try {
    const saved = storage?.getItem(THEME_STORAGE_KEY);
    if (isThemeChoice(saved)) return saved;
  } catch {
    // blocked storage: follow the system
  }
  return "system";
}

export function saveTheme(storage: Pick<Storage, "setItem" | "removeItem"> | null, choice: ThemeChoice): void {
  try {
    if (choice === "system") storage?.removeItem(THEME_STORAGE_KEY);
    else storage?.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // blocked storage: the choice just lasts for this session
  }
}

/**
 * `light` and `dark` force a theme through `data-theme` on <html>; `system` removes the attribute so the
 * `prefers-color-scheme` rule in the stylesheet decides (and follows the system live).
 */
export function applyTheme(root: HTMLElement, choice: ThemeChoice): void {
  if (choice === "system") delete root.dataset["theme"];
  else root.dataset["theme"] = choice;
}
