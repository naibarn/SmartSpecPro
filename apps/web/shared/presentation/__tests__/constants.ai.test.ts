import { describe, expect, it, afterEach } from "vitest";

import {
  PRESENTATION_ERROR_CODE,
  PRESENTATION_ERROR_CODE_VALUES,
  PRESENTATION_AI_GENERATION_FLAG_ENV,
  isPresentationAIGenerationEnabled,
} from "../constants";
import { presentationAvailabilitySchema } from "../contracts";

describe("AI error codes in PRESENTATION_ERROR_CODE_VALUES", () => {
  it("includes PRESENTATION_AI_GENERATION_FAILED", () => {
    expect(PRESENTATION_ERROR_CODE_VALUES).toContain(
      "PRESENTATION_AI_GENERATION_FAILED",
    );
  });

  it("includes PRESENTATION_AI_INSUFFICIENT_CREDITS", () => {
    expect(PRESENTATION_ERROR_CODE_VALUES).toContain(
      "PRESENTATION_AI_INSUFFICIENT_CREDITS",
    );
  });

  it("includes PRESENTATION_AI_INVALID_RESPONSE", () => {
    expect(PRESENTATION_ERROR_CODE_VALUES).toContain(
      "PRESENTATION_AI_INVALID_RESPONSE",
    );
  });

  it("has matching entries in PRESENTATION_ERROR_CODE object", () => {
    expect(PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED).toBe(
      "PRESENTATION_AI_GENERATION_FAILED",
    );
    expect(PRESENTATION_ERROR_CODE.AI_INSUFFICIENT_CREDITS).toBe(
      "PRESENTATION_AI_INSUFFICIENT_CREDITS",
    );
    expect(PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE).toBe(
      "PRESENTATION_AI_INVALID_RESPONSE",
    );
  });
});

describe("PRESENTATION_AI_GENERATION_FLAG_ENV", () => {
  it("equals 'PRESENTATION_AI_GENERATION_ENABLED'", () => {
    expect(PRESENTATION_AI_GENERATION_FLAG_ENV).toBe(
      "PRESENTATION_AI_GENERATION_ENABLED",
    );
  });
});

describe("isPresentationAIGenerationEnabled()", () => {
  afterEach(() => {
    delete process.env.PRESENTATION_AI_GENERATION_ENABLED;
  });

  it("returns false when env var is unset (default OFF)", () => {
    delete process.env.PRESENTATION_AI_GENERATION_ENABLED;
    expect(isPresentationAIGenerationEnabled()).toBe(false);
  });

  it("returns true when env var is 'true'", () => {
    process.env.PRESENTATION_AI_GENERATION_ENABLED = "true";
    expect(isPresentationAIGenerationEnabled()).toBe(true);
  });

  it("returns true when env var is '1'", () => {
    process.env.PRESENTATION_AI_GENERATION_ENABLED = "1";
    expect(isPresentationAIGenerationEnabled()).toBe(true);
  });

  it("returns false when env var is 'false'", () => {
    process.env.PRESENTATION_AI_GENERATION_ENABLED = "false";
    expect(isPresentationAIGenerationEnabled()).toBe(false);
  });

  it("returns false when env var is '0'", () => {
    process.env.PRESENTATION_AI_GENERATION_ENABLED = "0";
    expect(isPresentationAIGenerationEnabled()).toBe(false);
  });

  it("returns false when env var is 'off'", () => {
    process.env.PRESENTATION_AI_GENERATION_ENABLED = "off";
    expect(isPresentationAIGenerationEnabled()).toBe(false);
  });

  it("returns false when env var is empty string", () => {
    process.env.PRESENTATION_AI_GENERATION_ENABLED = "";
    expect(isPresentationAIGenerationEnabled()).toBe(false);
  });
});

describe("presentationAvailabilitySchema with aiGenerationEnabled", () => {
  it("accepts existing shape without aiGenerationEnabled (backward compat)", () => {
    const result = presentationAvailabilitySchema.safeParse({
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts shape with aiGenerationEnabled: true", () => {
    const result = presentationAvailabilitySchema.safeParse({
      enabled: true,
      aiGenerationEnabled: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aiGenerationEnabled).toBe(true);
    }
  });

  it("accepts shape with aiGenerationEnabled: false", () => {
    const result = presentationAvailabilitySchema.safeParse({
      enabled: true,
      aiGenerationEnabled: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aiGenerationEnabled).toBe(false);
    }
  });

  it("defaults aiGenerationEnabled to undefined when omitted", () => {
    const result = presentationAvailabilitySchema.safeParse({
      enabled: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aiGenerationEnabled).toBeUndefined();
    }
  });
});
