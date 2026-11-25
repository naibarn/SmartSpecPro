import { beforeAll, describe, expect, it } from "vitest";

type ImagePromptValidationIssue =
  | "prompt_missing"
  | "prompt_too_short"
  | "prompt_too_long"
  | "vertical_format_missing"
  | "reference_lock_missing"
  | "composition_missing"
  | "no_text_directive_missing";

type GenerateAttemptInput = {
  attempt: 1 | 2;
  requestIdempotencyKey: string;
  recoveryInstruction?: string;
};

type GenerateWithRecovery = <
  T extends { startFrameImagePrompt: string },
>(input: {
  requestIdempotencyKey: string;
  generate: (attempt: GenerateAttemptInput) => Promise<T>;
}) => Promise<{
  attemptResults: T[];
  recoveryIssues: ImagePromptValidationIssue[];
  validationIssues: ImagePromptValidationIssue[];
  providerRecovery: "empty_response" | null;
}>;

type GetValidationIssues = (value: unknown) => ImagePromptValidationIssue[];

async function loadRecoveryFunctions(): Promise<{
  generateWithRecovery: GenerateWithRecovery;
  getValidationIssues: GetValidationIssues;
}> {
  const compiler = await import("../marketplaceAutoReviewStagedPromptCompiler");
  const exports = compiler as unknown as Record<string, unknown>;
  const generateWithRecovery = exports["generateStagedImagePromptWithRecovery"];
  const getValidationIssues = exports["getStagedImagePromptValidationIssues"];
  expect(generateWithRecovery).toBeTypeOf("function");
  expect(getValidationIssues).toBeTypeOf("function");
  return {
    generateWithRecovery: generateWithRecovery as GenerateWithRecovery,
    getValidationIssues: getValidationIssues as GetValidationIssues,
  };
}

describe("staged image prompt recovery", () => {
  let generateWithRecovery: GenerateWithRecovery;
  let getValidationIssues: GetValidationIssues;

  beforeAll(async () => {
    ({ generateWithRecovery, getValidationIssues } =
      await loadRecoveryFunctions());
  }, 15000);

  it("identifies which required image-prompt rules are missing", () => {
    expect(getValidationIssues("A nice product photo.")).toEqual([
      "prompt_too_short",
      "vertical_format_missing",
      "reference_lock_missing",
      "composition_missing",
      "no_text_directive_missing",
    ]);
  });

  it("retries an incomplete prompt once with targeted feedback and a new billing key", async () => {
    const calls: GenerateAttemptInput[] = [];
    const result = await generateWithRecovery({
      requestIdempotencyKey: "image-prompt-shot-5",
      async generate(attempt) {
        calls.push(attempt);
        return {
          startFrameImagePrompt:
            attempt.attempt === 1
              ? "A nice product photo."
              : "Create one vertical 9:16 image. Use @Image1 as the exact product reference. Camera framing and lighting keep the product clear. Do not add text, captions, or subtitles.",
          estimatedCredits: attempt.attempt,
        };
      },
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      attempt: 1,
      requestIdempotencyKey: "image-prompt-shot-5",
    });
    expect(calls[1].requestIdempotencyKey).toBe(
      "image-prompt-shot-5:image-validation-retry-1"
    );
    expect(calls[1].recoveryInstruction).toContain("vertical 9:16");
    expect(calls[1].recoveryInstruction).toContain("@ImageN");
    expect(calls[1].recoveryInstruction).toContain("Do not add text");
    expect(result.attemptResults).toHaveLength(2);
    expect(result.recoveryIssues).toContain("vertical_format_missing");
    expect(result.validationIssues).toEqual([]);
    expect(result.providerRecovery).toBeNull();
  });

  it("retries an empty provider response once with a distinct billing key", async () => {
    const calls: GenerateAttemptInput[] = [];
    const result = await generateWithRecovery({
      requestIdempotencyKey: "image-prompt-empty-response",
      async generate(attempt) {
        calls.push(attempt);
        if (attempt.attempt === 1) {
          throw new Error(
            "MARKETPLACE_SINGLE_SHOT_SKILL_FAILED:All providers failed after 1 attempt(s): attempt 1 openrouter(openai/gpt-5.6-luna): empty_response - Provider returned HTTP 200 with no assistant text"
          );
        }
        return {
          startFrameImagePrompt:
            "Create one vertical 9:16 image. Use @Image1 as the exact product reference. Camera framing and lighting keep the product clear. Do not add text, captions, or subtitles.",
          estimatedCredits: 3,
        };
      },
    });

    expect(calls).toHaveLength(2);
    expect(calls[1].requestIdempotencyKey).toBe(
      "image-prompt-empty-response:image-provider-empty-retry-1"
    );
    expect(calls[1].recoveryInstruction).toContain("no assistant text");
    expect(result.attemptResults).toHaveLength(1);
    expect(result.validationIssues).toEqual([]);
    expect(result.providerRecovery).toBe("empty_response");
  });

  it("does not retry provider errors unrelated to empty output", async () => {
    const calls: GenerateAttemptInput[] = [];
    await expect(
      generateWithRecovery({
        requestIdempotencyKey: "image-prompt-config-error",
        async generate(attempt) {
          calls.push(attempt);
          throw new Error("MARKETPLACE_SKILL_PROVIDER_NOT_CONFIGURED");
        },
      })
    ).rejects.toThrow("MARKETPLACE_SKILL_PROVIDER_NOT_CONFIGURED");

    expect(calls).toHaveLength(1);
  });

  it("does not retry a valid prompt and never exceeds two attempts", async () => {
    const completePrompt =
      "Create one vertical 9:16 image. Use @Image1 as the exact product reference. Camera framing and lighting keep the product clear. Do not add text or captions.";
    const validCalls: GenerateAttemptInput[] = [];
    const validResult = await generateWithRecovery({
      requestIdempotencyKey: "image-prompt-shot-1",
      async generate(attempt) {
        validCalls.push(attempt);
        return { startFrameImagePrompt: completePrompt };
      },
    });
    expect(validCalls).toHaveLength(1);
    expect(validResult.recoveryIssues).toEqual([]);
    expect(validResult.validationIssues).toEqual([]);

    const failedCalls: GenerateAttemptInput[] = [];
    const failedResult = await generateWithRecovery({
      requestIdempotencyKey: "image-prompt-shot-2",
      async generate(attempt) {
        failedCalls.push(attempt);
        return { startFrameImagePrompt: "Still incomplete." };
      },
    });
    expect(failedCalls).toHaveLength(2);
    expect(failedResult.validationIssues).toContain(
      "no_text_directive_missing"
    );
  });
});
