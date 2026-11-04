import { useTranslation } from "react-i18next";

export function ComingSoonPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <section>
      <h2 className="mb-2 text-xl font-semibold">{t(titleKey)}</h2>
      <p className="text-slate-500">{t("comingSoon")}</p>
    </section>
  );
}
