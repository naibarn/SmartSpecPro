/**
 * Tests for section-13: Wave 1 dashboard, common, and errors namespace key completeness.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const EN_DIR = join(import.meta.dirname, "../../locales/en");
const TH_DIR = join(import.meta.dirname, "../../locales/th");

function readJson(filepath: string): Record<string, string> {
  return JSON.parse(readFileSync(filepath, "utf-8")) as Record<string, string>;
}

function hasKey(obj: Record<string, string>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

const REQUIRED_DASHBOARD_KEYS = [
  "welcome", "subtitle", "websitePreview", "signOut",
  "healthBadge.critical", "healthBadge.warning", "healthBadge.healthy",
  "prioritySnapshot.eyebrow", "prioritySnapshot.title", "prioritySnapshot.description",
  "nextBestActions.eyebrow", "nextBestActions.title", "nextBestActions.description",
  "trendHealth.eyebrow", "trendHealth.title", "trendHealth.description",
  "stats.creditsAvailable", "stats.thirtyDayUsage", "stats.requests", "stats.recentMediaJobs",
  "notices.pendingApprovals", "notices.failedGenerations", "notices.workflowsRunning",
  "notices.creditsLow", "notices.reviewCoverage", "notices.allHealthy",
  "quickActions.mediaStudio", "quickActions.chat", "quickActions.documentManagement",
  "quickActions.presentations", "quickActions.agencies", "quickActions.buyCredits",
  "status.completed", "status.processing", "status.pending", "status.failed", "status.cancelled",
  "momentum.noData", "momentum.insufficientHistory", "momentum.rising", "momentum.easing", "momentum.steady",
];

const REQUIRED_COMMON_KEYS = [
  "save", "cancel", "delete", "edit", "create", "close", "back", "next", "submit", "confirm",
  "search", "filter", "sort", "required", "optional", "loading", "success", "error",
  "pending", "active", "inactive",
  "confirmDialog.title", "confirmDialog.irreversible",
  "pagination.showing", "pagination.page", "pagination.previous", "pagination.next",
  "emptyState.noItems", "emptyState.nothingYet",
  "fileActions.upload", "fileActions.download", "fileActions.export", "fileActions.import",
  "toast.saved", "toast.deleted", "toast.copied", "toast.failed", "toast.updated",
];

const REQUIRED_ERRORS_KEYS = [
  "notFound.title", "notFound.description",
  "forbidden.title", "forbidden.description",
  "serverError.title", "serverError.description",
  "network.connectionLost", "network.requestFailed",
  "generic.somethingWentWrong", "generic.tryAgain",
  "validation.required", "validation.invalidEmail", "validation.passwordTooShort", "validation.passwordMismatch",
  "session.expired", "session.unauthorized",
];

describe("en/dashboard.json — key completeness", () => {
  it("is valid JSON with no empty string values", () => {
    const data = readJson(join(EN_DIR, "dashboard.json"));
    for (const [k, v] of Object.entries(data)) {
      expect(v, `Empty value for "${k}"`).not.toBe("");
    }
  });

  it("contains all required dashboard keys", () => {
    const data = readJson(join(EN_DIR, "dashboard.json"));
    for (const key of REQUIRED_DASHBOARD_KEYS) {
      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
    }
  });

  it("every key in th/dashboard.json exists in en/dashboard.json", () => {
    const en = readJson(join(EN_DIR, "dashboard.json"));
    const th = readJson(join(TH_DIR, "dashboard.json"));
    for (const key of Object.keys(th)) {
      expect(hasKey(en, key), `th key "${key}" not in en`).toBe(true);
    }
  });
});

describe("en/common.json — key completeness", () => {
  it("is valid JSON with no empty string values", () => {
    const data = readJson(join(EN_DIR, "common.json"));
    for (const [k, v] of Object.entries(data)) {
      expect(v, `Empty value for "${k}"`).not.toBe("");
    }
  });

  it("contains all required common keys", () => {
    const data = readJson(join(EN_DIR, "common.json"));
    for (const key of REQUIRED_COMMON_KEYS) {
      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
    }
  });

  it("every key in th/common.json exists in en/common.json", () => {
    const en = readJson(join(EN_DIR, "common.json"));
    const th = readJson(join(TH_DIR, "common.json"));
    for (const key of Object.keys(th)) {
      expect(hasKey(en, key), `th key "${key}" not in en`).toBe(true);
    }
  });
});

describe("en/errors.json — key completeness", () => {
  it("is valid JSON with no empty string values", () => {
    const data = readJson(join(EN_DIR, "errors.json"));
    for (const [k, v] of Object.entries(data)) {
      expect(v, `Empty value for "${k}"`).not.toBe("");
    }
  });

  it("contains all required errors keys", () => {
    const data = readJson(join(EN_DIR, "errors.json"));
    for (const key of REQUIRED_ERRORS_KEYS) {
      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
    }
  });

  it("every key in th/errors.json exists in en/errors.json", () => {
    const en = readJson(join(EN_DIR, "errors.json"));
    const th = readJson(join(TH_DIR, "errors.json"));
    for (const key of Object.keys(th)) {
      expect(hasKey(en, key), `th key "${key}" not in en`).toBe(true);
    }
  });
});

describe("Dashboard.tsx — uses useTranslation", () => {
  it("Dashboard.tsx imports useTranslation from react-i18next", () => {
    const src = readFileSync(join(import.meta.dirname, "../../pages/Dashboard.tsx"), "utf-8");
    expect(src).toContain("useTranslation");
  });

  it("Dashboard.tsx uses t() for welcome message", () => {
    const src = readFileSync(join(import.meta.dirname, "../../pages/Dashboard.tsx"), "utf-8");
    expect(src).toContain("t('dashboard:welcome'");
  });

  it("Dashboard.tsx uses t() for stats labels", () => {
    const src = readFileSync(join(import.meta.dirname, "../../pages/Dashboard.tsx"), "utf-8");
    expect(src).toContain("dashboard:stats.creditsAvailable");
  });

  it("Dashboard.tsx uses t() for healthBadge labels", () => {
    const src = readFileSync(join(import.meta.dirname, "../../pages/Dashboard.tsx"), "utf-8");
    expect(src).toContain("dashboard:healthBadge.critical");
    expect(src).toContain("dashboard:healthBadge.healthy");
  });

  it("Dashboard.tsx uses t() for notices", () => {
    const src = readFileSync(join(import.meta.dirname, "../../pages/Dashboard.tsx"), "utf-8");
    expect(src).toContain("dashboard:notices.pendingApprovals");
    expect(src).toContain("dashboard:notices.allHealthy");
  });

  it("Dashboard.tsx uses t() for quickActions", () => {
    const src = readFileSync(join(import.meta.dirname, "../../pages/Dashboard.tsx"), "utf-8");
    expect(src).toContain("dashboard:quickActions.mediaStudio");
  });
});
