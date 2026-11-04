import type { Verdict } from "@jobradar/shared";
import { useTranslation } from "react-i18next";

const STYLES: Record<Verdict | "unscored", string> = {
  fit: "bg-green-100 text-green-800",
  maybe: "bg-amber-100 text-amber-800",
  reject: "bg-red-100 text-red-800",
  unscored: "bg-slate-100 text-slate-600",
};
const ICONS: Record<Verdict | "unscored", string> = { fit: "✅", maybe: "⚠️", reject: "❌", unscored: "⏳" };

export function VerdictBadge({ verdict }: { verdict: Verdict | null }) {
  const { t } = useTranslation();
  const key = verdict ?? "unscored";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[key]}`}>
      <span aria-hidden="true">{ICONS[key]}</span>
      {t(`verdict.${key}`)}
    </span>
  );
}
