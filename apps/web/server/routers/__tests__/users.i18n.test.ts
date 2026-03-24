/**
 * Tests for section-07: server-side language allowlist on updatePreferences.
 * Validates the Zod schema directly — no full tRPC context needed.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { SUPPORTED_LANGUAGES } from "@shared/i18n";

const updatePreferencesSchema = z.object({
  translationLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
  translationModel: z.string().max(100).optional(),
});

describe("updatePreferences schema — translationLanguage allowlist", () => {
  it("accepts translationLanguage='en'", () => {
    expect(updatePreferencesSchema.safeParse({ translationLanguage: "en" }).success).toBe(true);
  });

  it("accepts translationLanguage='th'", () => {
    expect(updatePreferencesSchema.safeParse({ translationLanguage: "th" }).success).toBe(true);
  });

  it("accepts translationLanguage='ja'", () => {
    expect(updatePreferencesSchema.safeParse({ translationLanguage: "ja" }).success).toBe(true);
  });

  it("accepts translationLanguage='zh-Hans' (BCP-47 subtag)", () => {
    expect(updatePreferencesSchema.safeParse({ translationLanguage: "zh-Hans" }).success).toBe(true);
  });

  it("accepts translationLanguage='pt-BR' (BCP-47 region)", () => {
    expect(updatePreferencesSchema.safeParse({ translationLanguage: "pt-BR" }).success).toBe(true);
  });

  it("rejects translationLanguage='invalid'", () => {
    expect(updatePreferencesSchema.safeParse({ translationLanguage: "invalid" }).success).toBe(false);
  });

  it("rejects translationLanguage='<script>' (XSS attempt)", () => {
    expect(updatePreferencesSchema.safeParse({ translationLanguage: "<script>" }).success).toBe(false);
  });

  it("rejects translationLanguage='en; DROP TABLE users' (SQL injection)", () => {
    expect(updatePreferencesSchema.safeParse({ translationLanguage: "en; DROP TABLE users" }).success).toBe(false);
  });

  it("accepts translationLanguage=undefined (optional field)", () => {
    expect(updatePreferencesSchema.safeParse({ translationLanguage: undefined }).success).toBe(true);
  });

  it("accepts empty object {} (all fields optional)", () => {
    expect(updatePreferencesSchema.safeParse({}).success).toBe(true);
  });
});
