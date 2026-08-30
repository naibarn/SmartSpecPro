/**
 * Locale parity tests — EN is the authoritative source.
 * Every key in any EN namespace file must have a corresponding TH translation.
 * Prevents silent fallback-to-key-string regressions when new EN strings are added.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const EN_DIR = join(import.meta.dirname, "../../locales/en");
const TH_DIR = join(import.meta.dirname, "../../locales/th");

// Startup namespaces that must have full TH coverage
const FULL_COVERAGE_NAMESPACES = ["nav", "auth", "common", "errors"];

// Namespaces that may have partial TH coverage (Wave 2+ target)
const PARTIAL_COVERAGE_NAMESPACES = [
  "help",
  "chat",
  "settings",
  "media",
  "billing",
  "workflow",
  "admin",
  "presentation",
  "agency",
  "dashboard",
];

function readJson(filepath: string): Record<string, string> {
  try {
    return JSON.parse(readFileSync(filepath, "utf-8")) as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

describe("EN/TH locale parity — startup namespaces (must be complete)", () => {
  for (const ns of FULL_COVERAGE_NAMESPACES) {
    it(`every key in en/${ns}.json has a TH translation`, () => {
      const en = readJson(join(EN_DIR, `${ns}.json`));
      const th = readJson(join(TH_DIR, `${ns}.json`));

      const enKeys = Object.keys(en).sort();
      const thKeys = Object.keys(th).sort();

      const missingInTh = enKeys.filter(
        k => !Object.prototype.hasOwnProperty.call(th, k)
      );
      expect(
        missingInTh,
        `en/${ns}.json has keys missing in th/${ns}.json: ${missingInTh.slice(0, 5).join(", ")}${missingInTh.length > 5 ? " ..." : ""}`
      ).toHaveLength(0);

      // Also assert no extra TH keys (would indicate stale/orphaned translations)
      const extraInTh = thKeys.filter(
        k => !Object.prototype.hasOwnProperty.call(en, k)
      );
      expect(
        extraInTh,
        `th/${ns}.json has orphaned keys not in en/${ns}.json: ${extraInTh.slice(0, 5).join(", ")}${extraInTh.length > 5 ? " ..." : ""}`
      ).toHaveLength(0);
    });
  }
});

describe("EN/TH locale parity — all namespaces exist in both langs", () => {
  it("every en/*.json file has a corresponding th/*.json file", () => {
    const enFiles = readdirSync(EN_DIR).filter(f => f.endsWith(".json"));
    for (const file of enFiles) {
      const thPath = join(TH_DIR, file);
      let thExists = false;
      try {
        readFileSync(thPath);
        thExists = true;
      } catch {
        thExists = false;
      }
      expect(thExists, `Missing th/${file}`).toBe(true);
    }
  });

  it("no EN namespace has empty string values", () => {
    const enFiles = readdirSync(EN_DIR).filter(f => f.endsWith(".json"));
    for (const file of enFiles) {
      const data = readJson(join(EN_DIR, file));
      for (const [key, value] of Object.entries(data)) {
        expect(value, `en/${file}: empty value for key "${key}"`).not.toBe("");
      }
    }
  });
});

describe("EN/TH locale parity — partial coverage namespaces (TH keys must be subset of EN)", () => {
  for (const ns of PARTIAL_COVERAGE_NAMESPACES) {
    it(`every key in th/${ns}.json exists in en/${ns}.json (no orphaned TH keys)`, () => {
      const en = readJson(join(EN_DIR, `${ns}.json`));
      const th = readJson(join(TH_DIR, `${ns}.json`));
      const orphaned = Object.keys(th).filter(
        k => !Object.prototype.hasOwnProperty.call(en, k)
      );
      expect(
        orphaned,
        `th/${ns}.json has orphaned keys: ${orphaned.slice(0, 5).join(", ")}`
      ).toHaveLength(0);
    });
  }
});
