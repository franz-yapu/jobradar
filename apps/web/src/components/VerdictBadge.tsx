import type { Verdict } from "@jobradar/shared";
import { useTranslation } from "react-i18next";

/** A pale tint with dark text of the same hue, and a small dot in the hue: status without emoji or icons. */
const STYLES: Record<Verdict | "unscored", { pill: string; dot: string }> = {
  fit: { pill: "bg-success-soft text-success-ink", dot: "bg-success-ink" },
  maybe: { pill: "bg-warning-soft text-warning-ink", dot: "bg-warning-ink" },
  reject: { pill: "bg-danger-soft text-danger-ink", dot: "bg-danger-ink" },
  unscored: { pill: "bg-neutral-soft text-neutral-ink", dot: "bg-neutral-ink" },
};

export function VerdictBadge({ verdict }: { verdict: Verdict | null }) {
  const { t } = useTranslation();
  const key = verdict ?? "unscored";
  const style = STYLES[key];
  return (
    <span data-testid="verdict" className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium ${style.pill}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${style.dot}`} />
      {t(`verdict.${key}`)}
    </span>
  );
}
