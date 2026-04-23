import fs from "fs";
import path from "path";

import {
  buildSkillContractSnapshot,
  type SkillMaintenanceTarget,
  type SkillContractSnapshotData,
} from "./skillCompatibilityGate";

export interface SkillMaintenanceRecommendationDraft {
  recommendationType: string;
  title: string;
  summary: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  compatibilityStatus: "unknown" | "compatible" | "warning" | "blocked";
  proposedRuntime?: string | null;
  proposedAction?: string | null;
  isAutoApplySafe: boolean;
  isGenjsCandidate: boolean;
  affectedFiles: string[];
  details: Record<string, unknown>;
}

export type SkillUpgradePriorityTier = "low" | "medium" | "high" | "critical";

export interface SkillLegacyUpgradeSignals {
  hasRunScript: boolean;
  hasVerifyScript: boolean;
  hasModelCompatibilityDoc: boolean;
  hasSkillLock: boolean;
  hasCompatibilityMirror: boolean;
  hasSchemas: boolean;
  hasTests: boolean;
  hasFixtures: boolean;
  hasNativeBundleSurface: boolean;
}

export interface SkillMaintenanceAnalysisResult {
  skillSlug: string;
  qualityScore: number;
  currentRuntime: string;
  isGenjsCandidate: boolean;
  genjsCandidateScore: number;
  upgradePriorityScore: number;
  upgradePriorityTier: SkillUpgradePriorityTier;
  parallelUpgradeEligible: boolean;
  legacyUpgradeSignals: SkillLegacyUpgradeSignals;
  recommendations: SkillMaintenanceRecommendationDraft[];
  snapshot: SkillContractSnapshotData;
  facts: {
    hasInputSchema: boolean;
    hasOutputSchema: boolean;
    hasUiSchema: boolean;
    hasTests: boolean;
    hasFixtures: boolean;
    hasPackageJson: boolean;
    hasSandboxProfile: boolean;
    hasBundleManifest: boolean;
    hasNativeBundle: boolean;
    entrypoint: string | null;
  };
}

