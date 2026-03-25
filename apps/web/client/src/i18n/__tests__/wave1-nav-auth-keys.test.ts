/**
 * Tests for section-12: Wave 1 nav and auth JSON key completeness.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const EN_DIR = join(import.meta.dirname, "../../locales/en");
const TH_DIR = join(import.meta.dirname, "../../locales/th");

function readJson(filepath: string): Record<string, string> {
  return JSON.parse(readFileSync(filepath, "utf-8")) as Record<string, string>;
}

function hasKey(obj: Record<string, string>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

const REQUIRED_SIDEBAR_KEYS = [
  "sidebar.dashboard", "sidebar.chat", "sidebar.mediaStudio", "sidebar.skills",
  "sidebar.workflows", "sidebar.agencies", "sidebar.teams",
  "sidebar.mediaHistory", "sidebar.library", "sidebar.presentations",
  "sidebar.credits", "sidebar.settings",
];

const REQUIRED_NAVBAR_KEYS = [
  "navbar.home", "navbar.features", "navbar.workflows", "navbar.pricing",
  "navbar.gallery", "navbar.marketplace", "navbar.marketplaceSkills", "navbar.marketplaceAgencies",
  "navbar.docs", "navbar.blog", "navbar.contact",
  "navbar.signIn", "navbar.getStarted",
];

const REQUIRED_HEADER_KEYS = [
  "header.signOut", "header.profile", "header.search", "header.notifications",
];

const REQUIRED_LAYOUT_KEYS = [
  "layout.signInToContinue", "layout.authRequired", "layout.signIn",
];

const REQUIRED_LOGIN_KEYS = [
  "login.title", "login.emailLabel", "login.passwordLabel", "login.signIn",
  "login.forgotPassword", "login.noAccount", "login.continueWithGoogle",
  "login.continueWithGithub", "login.or", "login.subtitle",
  "login.twoFa.title", "login.twoFa.enterCode", "login.twoFa.verify",
  "login.verification.title", "login.verification.resend",
];

const REQUIRED_SIGNUP_KEYS = [
  "signUp.title", "signUp.email", "signUp.password", "signUp.createAccount",
  "signUp.fullName", "signUp.alreadyHaveAccount", "signUp.signIn",
];

const REQUIRED_FORGOT_KEYS = [
  "forgot.title", "forgot.chooseMethod", "forgot.sendToEmail",
  "forgot.backToLogin",
];

const REQUIRED_CALLBACK_KEYS = [
  "callback.processing", "callback.success", "callback.error",
];

const REQUIRED_VERIFY_KEYS = [
  "verify.title", "verify.verify", "verify.resend",
];

describe("en/nav.json — key completeness", () => {
  it("is valid JSON with only string values", () => {
    const data = readJson(join(EN_DIR, "nav.json"));
    expect(Object.values(data).every((v) => typeof v === "string")).toBe(true);
  });

  it("contains all required sidebar keys", () => {
    const data = readJson(join(EN_DIR, "nav.json"));
    for (const key of REQUIRED_SIDEBAR_KEYS) {
      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
    }
  });

  it("contains all required navbar keys", () => {
    const data = readJson(join(EN_DIR, "nav.json"));
    for (const key of REQUIRED_NAVBAR_KEYS) {
      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
    }
  });

  it("contains required header keys", () => {
    const data = readJson(join(EN_DIR, "nav.json"));
    for (const key of REQUIRED_HEADER_KEYS) {
      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
    }
  });

  it("contains layout keys", () => {
    const data = readJson(join(EN_DIR, "nav.json"));
    for (const key of REQUIRED_LAYOUT_KEYS) {
      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
    }
  });

  it("has no empty string values", () => {
    const data = readJson(join(EN_DIR, "nav.json"));
    for (const [k, v] of Object.entries(data)) {
      expect(v, `Empty value for "${k}"`).not.toBe("");
    }
  });
});

describe("th/nav.json — alignment", () => {
  it("keys are a subset of en/nav.json keys", () => {
    const en = readJson(join(EN_DIR, "nav.json"));
    const th = readJson(join(TH_DIR, "nav.json"));
    for (const key of Object.keys(th)) {
      expect(hasKey(en, key), `th key "${key}" not in en`).toBe(true);
    }
  });

  it("has no empty string values", () => {
    const data = readJson(join(TH_DIR, "nav.json"));
    for (const [k, v] of Object.entries(data)) {
      expect(v, `Empty value for "${k}"`).not.toBe("");
    }
  });
});

describe("en/auth.json — key completeness", () => {
  it("is valid JSON with only string values", () => {
    const data = readJson(join(EN_DIR, "auth.json"));
    expect(Object.values(data).every((v) => typeof v === "string")).toBe(true);
  });

  it("contains all required login keys", () => {
    const data = readJson(join(EN_DIR, "auth.json"));
    for (const key of REQUIRED_LOGIN_KEYS) {
      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
    }
  });

  it("contains all required signup keys", () => {
    const data = readJson(join(EN_DIR, "auth.json"));
    for (const key of REQUIRED_SIGNUP_KEYS) {
      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
    }
  });

  it("contains all required forgot keys", () => {
    const data = readJson(join(EN_DIR, "auth.json"));
    for (const key of REQUIRED_FORGOT_KEYS) {
      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
    }
  });

  it("contains callback keys", () => {
    const data = readJson(join(EN_DIR, "auth.json"));
    for (const key of REQUIRED_CALLBACK_KEYS) {
      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
    }
  });

  it("contains verify keys", () => {
    const data = readJson(join(EN_DIR, "auth.json"));
    for (const key of REQUIRED_VERIFY_KEYS) {
      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
    }
  });

  it("has no empty string values", () => {
    const data = readJson(join(EN_DIR, "auth.json"));
    for (const [k, v] of Object.entries(data)) {
      expect(v, `Empty value for "${k}"`).not.toBe("");
    }
  });
});

describe("th/auth.json — alignment", () => {
  it("keys are a subset of en/auth.json keys", () => {
    const en = readJson(join(EN_DIR, "auth.json"));
    const th = readJson(join(TH_DIR, "auth.json"));
    for (const key of Object.keys(th)) {
      expect(hasKey(en, key), `th key "${key}" not in en`).toBe(true);
    }
  });

  it("has no empty string values", () => {
    const data = readJson(join(TH_DIR, "auth.json"));
    for (const [k, v] of Object.entries(data)) {
      expect(v, `Empty value for "${k}"`).not.toBe("");
    }
  });
});
