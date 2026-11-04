import { VERDICT_FILTERS } from "@jobradar/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SINCE_OPTIONS, SOURCE_OPTIONS } from "../lib/filters";
import type { PostingFilters, SinceOption, VerdictFilter } from "../lib/filters";

interface Props {
  filters: PostingFilters;
  onChange: (next: PostingFilters) => void;
}

const FIELD = "rounded border border-slate-300 bg-white px-2 py-1 text-sm";

export function PostingFiltersBar({ filters, onChange }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState(filters.q);
  const isDefault = !filters.verdict && !filters.q && !filters.source && filters.since === "all";

  return (
    <form
      className="mb-4 flex flex-wrap items-end gap-3"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onChange({ ...filters, q: text.trim(), page: 1 });
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        {t("filters.search")}
        <input
          className={`${FIELD} w-56`}
          type="search"
          value={text}
          placeholder={t("filters.searchPlaceholder")}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        {t("filters.verdict")}
        <select
          className={FIELD}
          value={filters.verdict ?? ""}
          onChange={(event) => onChange({ ...filters, verdict: (event.target.value || undefined) as VerdictFilter | undefined, page: 1 })}
        >
          <option value="">{t("filters.allVerdicts")}</option>
          {VERDICT_FILTERS.map((verdict) => (
            <option key={verdict} value={verdict}>
              {t(`verdict.${verdict}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        {t("filters.source")}
        <select className={FIELD} value={filters.source} onChange={(event) => onChange({ ...filters, source: event.target.value, page: 1 })}>
          <option value="">{t("filters.allSources")}</option>
          {SOURCE_OPTIONS.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        {t("filters.since")}
        <select
          className={FIELD}
          value={filters.since}
          onChange={(event) => onChange({ ...filters, since: event.target.value as SinceOption, page: 1 })}
        >
          {SINCE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(`filters.${option}`)}
            </option>
          ))}
        </select>
      </label>
      {!isDefault ? (
        <button
          type="button"
          className="text-sm text-slate-600 underline"
          onClick={() => {
            setText("");
            onChange({ q: "", source: "", since: "all", page: 1 });
          }}
        >
          {t("filters.clear")}
        </button>
      ) : null}
    </form>
  );
}
