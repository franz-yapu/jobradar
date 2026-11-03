/*
 * Get on Board job -> JobRadar `POST /postings` body (SDD-003).
 * Pure functions, no imports: this file is embedded verbatim at the top of the "Map jobs" Code node
 * of n8n/workflows/01-collect-getonboard.json (a test keeps both in sync) and is unit-tested with a saved
 * real API response (n8n/fixtures/getonboard-jobs.json).
 */
const MAX_DESCRIPTION = 12000; // bounds the AI cost of scoring one posting
const MAX_TEXT = 300; // title, company and location limits of CreatePostingSchema

/** HTML (as sent by Get on Board) to readable plain text. Tolerates truncated or malformed markup. */
function htmlToText(html) {
  if (typeof html !== "string") return "";
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<\s*\/\s*(p|h[1-6])\s*>/gi, "\n\n")
    .replace(/<\s*br\s*\/?\s*>|<\s*\/\s*(div|li|ul|ol)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/<[^>]*$/, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildDescription(attributes) {
  const parts = [];
  const add = (headline, html) => {
    const text = htmlToText(html);
    if (text) parts.push(headline ? `${headline}\n${text}` : text);
  };
  add(null, attributes.projects);
  add(attributes.functions_headline, attributes.functions);
  add(attributes.description_headline, attributes.description);
  add(attributes.desirable_headline, attributes.desirable);
  add(attributes.benefits_headline, attributes.benefits);
  return parts.join("\n\n").slice(0, MAX_DESCRIPTION);
}

function listedCountries(attributes) {
  return Array.isArray(attributes.countries)
    ? attributes.countries.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim())
    : [];
}

/**
 * Conservative on purpose: never guesses `worldwide`. When unsure it answers `unknown` and the AI decides from the text.
 * Observed `remote_modality` values: fully_remote, remote_local (remote, but only for residents of the listed
 * country; the country itself is only in ids or free text), hybrid, no_remote.
 */
function remoteScope(attributes) {
  const modality = attributes.remote_modality;
  if (modality === "hybrid" || modality === "no_remote") return "onsite";

  const zone = typeof attributes.remote_zone === "string" ? attributes.remote_zone.toLowerCase() : "";
  const specific = listedCountries(attributes).filter((c) => c.toLowerCase() !== "remote");
  if (modality === "remote_local") return "country"; // remote, but only for residents of some country
  if (modality === "fully_remote") {
    if (/latam|latin/.test(zone)) return "latam";
    if (specific.length === 1) return "country";
  }
  return "unknown";
}

function buildLocation(attributes) {
  const countries = listedCountries(attributes).join(", ");
  const zone = typeof attributes.remote_zone === "string" ? attributes.remote_zone.trim() : "";
  let text = zone ? `${countries || "Remote"} (${zone})` : countries;
  // Get on Board only exposes the allowed countries as ids or inside the text: say so, the AI reads the description.
  if (attributes.remote_modality === "remote_local" && (!text || text.toLowerCase() === "remote")) {
    text = "Remote (restricted to residents of specific countries, see description)";
  }
  return text ? text.slice(0, MAX_TEXT) : undefined;
}

/** Returns the body for `POST /postings`, or null when the job has no usable title or public URL. */
function mapJob(job) {
  const attributes = job && job.attributes;
  const url = job && job.links && job.links.public_url;
  if (!attributes || typeof attributes.title !== "string" || !attributes.title.trim() || typeof url !== "string") {
    return null;
  }
  const company = attributes.company && attributes.company.data && attributes.company.data.attributes;
  const companyName = company && typeof company.name === "string" ? company.name.trim() : "";

  const posting = {
    title: attributes.title.trim().slice(0, MAX_TEXT),
    company: companyName.slice(0, MAX_TEXT) || "Unknown company",
    url,
    source: "getonboard",
    remoteScope: remoteScope(attributes),
    description: buildDescription(attributes),
  };
  const location = buildLocation(attributes);
  if (location) posting.location = location;
  if (Number.isFinite(attributes.published_at)) posting.publishedAt = new Date(attributes.published_at * 1000).toISOString();
  return posting;
}

/** True when the job was published within the window (or has no date: the API dedupes by URL anyway). */
function publishedWithin(job, hours, nowMs) {
  const publishedAt = job && job.attributes && job.attributes.published_at;
  if (!Number.isFinite(publishedAt)) return true;
  return nowMs - publishedAt * 1000 <= hours * 3600 * 1000;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { htmlToText, remoteScope, mapJob, publishedWithin, MAX_DESCRIPTION };
}
