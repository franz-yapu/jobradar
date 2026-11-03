/*
 * Daily Telegram summary text from `GET /postings?createdSince=...` items (SDD-003).
 * Pure functions, no imports: embedded verbatim at the top of the "Build summary" Code node of
 * n8n/workflows/02-daily-summary-telegram.json (a test keeps both in sync) and unit-tested.
 * Plain text on purpose (no Telegram parse mode, so titles never need escaping).
 */
const MAX_FITS = 10; // fits listed in the message
const MAX_MESSAGE = 4000; // Telegram's limit is 4096 characters
const MAX_REASON = 160;

function shorten(text, max) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function countByVerdict(items) {
  const counts = { fit: 0, maybe: 0, reject: 0, unscored: 0 };
  for (const item of items) counts[item.latestScore ? item.latestScore.verdict : "unscored"] += 1;
  return counts;
}

function dateLabel(now) {
  // en-GB: always dd/mm, whatever the ICU data of the host.
  return now.toLocaleDateString("en-GB", { timeZone: "America/La_Paz", day: "2-digit", month: "2-digit" });
}

/**
 * @param items   postings, newest first, each with `latestScore` (or null)
 * @param options { now: Date, windowHours: number, total?: number } `total` = how many the API reports in the window
 */
function buildSummary(items, options) {
  const { now, windowHours } = options;
  const total = Math.max(options.total || 0, items.length);
  const header = `JobRadar · resumen del ${dateLabel(now)}`;
  if (total === 0) return `${header}\nSin ofertas nuevas en las últimas ${windowHours} h.`;

  const counts = countByVerdict(items);
  const lines = [
    `${header} (últimas ${windowHours} h)`,
    `Ofertas nuevas: ${total}${total > items.length ? ` (resumen de las ${items.length} más recientes)` : ""}`,
    `✅ ${counts.fit} · ⚠️ ${counts.maybe} · ❌ ${counts.reject} · ⏳ sin evaluar ${counts.unscored}`,
  ];

  const fits = items.filter((item) => item.latestScore && item.latestScore.verdict === "fit");
  const footer = [];
  if (counts.maybe > 0) footer.push(`⚠️ ${counts.maybe} para revisar a mano.`);
  if (counts.unscored > 0) footer.push(`⏳ ${counts.unscored} sin evaluar (tope por corrida o presupuesto diario agotado).`);

  const listed = [];
  let omitted = 0;
  fits.forEach((item, index) => {
    const reason = item.latestScore.reasons && item.latestScore.reasons[0];
    const entry = [`${index + 1}. ${shorten(item.title, 120)} — ${shorten(item.company, 60)}`];
    if (reason) entry.push(`   ${shorten(reason, MAX_REASON)}`);
    entry.push(`   ${item.url}`);
    const candidate = [...lines, "", "✅ Para revisar ahora:", ...listed, ...entry, ...footer].join("\n");
    if (index < MAX_FITS && candidate.length <= MAX_MESSAGE) listed.push(...entry);
    else omitted += 1;
  });

  const out = [...lines];
  if (listed.length > 0) out.push("", "✅ Para revisar ahora:", ...listed);
  if (omitted > 0) out.push(`… y ${omitted} ✅ más (GET /postings?verdict=fit).`);
  out.push(...footer);
  return out.join("\n");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildSummary, countByVerdict, MAX_FITS, MAX_MESSAGE };
}
