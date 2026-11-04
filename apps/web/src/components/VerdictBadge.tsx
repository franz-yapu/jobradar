import type { Verdict } from "@jobradar/shared";
import { useTranslation } from "react-i18next";

const STYLES: Record<Verdict | "unscored", string> = {
  fit: "bg-success-soft text-success-ink",
  maybe: "bg-warning-soft text-warning-ink",
  reject: "bg-danger-soft text-danger-ink",
  unscored: "bg-line text-muted",
};
const ICONS: Record<Verdict | "unscored", string> = { fit: "✅", maybe: "⚠️", reject: "❌", unscored: "⏳" };

export function VerdictBadge({ verdict }: { verdict: Verdict | null }) {
  const { t } = useTranslation();
  const key = verdict ?? "unscored";
  return (
    <span data-testid="verdict" className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${STYLES[key]}`}>
      <span aria-hidden="true">{ICONS[key]}</span>
      {t(`verdict.${key}`)}
    </span>
  );
}
