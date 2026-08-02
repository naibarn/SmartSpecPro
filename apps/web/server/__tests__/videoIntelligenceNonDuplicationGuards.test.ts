/**
 * Feature 142 — section-08 §5.3. The normative §2.3 guards, all fs-based,
 * zero mocks. Direct precedent:
 * `server/__tests__/verticalDramaEpisodeStageJobsWiring.test.ts`.
 *
 * ⚠️ Anchoring is mandatory. Every "X is absent" assertion below is paired
 * with a non-vacuity assertion that the file set / key list it scanned is
 * non-empty and contains a known member — an absence assertion over an
 * empty set passes forever.
 *
 * A type-level guard cannot be asserted at runtime. The tests in the first
 * `describe` block below prove the assertion is *declared* and (for the
 * shared, non-inline form) *delegates to the single canonical list*; the
 * actual enforcement that the constraint holds is `tsc` — see this
 * section's §7 manual compile gate, performed once per interface.
 */
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { MEDIA_GENERATION_EFFECT_MEMBER_NAMES } from "../../shared/videoIntelligence/effectGuards";

const SERVER_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const QUALITY_LOOP_PATH = path.join(SERVER_ROOT, "services/videoProjectQualityLoop.ts");
const SCENE_PLANNER_PATH = path.join(SERVER_ROOT, "services/videoProjectScenePlanner.ts");
const REPAIR_APPLIER_PATH = path.join(SERVER_ROOT, "services/videoProjectRepairApplier.ts");
const ROUTER_PATH = path.join(SERVER_ROOT, "routers/videoProjects.ts");
const SCENE_PLAN_OUTPUT_SCHEMA_PATH = path.join(
  SERVER_ROOT,
  "..",
  "skills/video-project-scene-plan/schemas/output.schema.json",
);

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

/* -------------------------------------------------------------------------- */
/* Effects interfaces cannot gain a media-generation member                  */
/* -------------------------------------------------------------------------- */

