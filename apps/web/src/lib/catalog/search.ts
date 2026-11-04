/**
 * Search key: lowercase, no accents, and the symbols that tell technologies apart spelled out, so that
 * "nodejs" finds "Node.js", "c#" finds "C#" and "cpp" finds "C++".
 */
export function searchKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/c\+\+/g, "cpp")
    .replace(/c#/g, "csharp")
    .replace(/f#/g, "fsharp")
    .replace(/\.net/g, "dotnet")
    .replace(/[^a-z0-9]/g, "");
}

export interface Option {
  value: string;
  label: string;
}

/** Options whose label (or value) matches the query, best first: exact, starts with, contains. */
export function searchOptions(options: readonly Option[], query: string, limit = 8): Option[] {
  const key = searchKey(query);
  if (!key) return options.slice(0, limit);
  const scored: { option: Option; score: number }[] = [];
  for (const option of options) {
    const label = searchKey(option.label);
    const value = searchKey(option.value);
    let score = -1;
    if (label === key || value === key) score = 0;
    else if (label.startsWith(key) || value.startsWith(key)) score = 1;
    else if (label.includes(key) || value.includes(key)) score = 2;
    if (score >= 0) scored.push({ option, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.option.label.length - b.option.label.length)
    .slice(0, limit)
    .map((entry) => entry.option);
}
