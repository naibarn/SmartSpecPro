import { describe, expect, it } from "vitest";

import { resolveSpec224ModelSelection } from "../spec224ModelSelection";
import type { RunnerModelCatalog } from "../runnerContracts";

const catalog: RunnerModelCatalog = {
  state: "discovered",
  adapterId: "codex.v1",
  adapterVersion: "codex.v1",
  cliVersion: "codex-cli 0.165.0",
  accountProviderFingerprint: "codex-account:sha256:abcdef0123456789",
  accountScopeState: "account_scoped_catalog_unverified",
  source: "codex_app_server_model_list",
  revision: "catalog:sha256:0123456789abcdef",
  verificationState: "unverified_catalog_only",
  observedAt: "2026-10-28T12:00:00Z",
  expiresAt: "2026-10-28T12:10:00Z",
  models: [
    { id: "gpt-6.1-sol", displayName: "GPT-6.1-Sol", capabilities: ["text"], reasoningEfforts: ["low", "medium", "high"], defaultReasoningEffort: "medium", isDefault: true },
    { id: "gpt-6.1-terra", displayName: "GPT-6.1-Terra", capabilities: ["text", "image"], reasoningEfforts: ["low", "high"], defaultReasoningEffort: "high", isDefault: false },
  ],
};

describe("SPEC-224 model selection", () => {
  const base = { catalog, adapterId: "codex.v1", capabilitySnapshotRevision: "snapshot-7", now: new Date("2026-10-28T12:05:00Z") };

  it("resolves Auto to the actual advertised default and a supported effort", () => {
    expect(resolveSpec224ModelSelection(base)).toMatchObject({
      policy: "auto",
      selectedModelId: null,
      resolvedModelId: "gpt-6.1-sol",
      reasoningEffort: "medium",
      catalogRevision: catalog.revision,
      capabilitySnapshotRevision: "snapshot-7",
      accountProviderFingerprint: catalog.accountProviderFingerprint,
    });
  });

  it("pins an explicit model and rejects unsupported model or effort choices", () => {
    expect(resolveSpec224ModelSelection({ ...base, request: { policy: "explicit", modelId: "gpt-6.1-terra", reasoningEffort: "high" } })).toMatchObject({
      policy: "explicit", selectedModelId: "gpt-6.1-terra", resolvedModelId: "gpt-6.1-terra", reasoningEffort: "high",
    });
    expect(() => resolveSpec224ModelSelection({ ...base, request: { policy: "explicit", modelId: "missing-model" } })).toThrow("SPEC224_SELECTED_MODEL_UNAVAILABLE");
    expect(() => resolveSpec224ModelSelection({ ...base, request: { policy: "explicit", modelId: "gpt-6.1-terra", reasoningEffort: "medium" } })).toThrow("SPEC224_MODEL_REASONING_EFFORT_UNSUPPORTED");
  });

  it("fails closed for stale, unverified-by-discovery, or wrong-adapter catalogs", () => {
    expect(() => resolveSpec224ModelSelection({ ...base, catalog: { ...catalog, expiresAt: "2026-10-28T12:04:59Z" } })).toThrow("SPEC224_MODEL_CATALOG_NOT_READY");
    expect(() => resolveSpec224ModelSelection({ ...base, catalog: { ...catalog, state: "error", models: undefined } })).toThrow("SPEC224_MODEL_CATALOG_NOT_READY");
    expect(() => resolveSpec224ModelSelection({ ...base, adapterId: "claude.v1" })).toThrow("SPEC224_MODEL_CATALOG_NOT_READY");
  });
});