describe("effects interfaces cannot gain a media-generation member", () => {
  const qualityLoopSource = readFile(QUALITY_LOOP_PATH);
  const scenePlannerSource = readFile(SCENE_PLANNER_PATH);
  const repairApplierSource = readFile(REPAIR_APPLIER_PATH);

  function declaresGuard(source: string, aliasName: string): boolean {
    return new RegExp(`export type ${aliasName}\\b`).test(source);
  }

  it("VideoProjectQualityLoopEffects declares a media-generation compile assertion", () => {
    expect(declaresGuard(qualityLoopSource, "AssertNoMediaGenerationEffectMember")).toBe(true);
  });

  it("ScenePlanEffects declares a media-generation compile assertion", () => {
    expect(declaresGuard(scenePlannerSource, "AssertScenePlanHasNoMediaGeneration")).toBe(true);
  });

  it("RepairEffects declares a media-generation compile assertion", () => {
    expect(declaresGuard(repairApplierSource, "AssertNoMediaGenerationRepairEffectMember")).toBe(true);
  });

  it("MEDIA_GENERATION_EFFECT_MEMBER_NAMES is non-empty and includes generateImage", () => {
    // Non-vacuity anchor for every "covers the full list" check below.
    expect(MEDIA_GENERATION_EFFECT_MEMBER_NAMES.length).toBeGreaterThan(0);
    expect(MEDIA_GENERATION_EFFECT_MEMBER_NAMES).toContain("generateImage");
    expect(MEDIA_GENERATION_EFFECT_MEMBER_NAMES.length).toBe(9);
  });

  it("each assertion covers the FULL canonical member list, not a stale subset", () => {
    const guards: Array<{ source: string; aliasName: string }> = [
      { source: qualityLoopSource, aliasName: "AssertNoMediaGenerationEffectMember" },
      { source: scenePlannerSource, aliasName: "AssertScenePlanHasNoMediaGeneration" },
      { source: repairApplierSource, aliasName: "AssertNoMediaGenerationRepairEffectMember" },
    ];

    for (const { source, aliasName } of guards) {
      const delegatesToSharedCanonicalList =
        /from\s+["']@shared\/videoIntelligence\/effectGuards["']/.test(source) &&
        /(ForbiddenMediaGenerationEffectMembers|AssertNoMediaGenerationEffects)/.test(source);

      if (delegatesToSharedCanonicalList) {
        // Covered by construction: the shared module is the SINGLE source of
        // truth for the member list (proven non-empty/complete above), so a
        // file that delegates to it can never drift into a stale subset —
        // that is the entire point of the unification (section-08 §6.1).
        continue;
      }

      // A section is free to keep its guard inline (section-08 §6.1's
      // explicit fallback) — but then EVERY one of the nine names must
      // appear literally; six of nine is exactly the drift this unification
      // exists to prevent.
      for (const name of MEDIA_GENERATION_EFFECT_MEMBER_NAMES) {
        expect(
          source.includes(`"${name}"`),
          `${aliasName}: inline guard is missing forbidden member "${name}"`,
        ).toBe(true);
      }
    }
  });

  function extractTypeLiteralBody(source: string, typeName: string): string {
    const match = source.match(new RegExp(`export type ${typeName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
    if (!match) {
      throw new Error(`extractTypeLiteralBody: could not find "${typeName}" in the given source`);
    }
    return match[1]!;
  }

  it("no effects interface actually declares one of the forbidden members", () => {
    const bodies: Array<{ label: string; body: string; knownMember: string }> = [
      {
        label: "VideoProjectQualityLoopEffects",
        body: extractTypeLiteralBody(qualityLoopSource, "VideoProjectQualityLoopEffects"),
        knownMember: "runReview",
      },
      {
        label: "ScenePlanEffects",
        body: extractTypeLiteralBody(scenePlannerSource, "ScenePlanEffects"),
        knownMember: "runPlanSkill",
      },
      {
        label: "RepairEffects",
        body: extractTypeLiteralBody(repairApplierSource, "RepairEffects"),
        knownMember: "rewriteForStage",
      },
    ];

    for (const { label, body, knownMember } of bodies) {
      // Anchor: the extracted body is non-empty and contains a real member —
      // proves the extraction itself works, not just that it's absent.
      expect(body.includes(knownMember), `${label}: extraction sanity check failed`).toBe(true);

      for (const name of MEDIA_GENERATION_EFFECT_MEMBER_NAMES) {
        const wordBoundary = new RegExp(`\\b${name}\\b`);
        expect(wordBoundary.test(body), `${label} unexpectedly declares forbidden member "${name}"`).toBe(
          false,
        );
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* No Video Intelligence service imports a media-generation entry point      */
/* -------------------------------------------------------------------------- */

/**
 * Banned import specifiers (section-08 §6.2). Kept in one exported const
 * with a comment per entry — do NOT loosen this list to make a real
 * violation pass; the import is the bug, not the guard.
 */
const BANNED_IMPORT_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /mediaGenerationService/i, reason: "the generic media-generation orchestration service" },
  { pattern: /mcpMediaAdapter/i, reason: "the MCP media adapter (image/video/audio generation)" },
  { pattern: /hermesMediaAdapter/i, reason: "the Hermes/Grok media adapter" },
  { pattern: /remotionRenderVideo|renderQueue|ffmpeg/i, reason: "a render/ffmpeg entry point" },
  { pattern: /verticalDrama.*ImageGeneration/i, reason: "a Vertical Drama image-generation module" },
];

function extractImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /import\s+[\s\S]*?from\s+["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(source))) {
      specifiers.push(match[1]!);
    }
  }
  return specifiers;
}

/** Extracts every `import ... from "X"` STATEMENT's full text (not just the
 *  specifier) so named-import identifiers (e.g. `deductCredits`) can be
 *  checked without a raw whole-file substring search catching a docstring. */
function extractImportStatementTexts(source: string): string[] {
  const re = /import\s+[\s\S]*?from\s+["'][^"']+["']/g;
  return source.match(re) ?? [];
}

describe("no Video Intelligence service imports a media-generation entry point", () => {
  const serviceFileNames = fs
    .readdirSync(path.join(SERVER_ROOT, "services"), { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => name.endsWith(".ts"))
    .filter(name => name.startsWith("videoProject") || name.startsWith("videoIntelligence"));

  const scannedFiles = serviceFileNames.map(name => ({
    name,
    source: readFile(path.join(SERVER_ROOT, "services", name)),
  }));

  it("scans a NON-EMPTY set that includes the planner, the applier and the loop", () => {
    // Non-vacuity anchor — every "no file imports X" assertion below is
    // meaningless over an empty set.
    expect(scannedFiles.length).toBeGreaterThan(0);
    const names = scannedFiles.map(f => f.name);
    expect(names).toContain("videoProjectScenePlanner.ts");
    expect(names).toContain("videoProjectRepairApplier.ts");
    expect(names).toContain("videoProjectQualityLoop.ts");
  });

  it("no scanned file imports mediaGenerationService / mcpMediaAdapter / hermesMediaAdapter", () => {
    for (const { name, source } of scannedFiles) {
      const specifiers = extractImportSpecifiers(source);
      for (const specifier of specifiers) {
        for (const banned of ["mediaGenerationService", "mcpMediaAdapter", "hermesMediaAdapter"]) {
          expect(
            specifier.toLowerCase().includes(banned.toLowerCase()),
            `${name} imports banned specifier "${specifier}" (matches "${banned}")`,
          ).toBe(false);
        }
      }
    }
  });

  it("no scanned file imports a render-queue or ffmpeg entry point", () => {
    for (const { name, source } of scannedFiles) {
      const specifiers = extractImportSpecifiers(source);
      for (const specifier of specifiers) {
        const bannedMatch = BANNED_IMPORT_PATTERNS.find(({ pattern }) => pattern.test(specifier));
        expect(
          Boolean(bannedMatch),
          `${name} imports "${specifier}" — ${bannedMatch?.reason ?? ""}`,
        ).toBe(false);
      }
    }
  });

  it("matches IMPORT SPECIFIERS only, so a docstring mentioning the ban does not fail", () => {
    // Anchor: at least one scanned file's DOCSTRING mentions a banned name —
    // proving a raw substring search over the whole file would have failed
    // here, and that this guard's specifier-only matcher correctly does not.
    const creditGuardsSource = scannedFiles.find(f => f.name === "videoIntelligenceCreditGuards.ts")?.source;
    expect(creditGuardsSource, "fixture file missing from the scanned set").toBeTruthy();
    expect(creditGuardsSource).toMatch(/deductCredits/); // present in prose
    const specifiers = extractImportSpecifiers(creditGuardsSource!);
    expect(specifiers.some(s => /creditService/i.test(s))).toBe(false);
  });

  it("no Video Intelligence service imports deductCredits or deductCreditsForModel", () => {
    for (const { name, source } of scannedFiles) {
      const importStatements = extractImportStatementTexts(source);
      for (const statement of importStatements) {
        for (const bannedSymbol of ["deductCredits", "deductCreditsForModel"]) {
          const re = new RegExp(`\\b${bannedSymbol}\\b`);
          expect(
            re.test(statement),
            `${name} imports "${bannedSymbol}" — this feature charges nothing (AD-7)`,
          ).toBe(false);
        }
      }
    }
  });

  it("routers/videoProjects.ts is EXCLUDED from this guard — it legitimately imports the Lane-A render dispatch", () => {
    // routers/videoProjects.ts imports queueRemotionRenderVideoJob
    // (workerSchedulerService.ts), which submits a render job on a SEPARATE,
    // pre-existing path (Lane-A) this feature does not touch — the ONE
    // documented exclusion (section-08 §6.2). Any SECOND exclusion needs the
    // same written justification; do not add one without it.
    const routerSource = readFile(ROUTER_PATH);
    expect(routerSource).toMatch(/queueRemotionRenderVideoJob/);
    // Anchor + documentation: prove the file exists and is the one excluded,
    // rather than silently widening the scanned-file set to include it.
    expect(fs.existsSync(ROUTER_PATH)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Scene-plan output schema plans structure, never pixels                    */
/* -------------------------------------------------------------------------- */

const FORBIDDEN_PROPERTY_NAME_PATTERN = /prompt|imagePrompt|videoPrompt|negativePrompt/i;

/**
 * Recursively collects every property NAME anywhere in a JSON Schema
 * document — `properties`, `items` (array or tuple form), `$defs`,
 * `definitions`, and `oneOf`/`anyOf`/`allOf` branches. No shallow check.
 */
function collectSchemaPropertyNames(schema: unknown, acc: string[] = []): string[] {
  if (!schema || typeof schema !== "object") return acc;
  const node = schema as Record<string, unknown>;

  if (node.properties && typeof node.properties === "object") {
    for (const [key, value] of Object.entries(node.properties as Record<string, unknown>)) {
      acc.push(key);
      collectSchemaPropertyNames(value, acc);
    }
  }

  if (node.items) {
    if (Array.isArray(node.items)) {
      for (const item of node.items) collectSchemaPropertyNames(item, acc);
    } else {
      collectSchemaPropertyNames(node.items, acc);
    }
  }

  for (const key of ["$defs", "definitions"]) {
    const defs = node[key];
    if (defs && typeof defs === "object") {
      for (const value of Object.values(defs as Record<string, unknown>)) {
        collectSchemaPropertyNames(value, acc);
      }
    }
  }

  for (const key of ["oneOf", "anyOf", "allOf"]) {
    const branches = node[key];
    if (Array.isArray(branches)) {
      for (const branch of branches) collectSchemaPropertyNames(branch, acc);
    }
  }

  return acc;
}

describe("scene-plan skill output schema plans structure, never pixels", () => {
  const schema = JSON.parse(readFile(SCENE_PLAN_OUTPUT_SCHEMA_PATH));

  it("has NO property name matching /prompt|imagePrompt|videoPrompt|negativePrompt/i, recursively", () => {
    const names = collectSchemaPropertyNames(schema);
    // Anchor — the schema genuinely has properties to walk.
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain("templateParams");

    const forbidden = names.filter(name => FORBIDDEN_PROPERTY_NAME_PATTERN.test(name));
    expect(forbidden).toEqual([]);
  });

  it("walks properties, items, $defs, definitions, oneOf/anyOf/allOf", () => {
    const fixture = {
      type: "object",
      properties: {
        safeTop: { type: "string" },
        nested: { type: "object", properties: { safeNested: { type: "string" } } },
      },
      items: { properties: { safeItems: { type: "string" } } },
      $defs: { Def1: { properties: { safeDefs: { type: "string" } } } },
      definitions: { Def2: { properties: { safeDefinitions: { type: "string" } } } },
      oneOf: [{ properties: { safeOneOf: { type: "string" } } }],
      anyOf: [{ properties: { safeAnyOf: { type: "string" } } }],
      allOf: [{ properties: { safeAllOf: { type: "string" } } }],
    };

    const names = collectSchemaPropertyNames(fixture);
    for (const expected of [
      "safeTop",
      "nested",
      "safeNested",
      "safeItems",
      "safeDefs",
      "safeDefinitions",
      "safeOneOf",
      "safeAnyOf",
      "safeAllOf",
    ]) {
      expect(names, `walker did not find "${expected}"`).toContain(expected);
    }
  });

  it("finds a planted forbidden key in a fixture object", () => {
    const fixture = {
      properties: {
        ok: { type: "string" },
        nested: { properties: { videoPrompt: { type: "string" } } },
      },
    };
    const names = collectSchemaPropertyNames(fixture);
    const forbidden = names.filter(name => FORBIDDEN_PROPERTY_NAME_PATTERN.test(name));
    expect(forbidden).toContain("videoPrompt");
  });
});

/* -------------------------------------------------------------------------- */
/* Nothing is left un-wired                                                   */
/* -------------------------------------------------------------------------- */

function listFilesRecursively(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursively(full, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

describe("nothing is left un-wired", () => {
  const scannedDirs = [
    path.join(SERVER_ROOT, "routers"),
    path.join(SERVER_ROOT, "services"),
    path.join(REPO_ROOT, "client", "src", "components", "videoStudio"),
    path.join(REPO_ROOT, "shared", "videoIntelligence"),
  ];
  const scannedFiles = scannedDirs.flatMap(dir => listFilesRecursively(dir, [".ts", ".tsx"]));

  it("scans a non-empty file set", () => {
    expect(scannedFiles.length).toBeGreaterThan(0);
    expect(scannedFiles.some(f => f.endsWith("videoProjects.ts"))).toBe(true);
  });

  it("no source file contains VI_SCENE_PLAN_NOT_WIRED / VI_QUALITY_REVIEW_NOT_WIRED / VI_QUALITY_REPAIR_NOT_WIRED", () => {
    const forbiddenStrings = [
      "VI_SCENE_PLAN_NOT_WIRED",
      "VI_QUALITY_REVIEW_NOT_WIRED",
      "VI_QUALITY_REPAIR_NOT_WIRED",
    ];
    for (const filePath of scannedFiles) {
      const source = readFile(filePath);
      for (const needle of forbiddenStrings) {
        expect(source.includes(needle), `${filePath} still contains "${needle}"`).toBe(false);
      }
    }
  });

  it("NotWiredJobCard.tsx and NotWiredJobCard.test.tsx no longer exist", () => {
    const componentPath = path.join(
      REPO_ROOT,
      "client/src/components/videoStudio/NotWiredJobCard.tsx",
    );
    const testPath = path.join(
      REPO_ROOT,
      "client/src/components/videoStudio/__tests__/NotWiredJobCard.test.tsx",
    );
    expect(fs.existsSync(componentPath)).toBe(false);
    expect(fs.existsSync(testPath)).toBe(false);
  });
});
