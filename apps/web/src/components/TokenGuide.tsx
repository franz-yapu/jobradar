import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon } from "./icons";
import { Button, Card } from "./ui";

/** A line of code with a copy button (the clipboard may be blocked: the text stays selectable). */
function CopyLine({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <code translate="no" className="select-all break-all rounded-md border border-line bg-page px-3 py-2 font-mono text-[13px] text-ink">
        {value}
      </code>
      <Button variant="outline" size="sm" aria-label={label} onClick={() => void copy()}>
        {copied ? t("tokens.copied") : t("tokens.copy")}
      </Button>
    </div>
  );
}

function Step({ number, done, title, children }: { number: number; done?: boolean; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          done ? "bg-primary text-on-primary" : "bg-primary-soft text-primary-ink"
        }`}
      >
        {done ? <CheckIcon width={16} height={16} /> : number}
      </span>
      <div className="min-w-0 flex-1 pb-1">
        <h3 className="font-semibold">{title}</h3>
        <div className="mt-1 text-sm text-muted">{children}</div>
      </div>
    </li>
  );
}

/**
 * Four steps to put a token to work in n8n. While the secret is on screen (right after creating it) the
 * `.env` line already contains it; otherwise it shows a placeholder, because the secret is never kept.
 */
export function TokenGuide({ secret }: { secret: string | null }) {
  const { t } = useTranslation();
  const envLine = `JOBRADAR_API_TOKEN=${secret ?? "jr_your-token"}`;
  return (
    <Card title={t("tokens.guide.title")}>
      <p className="mb-5 text-sm text-muted">{t("tokens.guide.intro")}</p>
      <ol className="space-y-5">
        <Step number={1} done={secret !== null} title={t("tokens.guide.s1.title")}>
          {t("tokens.guide.s1.text")}
        </Step>
        <Step number={2} title={t("tokens.guide.s2.title")}>
          {t("tokens.guide.s2.text")}
          <CopyLine value={envLine} label={t("tokens.guide.s2.copy")} />
        </Step>
        <Step number={3} title={t("tokens.guide.s3.title")}>
          {t("tokens.guide.s3.text")}
          <CopyLine value="docker compose up -d n8n" label={t("tokens.guide.s3.copy")} />
        </Step>
        <Step number={4} title={t("tokens.guide.s4.title")}>
          <ol className="list-inside list-decimal space-y-1">
            <li>{t("tokens.guide.s4.a")}</li>
            <li>{t("tokens.guide.s4.b")}</li>
            <li>{t("tokens.guide.s4.c")}</li>
          </ol>
          <p className="mt-2">{t("tokens.guide.s4.check")}</p>
        </Step>
      </ol>
    </Card>
  );
}
