/**
 * Tests for section-08: Wave 1 namespace key requirements.
 * Verifies that startup namespaces have all required keys.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const EN_DIR = join(import.meta.dirname, "../../locales/en");
const TH_DIR = join(import.meta.dirname, "../../locales/th");

function readJson(filepath: string): Record<string, string> {
  return JSON.parse(readFileSync(filepath, "utf-8")) as Record<string, string>;
}

const WAVE1_FILES = [
  "nav.json", "auth.json", "errors.json", "common.json", "dashboard.json",
];

const REQUIRED_NAV_KEYS = [
  "sidebar.dashboard", "sidebar.chat", "sidebar.mediaStudio", "sidebar.workflows",
  "sidebar.agencies", "sidebar.settings", "sidebar.credits",
  "header.search", "header.notifications", "header.signOut",
];

const REQUIRED_AUTH_KEYS = [
  "signIn.title", "signIn.emailLabel", "signIn.passwordLabel", "signIn.submitButton",
  "signIn.forgotPassword", "signIn.noAccount", "signIn.createAccount",
  "signUp.title", "signUp.email", "signUp.password", "signUp.createAccount",
  "mfa.title", "mfa.codeLabel", "mfa.submitButton",
  "resetPassword.title", "resetPassword.emailLabel", "resetPassword.submitButton",
  "callback.processing", "callback.error",
];

const REQUIRED_ERRORS_KEYS = [
  "notFound.title", "notFound.message",
  "serverError.title", "serverError.message",
  "forbidden.title", "forbidden.message",
  "networkError", "requestFailed",
  "validation.required", "validation.invalidEmail", "validation.passwordTooShort",
  "generic.somethingWentWrong", "generic.tryAgain",
  "session.expired",
];

const REQUIRED_COMMON_KEYS = [
  "save", "cancel", "delete", "edit", "create", "close", "back", "next",
  "submit", "confirm", "loading", "search", "filter", "sort", "required",
  "optional", "success", "error", "pending", "active", "inactive",
  "retry", "refresh", "copy", "copied", "selectAll", "deselectAll",
  "upload", "download", "export", "import", "showMore", "showLess",
  "yes", "no", "ok",
  "confirmDialog.title", "confirmDialog.irreversible",
  "pagination.showing", "pagination.page", "pagination.previous", "pagination.next",
  "emptyState.noItems", "emptyState.nothingYet", "emptyState.noResults",
  "toast.saved", "toast.deleted", "toast.copied", "toast.failed", "toast.created",
];

describe("Wave 1 namespace files", () => {
  it("all Wave 1 namespace files exist as valid JSON", () => {
    for (const file of WAVE1_FILES) {
      const path = join(EN_DIR, file);
      expect(existsSync(path), `Missing: ${file}`).toBe(true);
      expect(() => JSON.parse(readFileSync(path, "utf-8")), `Invalid JSON: ${file}`).not.toThrow();
    }
  });

  it("en/nav.json has all required sidebar and header keys", () => {
    const data = readJson(join(EN_DIR, "nav.json"));
    for (const key of REQUIRED_NAV_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(data, key), `Missing nav key: "${key}"`).toBe(true);
    }
  });

  it("en/auth.json has all required auth keys", () => {
    const data = readJson(join(EN_DIR, "auth.json"));
    for (const key of REQUIRED_AUTH_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(data, key), `Missing auth key: "${key}"`).toBe(true);
    }
  });

  it("en/errors.json has all required error keys", () => {
    const data = readJson(join(EN_DIR, "errors.json"));
    for (const key of REQUIRED_ERRORS_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(data, key), `Missing errors key: "${key}"`).toBe(true);
    }
  });

  it("en/common.json has all required common keys", () => {
    const data = readJson(join(EN_DIR, "common.json"));
    for (const key of REQUIRED_COMMON_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(data, key), `Missing common key: "${key}"`).toBe(true);
    }
  });

  it("en/dashboard.json exists and is valid JSON", () => {
    const path = join(EN_DIR, "dashboard.json");
    expect(existsSync(path)).toBe(true);
    expect(() => JSON.parse(readFileSync(path, "utf-8"))).not.toThrow();
  });

  it("no Wave 1 key has empty string value in en", () => {
    for (const file of WAVE1_FILES) {
      const data = readJson(join(EN_DIR, file));
      for (const [key, value] of Object.entries(data)) {
        expect(value, `Empty value for "${key}" in ${file}`).not.toBe("");
      }
    }
  });

  it("th/nav.json exists with required keys", () => {
    const data = readJson(join(TH_DIR, "nav.json"));
    for (const key of REQUIRED_NAV_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(data, key), `Missing th nav key: "${key}"`).toBe(true);
    }
  });

  it("th/auth.json exists with required keys", () => {
    const data = readJson(join(TH_DIR, "auth.json"));
    for (const key of REQUIRED_AUTH_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(data, key), `Missing th auth key: "${key}"`).toBe(true);
    }
  });

  it("th/errors.json exists with required keys", () => {
    const data = readJson(join(TH_DIR, "errors.json"));
    for (const key of REQUIRED_ERRORS_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(data, key), `Missing th errors key: "${key}"`).toBe(true);
    }
  });

  it("th/common.json has all required common keys", () => {
    const data = readJson(join(TH_DIR, "common.json"));
    for (const key of REQUIRED_COMMON_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(data, key), `Missing th common key: "${key}"`).toBe(true);
    }
  });
});
