/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const I18N_DIR = path.join(process.cwd(), "assets", "i18n");
const BASELINE_FILE = path.join(I18N_DIR, "en.json");

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in file: ${filePath}`);
  }
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSortedKeys(obj) {
  return Object.keys(obj).sort((a, b) => a.localeCompare(b));
}

function diffKeys(baselineKeys, otherKeys) {
  const baseline = new Set(baselineKeys);
  const other = new Set(otherKeys);

  const missing = baselineKeys.filter((k) => !other.has(k));
  const extra = otherKeys.filter((k) => !baseline.has(k));

  return { missing, extra };
}

function main() {
  if (!fs.existsSync(I18N_DIR)) {
    console.error(`[i18n] Directory not found: ${I18N_DIR}`);
    process.exit(1);
  }

  if (!fs.existsSync(BASELINE_FILE)) {
    console.error(`[i18n] Baseline file not found: ${BASELINE_FILE}`);
    process.exit(1);
  }

  const baselineJson = readJson(BASELINE_FILE);
  if (!isPlainObject(baselineJson)) {
    console.error("[i18n] Baseline JSON must be an object with string keys.");
    process.exit(1);
  }

  const baselineKeys = getSortedKeys(baselineJson);

  // Validate baseline values.
  let baselineValueErrors = 0;

  for (const k of baselineKeys) {
    const v = baselineJson[k];

    if (typeof v !== "string") {
      console.error(`[i18n] en.json value for key "${k}" must be a string.`);
      baselineValueErrors++;
      continue;
    }

    if (v.trim().length === 0) {
      console.error(`[i18n] en.json value for key "${k}" must not be empty.`);
      baselineValueErrors++;
    }
  }

  if (baselineValueErrors > 0) {
    console.error(
      `[i18n] Baseline validation failed with ${baselineValueErrors} error(s).`,
    );
    process.exit(1);
  }

  console.log(`[i18n] OK: en.json baseline validated (${baselineKeys.length} keys).`);
  
  const files = fs
    .readdirSync(I18N_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const targetFiles = files.filter((f) => f !== "en.json");

  if (targetFiles.length === 0) {
    console.log(
      "[i18n] No locale files found besides en.json. Nothing to validate.",
    );
    process.exit(0);
  }

  let hasErrors = false;

  for (const file of targetFiles) {
    const filePath = path.join(I18N_DIR, file);

    const json = readJson(filePath);
    if (!isPlainObject(json)) {
      console.error(`[i18n] ${file} must be a JSON object with string keys.`);
      hasErrors = true;
      continue;
    }

    const keys = getSortedKeys(json);

    const { missing, extra } = diffKeys(baselineKeys, keys);

    if (missing.length === 0 && extra.length === 0) {
      console.log(
        `[i18n] OK: ${file} matches en.json keys (${baselineKeys.length} keys).`,
      );
      continue;
    }

    hasErrors = true;
    console.error(`[i18n] Key mismatch in ${file}:`);

    if (missing.length > 0) {
      console.error(`  Missing keys (${missing.length}):`);
      for (const k of missing) console.error(`    - ${k}`);
    }

    if (extra.length > 0) {
      console.error(`  Extra keys (${extra.length}):`);
      for (const k of extra) console.error(`    - ${k}`);
    }
  }

  if (hasErrors) {
    console.error("[i18n] Validation failed.");
    process.exit(1);
  }

  console.log("[i18n] Validation passed.");
  process.exit(0);
}

main();
