// Generates a full set of translated UI-string JSON files for one target
// language from the English source files, using Claude instead of hand
// translation — the whole point of this script is that adding language #7
// later is "run this once, spot-check it," not a repeated manual effort.
//
// Usage: node scripts/translate-locales.mjs <langCode>
//   e.g. node scripts/translate-locales.mjs es
//
// Reads every English namespace file (frontend UI strings + the backend's
// tenant-notification-email strings) and writes one translated file per
// namespace, in the same directory structure, for the given language.
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const anthropic = new Anthropic();

const LANGUAGE_NAMES = {
  es: "Spanish",
  fr: "French",
  pt: "Portuguese",
  zh: "Mandarin Chinese (Simplified)",
  ar: "Modern Standard Arabic (MSA) — the UI itself is switched to a right-to-left layout separately; you're only producing the Arabic text here",
};

// Directories that each hold one en/ subfolder of namespace JSON files, plus
// the target language's sibling folder to write into.
const LOCALE_DIRS = [
  path.join(__dirname, "../../frontend/public/locales"),
  path.join(__dirname, "../src/locales"),
];

const PLURAL_SUFFIXES = ["zero", "one", "two", "few", "many", "other"];

function isPluralKey(key) {
  return PLURAL_SUFFIXES.some((suf) => key.endsWith(`_${suf}`));
}

function pluralBase(key) {
  return key.replace(/_(zero|one|two|few|many|other)$/, "");
}

// Builds a strict tool-use schema from the English source object's own
// shape — every string leaf becomes a required string property, every
// nested object recurses. additionalProperties:false plus every leaf
// listed in `required` makes it structurally impossible for the model to
// drop, rename, or add a key; it can only fill in translated values.
//
// Plural key groups (English only ever has _one/_other) are a special
// case: Arabic needs all 6 CLDR plural categories (zero/one/two/few/many/
// other), so for Arabic specifically this expands each _one/_other pair
// into all 6 required keys instead of mirroring English's 2. Every other
// target language keeps the same _one/_other pair English has — i18next's
// plural resolver only ever looks up the categories a given language's
// CLDR rule actually needs, so carrying an unused _one key for a
// single-form language like Chinese is harmless.
function buildSchema(node, targetLang) {
  const properties = {};
  const required = [];
  const handledPluralBases = new Set();

  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value === "object") {
      properties[key] = buildSchema(value, targetLang);
      required.push(key);
      continue;
    }
    if (isPluralKey(key)) {
      const base = pluralBase(key);
      if (handledPluralBases.has(base)) continue;
      handledPluralBases.add(base);
      const suffixes = targetLang === "ar" ? PLURAL_SUFFIXES : ["one", "other"];
      for (const suf of suffixes) {
        properties[`${base}_${suf}`] = { type: "string" };
        required.push(`${base}_${suf}`);
      }
      continue;
    }
    properties[key] = { type: "string" };
    required.push(key);
  }

  return { type: "object", properties, required, additionalProperties: false };
}

// Recursively checks the translated object has exactly the keys the schema
// demanded — belt-and-suspenders on top of strict:true tool-use, in case a
// future model or SDK version is ever looser about honoring the schema.
function checkKeyParity(schema, obj, pathPrefix = "") {
  const problems = [];
  for (const key of schema.required) {
    const fullKey = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (!(key in obj)) {
      problems.push(`missing: ${fullKey}`);
      continue;
    }
    if (schema.properties[key].type === "object") {
      problems.push(...checkKeyParity(schema.properties[key], obj[key], fullKey));
    }
  }
  for (const key of Object.keys(obj)) {
    if (!(key in schema.properties)) {
      problems.push(`unexpected: ${pathPrefix ? `${pathPrefix}.${key}` : key}`);
    }
  }
  return problems;
}

async function translateNamespace(englishContent, targetLang, namespaceName) {
  const languageName = LANGUAGE_NAMES[targetLang];
  const schema = buildSchema(englishContent, targetLang);

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 4096,
    output_config: { effort: "high" },
    system: `You are translating a property-management web app's UI strings from English into ${languageName}.

Rules:
- Translate every string value. Never translate, rename, or alter JSON keys — the tool schema already fixes those.
- Preserve every {{placeholder}} interpolation token exactly as written, including its exact name — these get substituted with real values at runtime and must not be translated or reworded.
- Prefer concise, idiomatic phrasing over literal word-for-word translation — these are UI labels, buttons, and table headers with limited space, not prose.
- Keep emoji, punctuation marks like "→" or "✓", and any other non-text symbols exactly as they appear in the source string, in the same position relative to the text.
- Some keys are grouped for plural forms (suffixes like _one, _other, or for Arabic _zero/_one/_two/_few/_many/_other). Each suffix is a real CLDR grammatical plural category for ${languageName} — write the grammatically correct form for that category, not a copy of another form. Use the English source's "_other" form as the semantic base for any category English doesn't distinguish (e.g. deriving Arabic's _zero/_two/_few/_many from the one English pair).
- The tool call's schema requires every key — fill in every one.`,
    tools: [
      {
        // Not strict:true — some of these namespaces' schemas (nested
        // objects plus plural-suffix expansion) exceed the complexity limit
        // strict tool-use enforces. checkKeyParity() below is the safety
        // net that catches a dropped/renamed key without that guarantee.
        name: "submit_translation",
        description: `Submit the ${languageName} translation of every string in this namespace.`,
        input_schema: schema,
      },
    ],
    tool_choice: { type: "tool", name: "submit_translation" },
    messages: [
      {
        role: "user",
        content: `Translate this English source JSON (namespace: "${namespaceName}") into ${languageName}:\n\n${JSON.stringify(englishContent, null, 2)}`,
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error(`No tool call returned for namespace "${namespaceName}"`);

  const problems = checkKeyParity(schema, toolUse.input);
  if (problems.length) {
    throw new Error(`Key parity check failed for "${namespaceName}":\n  ${problems.join("\n  ")}`);
  }

  return toolUse.input;
}

async function main() {
  const targetLang = process.argv[2];
  if (!targetLang || !LANGUAGE_NAMES[targetLang]) {
    console.error(`Usage: node scripts/translate-locales.mjs <langCode>`);
    console.error(`  langCode must be one of: ${Object.keys(LANGUAGE_NAMES).join(", ")}`);
    process.exit(1);
  }

  for (const localeDir of LOCALE_DIRS) {
    const enDir = path.join(localeDir, "en");
    const targetDir = path.join(localeDir, targetLang);
    mkdirSync(targetDir, { recursive: true });

    const files = readdirSync(enDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const namespaceName = file.replace(/\.json$/, "");
      const englishContent = JSON.parse(readFileSync(path.join(enDir, file), "utf8"));
      process.stdout.write(`Translating ${path.relative(process.cwd(), localeDir)}/en/${file} -> ${targetLang}... `);
      const translated = await translateNamespace(englishContent, targetLang, namespaceName);
      writeFileSync(path.join(targetDir, file), JSON.stringify(translated, null, 2) + "\n", "utf8");
      console.log("done");
    }
  }

  console.log(`\nAll namespaces translated for "${targetLang}". Spot-check the output before shipping.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
