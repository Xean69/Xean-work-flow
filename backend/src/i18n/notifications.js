import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SUPPORTED_LANGUAGES } from "../utils/validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Loaded once at startup, not per-request — these files are tiny and
// change only when a translation pass regenerates them (see
// scripts/translate-locales.mjs), never at runtime. A language whose file
// doesn't exist yet (e.g. mid-rollout of a new language) falls back to
// English rather than crashing the email send.
const catalogs = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((lang) => {
    try {
      const raw = readFileSync(path.join(__dirname, "../locales", lang, "notifications.json"), "utf8");
      return [lang, JSON.parse(raw)];
    } catch {
      return [lang, null];
    }
  })
);

function interpolate(str, vars) {
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] != null ? String(vars[key]) : ""));
}

// key is a dot path into the JSON, e.g. "maintenanceReply.subject" — mirrors
// the same nested-namespace shape the frontend's translation files use.
export function tr(language, key, vars = {}) {
  const dict = catalogs[language] || catalogs.en;
  const value = key.split(".").reduce((obj, part) => obj?.[part], dict);
  if (typeof value !== "string") return key;
  return interpolate(value, vars);
}
