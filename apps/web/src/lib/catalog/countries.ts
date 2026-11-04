import type { Option } from "./search";

/** ISO 3166-1 alpha-2 codes. Names come from the browser (`Intl.DisplayNames`) in the active language. */
const CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`;

export const COUNTRY_CODES: readonly string[] = CODES.split(/\s+/);

export interface KeywordLabels {
  latam: string;
  worldwide: string;
}

function regionNames(language: string): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([language], { type: "region" });
  } catch {
    return null;
  }
}

/** `BO` -> "Bolivia" / "Bolivia"; `latam` and `worldwide` use the given labels; unknown codes stay as they are. */
export function locationLabel(value: string, language: string, keywords: KeywordLabels): string {
  if (value === "latam") return keywords.latam;
  if (value === "worldwide") return keywords.worldwide;
  return regionNames(language)?.of(value) ?? value;
}

/** Everything the locations field can hold: the two keywords first, then the countries by name. */
export function locationOptions(language: string, keywords: KeywordLabels): Option[] {
  const names = regionNames(language);
  const countries = COUNTRY_CODES.map((code) => ({ value: code, label: names?.of(code) ?? code })).sort((a, b) =>
    a.label.localeCompare(b.label, language),
  );
  return [
    { value: "latam", label: keywords.latam },
    { value: "worldwide", label: keywords.worldwide },
    ...countries,
  ];
}
