/**
 * Tests for section-07: server-side language allowlist on updatePreferences.
 * Validates the Zod schema directly — no full tRPC context needed.
 *
 * IMPORTANT: Keep this schema in sync with users.ts updatePreferences input.
 * Both translationLanguage and displayLocale must use z.enum(SUPPORTED_LANGUAGES).
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { SUPPORTED_LANGUAGES } from "@shared/i18n";

const updatePreferencesSchema = z.object({
  translationLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
  translationModel: z.string().max(100).optional(),
  displayLocale: z.enum(SUPPORTED_LANGUAGES).optional(),
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

describe("updatePreferences schema — displayLocale allowlist", () => {
  it("accepts displayLocale='en'", () => {
    expect(updatePreferencesSchema.safeParse({ displayLocale: "en" }).success).toBe(true);
  });

  it("accepts displayLocale='th'", () => {
    expect(updatePreferencesSchema.safeParse({ displayLocale: "th" }).success).toBe(true);
  });

  it("accepts displayLocale='zh-Hans' (BCP-47 subtag)", () => {
    expect(updatePreferencesSchema.safeParse({ displayLocale: "zh-Hans" }).success).toBe(true);
  });

  it("rejects displayLocale='<script>' (XSS attempt)", () => {
    expect(updatePreferencesSchema.safeParse({ displayLocale: "<script>" }).success).toBe(false);
  });

  it("rejects displayLocale='invalid'", () => {
    expect(updatePreferencesSchema.safeParse({ displayLocale: "invalid" }).success).toBe(false);
  });

  it("rejects displayLocale='en; DROP TABLE users' (SQL injection)", () => {
    expect(updatePreferencesSchema.safeParse({ displayLocale: "en; DROP TABLE users" }).success).toBe(false);
  });

  it("accepts displayLocale=undefined (optional)", () => {
    expect(updatePreferencesSchema.safeParse({ displayLocale: undefined }).success).toBe(true);
  });

  it("accepts both translationLanguage and displayLocale together", () => {
    expect(
      updatePreferencesSchema.safeParse({ translationLanguage: "th", displayLocale: "th" }).success
    ).toBe(true);
  });
});
