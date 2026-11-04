import { VERDICT_FILTERS } from "@jobradar/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SINCE_OPTIONS, SOURCE_OPTIONS } from "../lib/filters";
import type { PostingFilters, SinceOption, VerdictFilter } from "../lib/filters";
import { SearchIcon } from "./icons";
import { Button, FIELD } from "./ui";

interface Props {
  filters: PostingFilters;
  onChange: (next: PostingFilters) => void;
}

const LABEL = "flex w-full flex-col gap-1.5 text-xs font-medium text-muted sm:w-auto";

export function PostingFiltersBar({ filters, onChange }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState(filters.q);
  const isDefault = !filters.verdict && !filters.q && !filters.source && filters.since === "all";

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onChange({ ...filters, q: text.trim(), page: 1 });
      }}
    >
      <label className={`${LABEL} sm:min-w-56 sm:flex-1`}>
        {t("filters.search")}
        <span className="relative">
          <SearchIcon width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className={`${FIELD} pl-9`}
            type="search"
            value={text}
            placeholder={t("filters.searchPlaceholder")}
            onChange={(event) => setText(event.target.value)}
          />
        </span>
      </label>
      <label className={LABEL}>
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
      <label className={LABEL}>
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
      <label className={LABEL}>
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
        <Button
          variant="ghost"
          onClick={() => {
            setText("");
            onChange({ q: "", source: "", since: "all", page: 1 });
          }}
        >
          {t("filters.clear")}
        </Button>
      ) : null}
    </form>
  );
}