function readJson(filePath: string | null): Record<string, unknown> | null {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function pushRecommendation(
  sink: SkillMaintenanceRecommendationDraft[],
  draft: SkillMaintenanceRecommendationDraft,
): void {
  sink.push(draft);
}

function hasFile(snapshot: SkillContractSnapshotData, relativePath: string): boolean {
  return snapshot.fileInventory.includes(relativePath);
}

function computeLegacyUpgradeSignals(snapshot: SkillContractSnapshotData): SkillLegacyUpgradeSignals {
  const hasRunScript = hasFile(snapshot, "scripts/run.sh");
  const hasVerifyScript = hasFile(snapshot, "scripts/verify.sh");
  const hasModelCompatibilityDoc = hasFile(snapshot, "MODEL_COMPATIBILITY.md");
  const hasSkillLock = hasFile(snapshot, "skill.lock.json");
  const hasCompatibilityMirror = hasFile(snapshot, "skill.md") && hasFile(snapshot, "SKILL.md");
  const hasSchemas = hasFile(snapshot, "schemas/input.schema.json")
    || hasFile(snapshot, "schemas/output.schema.json")
    || hasFile(snapshot, "schemas/ui.schema.json");
  const hasTests = Boolean(snapshot.testsHash);
  const hasFixtures = Boolean(snapshot.fixtureHash);

  return {
    hasRunScript,
    hasVerifyScript,
    hasModelCompatibilityDoc,
    hasSkillLock,
    hasCompatibilityMirror,
    hasSchemas,
    hasTests,
    hasFixtures,
    hasNativeBundleSurface: hasRunScript && hasVerifyScript && hasModelCompatibilityDoc && hasSkillLock,
  };
}

function computeUpgradePriorityTier(score: number): SkillUpgradePriorityTier {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}

function computeUpgradePriorityScore(
  skill: SkillMaintenanceTarget,
  snapshot: SkillContractSnapshotData,
  signals: SkillLegacyUpgradeSignals,
  analysis: {
    isGenjsCandidate: boolean;
    genjsCandidateScore: number;
    facts: SkillMaintenanceAnalysisResult["facts"];
  },
): number {
  let score = 0;

  if (skill.executionMode === "sandbox-command" || skill.executionMode === "sandbox-code") {
    score += 18;
  } else if (skill.executionMode === "python") {
    score += 14;
  } else if (skill.executionMode === "llm-only") {
    score += 8;
  }

  if (!signals.hasRunScript) score += 18;
  if (!signals.hasVerifyScript) score += 18;
  if (!signals.hasSkillLock) score += 12;
  if (!signals.hasModelCompatibilityDoc) score += 8;
  if (!signals.hasNativeBundleSurface) score += 6;

  if (analysis.facts.hasTests) score += 8;
  if (analysis.facts.hasFixtures) score += 6;
  if (analysis.facts.hasInputSchema) score += 4;
  if (analysis.facts.hasOutputSchema) score += 4;
  if (analysis.facts.hasUiSchema) score += 2;
  if (analysis.isGenjsCandidate) score += Math.min(12, analysis.genjsCandidateScore);

  if (snapshot.runtimeProfile === "markdown-only") {
    score += 10;
  }
  if (snapshot.runtimeProfile === "python" || snapshot.runtimeProfile === "javascript-classic" || snapshot.runtimeProfile === "javascript-esm") {
    score += 6;
  }

  return Math.max(0, Math.min(100, score));
}

function detectEntrypoint(bundleDir: string | null): string | null {
  if (!bundleDir) {
    return null;
  }

  const candidates = [
    "src/index.mjs",
    "js/skill.mjs",
    "js/skill.js",
    "python/skill.py",
  ];

  for (const relativePath of candidates) {
    if (fs.existsSync(path.join(bundleDir, relativePath))) {
      return relativePath;
    }
  }

  return null;
}

function scoreGenjsCandidate(
  skill: SkillMaintenanceTarget,
  snapshot: SkillContractSnapshotData,
  packageJson: Record<string, unknown> | null,
): number {
  const parts: string[] = [];
  if (skill.name) parts.push(skill.name);
  if (skill.description) parts.push(skill.description);
  parts.push(JSON.stringify(snapshot.schemaSummary));
  parts.push(JSON.stringify(packageJson ?? {}));

  const haystack = parts.join(" ").toLowerCase();
  let score = 0;

  const keywords = [
    "json",
    "schema",
    "pipeline",
    "normalize",
    "plan",
    "render",
    "artifact",
    "api",
    "web",
    "automation",
    "slide",
    "storyboard",
    "layout",
    "pptx",
    "pptxgenjs",
    "document",
  ];

  for (const keyword of keywords) {
    if (haystack.includes(keyword)) {
      score += 1;
    }
  }

  const totalProperties = snapshot.schemaSummary.input.propertyCount + snapshot.schemaSummary.output.propertyCount;
  if (totalProperties >= 8) {
    score += 2;
  }
  if (snapshot.schemaSummary.input.requiredFields.length >= 4) {
    score += 1;
  }
  if (snapshot.schemaSummary.output.requiredFields.length >= 3) {
    score += 1;
  }
  if (skill.executionMode === "sandbox-command") {
    score += 2;
  }
  if (snapshot.runtimeProfile === "javascript-classic" || snapshot.runtimeProfile === "javascript-esm") {
    score += 1;
  }

  const dependencies = packageJson?.dependencies && typeof packageJson.dependencies === "object"
    ? Object.keys(packageJson.dependencies as Record<string, unknown>).map((value) => value.toLowerCase())
    : [];
  if (dependencies.includes("pptxgenjs")) {
    score += 4;
  }

  return score;
}

export function analyzeSkillForMaintenance(skill: SkillMaintenanceTarget): SkillMaintenanceAnalysisResult {
  const snapshot = buildSkillContractSnapshot(skill);
  const bundleDir = snapshot.bundleDir;
  const packageJsonPath = bundleDir ? path.join(bundleDir, "package.json") : null;
  const bundleManifestPath = bundleDir ? path.join(bundleDir, "skill.manifest.json") : null;
  const packageJson = readJson(packageJsonPath);
  const hasPackageJson = Boolean(packageJsonPath && fs.existsSync(packageJsonPath));
  const hasBundleManifest = Boolean(bundleManifestPath && fs.existsSync(bundleManifestPath));
  const hasTests = Boolean(snapshot.testsHash);
  const hasFixtures = Boolean(snapshot.fixtureHash);
  const entrypoint = detectEntrypoint(bundleDir);
  const hasSandboxProfile = Boolean(skill.sandboxProfileSlug?.trim());
  const recommendations: SkillMaintenanceRecommendationDraft[] = [];
  const legacyUpgradeSignals = computeLegacyUpgradeSignals(snapshot);

  if (!snapshot.schemaSummary.input.present) {
    pushRecommendation(recommendations, {
      recommendationType: "schema-tightening",
      title: "Add input schema coverage",
      summary: "This skill is missing input schema validation, which makes compatibility and admin tooling weaker.",
      riskLevel: "high",
      compatibilityStatus: "warning",
      proposedAction: "add-input-schema",
      proposedRuntime: null,
      isAutoApplySafe: false,
      isGenjsCandidate: false,
      affectedFiles: ["schemas/input.schema.json"],
      details: {},
    });
  }

  if (!snapshot.schemaSummary.output.present) {
    pushRecommendation(recommendations, {
      recommendationType: "schema-tightening",
      title: "Add output schema coverage",
      summary: "This skill is missing output schema documentation, so callers cannot rely on a stable structured contract.",
      riskLevel: "medium",
      compatibilityStatus: "warning",
      proposedAction: "add-output-schema",
      proposedRuntime: null,
      isAutoApplySafe: false,
      isGenjsCandidate: false,
      affectedFiles: ["schemas/output.schema.json"],
      details: {},
    });
  }

  if (!snapshot.schemaSummary.uiPresent) {
    pushRecommendation(recommendations, {
      recommendationType: "ui-schema-missing",
      title: "Add UI schema for admin/runtime forms",
      summary: "Adding ui.schema.json improves admin editing, validation hints, and future API/form integrations.",
      riskLevel: "low",
      compatibilityStatus: "compatible",
      proposedAction: "add-ui-schema",
      proposedRuntime: null,
      isAutoApplySafe: true,
      isGenjsCandidate: false,
      affectedFiles: ["schemas/ui.schema.json"],
      details: {},
    });
  }

  if (!hasTests) {
    pushRecommendation(recommendations, {
      recommendationType: "tests-missing",
      title: "Add tests and fixtures",
      summary: "This skill has no test inventory yet, which makes safe upgrades much harder to verify.",
      riskLevel: "medium",
      compatibilityStatus: "warning",
      proposedAction: "add-tests",
      proposedRuntime: null,
      isAutoApplySafe: false,
      isGenjsCandidate: false,
      affectedFiles: ["tests", "tests/fixtures"],
      details: {},
    });
  } else if (!hasFixtures) {
    pushRecommendation(recommendations, {
      recommendationType: "fixtures-missing",
      title: "Add fixture coverage for compatibility checks",
      summary: "The skill has tests, but no fixture/examples coverage for before/after contract verification.",
      riskLevel: "low",
      compatibilityStatus: "compatible",
      proposedAction: "add-fixtures",
      proposedRuntime: null,
      isAutoApplySafe: true,
      isGenjsCandidate: false,
      affectedFiles: ["tests/fixtures", "examples"],
      details: {},
    });
  }

  if (skill.executionMode === "sandbox-command" && !hasSandboxProfile) {
    pushRecommendation(recommendations, {
      recommendationType: "sandbox-profile-fix",
      title: "Set sandbox profile for sandbox-command skill",
      summary: "sandbox-command skills should declare a sandbox profile so runtime/tooling expectations are explicit and safe.",
      riskLevel: "high",
      compatibilityStatus: "blocked",
      proposedAction: "set-sandbox-profile",
      proposedRuntime: snapshot.runtimeProfile,
      isAutoApplySafe: false,
      isGenjsCandidate: false,
      affectedFiles: ["skill.md", "SKILL.md"],
      details: {},
    });
  }

  if (snapshot.runtimeProfile === "genjs" && !hasPackageJson) {
    pushRecommendation(recommendations, {
      recommendationType: "runtime-hardening",
      title: "Add package.json for GenJS bundle",
      summary: "A GenJS bundle should define package metadata and dependencies explicitly for repeatable sandbox execution.",
      riskLevel: "medium",
      compatibilityStatus: "warning",
      proposedAction: "add-package-json",
      proposedRuntime: "genjs",
      isAutoApplySafe: false,
      isGenjsCandidate: false,
      affectedFiles: ["package.json"],
      details: {},
    });
  }

  const genjsCandidateScore = scoreGenjsCandidate(skill, snapshot, packageJson);
  const isGenjsCandidate = genjsCandidateScore >= 8 && snapshot.runtimeProfile !== "genjs";

  const upgradePriorityScore = computeUpgradePriorityScore(skill, snapshot, legacyUpgradeSignals, {
    isGenjsCandidate,
    genjsCandidateScore,
    facts: {
      hasInputSchema: snapshot.schemaSummary.input.present,
      hasOutputSchema: snapshot.schemaSummary.output.present,
      hasUiSchema: snapshot.schemaSummary.uiPresent,
      hasTests,
      hasFixtures,
      hasPackageJson,
      hasSandboxProfile,
      hasBundleManifest,
      hasNativeBundle: snapshot.nativeBundleReady,
      entrypoint,
    },
  });
  const upgradePriorityTier = computeUpgradePriorityTier(upgradePriorityScore);
  const parallelUpgradeEligible = !snapshot.nativeBundleReady;

  if (!snapshot.nativeBundleReady) {
    pushRecommendation(recommendations, {
      recommendationType: "native-bundle-upgrade",
      title: "Upgrade this skill to the native bundle contract",
      summary: "This skill is a strong candidate for parallel migration into the native Agents Python bundle shape so it can benefit from the new runtime path.",
      riskLevel: upgradePriorityTier === "critical" ? "critical" : upgradePriorityTier === "high" ? "high" : "medium",
      compatibilityStatus: legacyUpgradeSignals.hasSkillLock ? "warning" : "blocked",
      proposedAction: "migrate-to-native-bundle",
      proposedRuntime: snapshot.runtimeProfile === "markdown-only" ? "agents_python" : null,
      isAutoApplySafe: false,
      isGenjsCandidate,
      affectedFiles: [
        "SKILL.md",
        "skill.md",
        "scripts/run.sh",
        "scripts/verify.sh",
        "references/",
        "MODEL_COMPATIBILITY.md",
        "skill.lock.json",
      ],
      details: {
        upgradePriorityScore,
        upgradePriorityTier,
        legacyUpgradeSignals,
        parallelUpgradeEligible,
      },
    });
  }
  if (isGenjsCandidate) {
    pushRecommendation(recommendations, {
      recommendationType: "migrate-to-genjs",
      title: "Upgrade this skill to a GenJS bundle",
      summary: "This skill looks JSON-heavy and artifact-oriented enough to benefit from a Node.js ESM bundle with modular pipeline files.",
      riskLevel: "medium",
      compatibilityStatus: "warning",
      proposedAction: "migrate-to-genjs",
      proposedRuntime: "genjs",
      isAutoApplySafe: false,
      isGenjsCandidate: true,
      affectedFiles: [
        "skill.manifest.json",
        "package.json",
        "src/index.mjs",
        "src/parse.mjs",
        "src/classify.mjs",
        "src/normalize.mjs",
        "src/planner.mjs",
        "src/renderer.mjs",
        "tests/fixtures",
      ],
      details: {
        candidateScore: genjsCandidateScore,
      },
    });
  }

  let qualityScore = 100;
  if (!snapshot.schemaSummary.input.present) qualityScore -= 20;
  if (!snapshot.schemaSummary.output.present) qualityScore -= 15;
  if (!snapshot.schemaSummary.uiPresent) qualityScore -= 5;
  if (!hasTests) qualityScore -= 20;
  if (!hasFixtures) qualityScore -= 5;
  if (skill.executionMode === "sandbox-command" && !hasSandboxProfile) qualityScore -= 15;
  if (snapshot.runtimeProfile === "genjs" && !hasPackageJson) qualityScore -= 10;
  if (!entrypoint) qualityScore -= 10;
  if (!hasBundleManifest && snapshot.runtimeProfile === "genjs") qualityScore -= 5;
  qualityScore = Math.max(0, Math.min(100, qualityScore));

  return {
    skillSlug: skill.slug,
    qualityScore,
    currentRuntime: snapshot.runtimeProfile,
    isGenjsCandidate,
    genjsCandidateScore,
    upgradePriorityScore,
    upgradePriorityTier,
    parallelUpgradeEligible,
    legacyUpgradeSignals,
    recommendations,
    snapshot,
    facts: {
      hasInputSchema: snapshot.schemaSummary.input.present,
      hasOutputSchema: snapshot.schemaSummary.output.present,
      hasUiSchema: snapshot.schemaSummary.uiPresent,
      hasTests,
      hasFixtures,
      hasPackageJson,
      hasSandboxProfile,
      hasBundleManifest,
      hasNativeBundle: snapshot.nativeBundleReady,
      entrypoint,
    },
  };
}
