ALTER TABLE "model_provider_map" ADD COLUMN "supportsJsonMode" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "model_provider_map" ADD COLUMN "supportsStrictToolSchema" boolean DEFAULT false;--> statement-breakpoint

UPDATE "model_provider_map"
SET
  "supportsStructuredOutputs" = true,
  "supportsJsonMode" = true,
  "supportsStrictToolSchema" = true
WHERE "providerModelId" IN (
  'gpt-5-4',
  'gpt-5-codex',
  'gpt-5.1-codex',
  'gpt-5.2-codex',
  'gpt-5.3-codex'
);--> statement-breakpoint

UPDATE "model_provider_map"
SET
  "supportsStructuredOutputs" = true,
  "supportsStrictToolSchema" = true
WHERE "providerModelId" IN (
  'claude-haiku-4-5',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-opus-4-5',
  'claude-sonnet-4-5'
);--> statement-breakpoint

UPDATE "model_provider_map"
SET
  "supportsStructuredOutputs" = true
WHERE "providerModelId" IN (
  'gemini-3-flash',
  'gemini-3.1-pro',
  'gemini-3-pro'
);--> statement-breakpoint
