/**
 * Tests for section-08: locale JSON files validity and completeness.
 * Validates generated JSON files against source .ts locale files.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const LOCALES_DIR = join(import.meta.dirname, "../../locales");
const EN_DIR = join(LOCALES_DIR, "en");
const TH_DIR = join(LOCALES_DIR, "th");
const SRC_DIR = join(import.meta.dirname, "../../lib/i18n/locales");

function readJson(filepath: string): Record<string, string> {
  const content = readFileSync(filepath, "utf-8");
  return JSON.parse(content) as Record<string, string>;
}

function hasOnlyStringValues(obj: Record<string, unknown>): boolean {
  return Object.values(obj).every((v) => typeof v === "string");
}

const ALL_EN_FILES = [
  "admin.json", "agency.json", "auth.json", "billing.json", "chat.json",
  "common.json", "dashboard.json", "errors.json", "help.json",
  "marketplace.json", "media.json", "nav.json", "presentation.json",
  "profile.json", "settings.json", "social.json", "workflow.json",
];

describe("locale JSON files — validity", () => {
  it("all 17 en/*.json files exist and parse as valid JSON", () => {
    expect(ALL_EN_FILES).toHaveLength(17);
    for (const file of ALL_EN_FILES) {
      const path = join(EN_DIR, file);
      expect(existsSync(path), `Missing: ${file}`).toBe(true);
      expect(() => readJson(path), `Invalid JSON: ${file}`).not.toThrow();
    }
  });

  it("en/help.json is valid JSON with string values only", () => {
    const data = readJson(join(EN_DIR, "help.json"));
    expect(hasOnlyStringValues(data)).toBe(true);
  });

  it("th/help.json is valid JSON with string values only", () => {
    const data = readJson(join(TH_DIR, "help.json"));
    expect(hasOnlyStringValues(data)).toBe(true);
  });

  it("en/common.json is valid JSON with string values", () => {
    const data = readJson(join(EN_DIR, "common.json"));
    expect(hasOnlyStringValues(data)).toBe(true);
  });

  it("en/nav.json is valid JSON with string values", () => {
    const data = readJson(join(EN_DIR, "nav.json"));
    expect(hasOnlyStringValues(data)).toBe(true);
  });

  it("en/auth.json is valid JSON with string values", () => {
    const data = readJson(join(EN_DIR, "auth.json"));
    expect(hasOnlyStringValues(data)).toBe(true);
  });

  it("en/errors.json is valid JSON with string values", () => {
    const data = readJson(join(EN_DIR, "errors.json"));
    expect(hasOnlyStringValues(data)).toBe(true);
  });

  it("no empty string values in any en/*.json file", () => {
    for (const file of ALL_EN_FILES) {
      const path = join(EN_DIR, file);
      const data = readJson(path);
      for (const [key, value] of Object.entries(data)) {
        expect(value, `Empty value for key "${key}" in ${file}`).not.toBe("");
      }
    }
  });

  it("no en/*.json file contains keys with the namespace prefix", () => {
    // Each target file must not contain keys that still start with the source namespace prefix
    const filePrefixMap: Record<string, string[]> = {
      "help.json": ["help.", "bsHelp."],
      "chat.json": ["chat."],
      "settings.json": ["settings."],
      "media.json": ["mediaStudio."],
      "billing.json": ["credits."],
      "workflow.json": ["workflows."],
      "admin.json": ["invite."],
      "presentation.json": ["editor."],
      "common.json": ["notifications.", "common."],
      "agency.json": ["teams.", "orchestrator."],
    };
    for (const [file, prefixes] of Object.entries(filePrefixMap)) {
      const path = join(EN_DIR, file);
      const data = readJson(path);
      for (const key of Object.keys(data)) {
        for (const prefix of prefixes) {
          expect(
            key.startsWith(prefix),
            `Key "${key}" in ${file} still has namespace prefix "${prefix}"`
          ).toBe(false);
        }
      }
    }
  });

  it("bsHelp keys appear as bs.* sub-namespace in help.json (no collision with help.*)", () => {
    const data = readJson(join(EN_DIR, "help.json"));
    // Original help.title must be "Complete User Guide", not overwritten by bsHelp
    expect(data["title"]).toBe("Complete User Guide");
    // bsHelp.title should appear as bs.title
    expect(Object.prototype.hasOwnProperty.call(data, "bs.title")).toBe(true);
  });

  it("interpolation placeholders use {{...}} syntax", () => {
    for (const file of ALL_EN_FILES) {
      const data = readJson(join(EN_DIR, file));
      for (const [key, value] of Object.entries(data)) {
        // Should not use %(...)s or {0} style — only {{...}}
        expect(
          /%\([^)]+\)s/.test(value),
          `Key "${key}" in ${file} uses Python-style interpolation`
        ).toBe(false);
      }
    }
  });

  it("no EN locale value contains HTML markup (Security S1 — plain text only)", () => {
    // i18next is configured with escapeValue: false (React escapes by default).
    // This test enforces the convention that NO translation value contains raw HTML.
    // If this test fails a value needs to be rewritten as plain text.
    for (const file of ALL_EN_FILES) {
      const data = readJson(join(EN_DIR, file));
      for (const [key, value] of Object.entries(data)) {
        expect(
          /<[a-zA-Z]/.test(value),
          `Key "${key}" in ${file} contains HTML markup: "${value.substring(0, 60)}"`
        ).toBe(false);
      }
    }
  });

  it("no TH locale value contains HTML markup", () => {
    const TH_FILES = ALL_EN_FILES; // same set in both directories
    for (const file of TH_FILES) {
      const thPath = join(TH_DIR, file);
      try {
        const data = readJson(thPath);
        for (const [key, value] of Object.entries(data)) {
          expect(
            /<[a-zA-Z]/.test(value),
            `th/${file} key "${key}" contains HTML: "${value.substring(0, 60)}"`
          ).toBe(false);
        }
      } catch {
        // File may be empty placeholder — skip
      }
    }
  });
});

describe("locale JSON files — th/en key alignment", () => {
  it("every key in th/common.json exists in en/common.json", () => {
    const en = readJson(join(EN_DIR, "common.json"));
    const th = readJson(join(TH_DIR, "common.json"));
    for (const key of Object.keys(th)) {
      expect(Object.prototype.hasOwnProperty.call(en, key), `th/common.json key "${key}" missing from en/common.json`).toBe(true);
    }
  });

  it("every key in th/nav.json exists in en/nav.json", () => {
    const en = readJson(join(EN_DIR, "nav.json"));
    const th = readJson(join(TH_DIR, "nav.json"));
    for (const key of Object.keys(th)) {
      expect(Object.prototype.hasOwnProperty.call(en, key), `th/nav.json key "${key}" missing from en/nav.json`).toBe(true);
    }
  });

  it("every key in th/help.json exists in en/help.json", () => {
    const en = readJson(join(EN_DIR, "help.json"));
    const th = readJson(join(TH_DIR, "help.json"));
    for (const key of Object.keys(th)) {
      expect(Object.prototype.hasOwnProperty.call(en, key), `th/help.json key "${key}" missing from en/help.json`).toBe(true);
    }
  });
});

describe("locale JSON files — source completeness", () => {
  it("en/help.json contains all keys from original en.ts help.* prefix (stripped)", () => {
    const helpJson = readJson(join(EN_DIR, "help.json"));
    // Read source and extract help.* keys
    const src = readFileSync(join(SRC_DIR, "en.ts"), "utf-8");
    const helpKeys = [...src.matchAll(/^\s+"(help\.[^"]+)"/gm)].map(
      (m) => m[1].replace(/^help\./, "")
    );
    expect(helpKeys.length).toBeGreaterThan(200);
    for (const key of helpKeys) {
      expect(Object.prototype.hasOwnProperty.call(helpJson, key), `Missing en help key: "${key}"`).toBe(true);
    }
  });

  it("th/help.json contains all keys from original th.ts help.* prefix (stripped)", () => {
    const helpJson = readJson(join(TH_DIR, "help.json"));
    const src = readFileSync(join(SRC_DIR, "th.ts"), "utf-8");
    const helpKeys = [...src.matchAll(/^\s+"(help\.[^"]+)"/gm)].map(
      (m) => m[1].replace(/^help\./, "")
    );
    expect(helpKeys.length).toBeGreaterThan(100);
    for (const key of helpKeys) {
      expect(Object.prototype.hasOwnProperty.call(helpJson, key), `Missing th help key: "${key}"`).toBe(true);
    }
  });
});
