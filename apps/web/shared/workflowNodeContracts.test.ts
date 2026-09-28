import { describe, expect, it } from "vitest";

import {
  CORE_NODE_TYPE_IDS,
  NodeTypeRegistry,
  canonicalNodeTypeRegistry,
  computeNodeManifestDigest,
  evaluateNodeTypeAdmission,
  getNodeTypeCoverageMetadata,
  getNodeTypeManifest,
  searchNodeTypes,
  projectNodePortContract,
  stableDerivedPortId,
  validateNodeTypeManifest,
  validateNodeInstance,
  validateNodePortPayload,
  type NodeInstance,
} from "../server/services/workflowNodeContracts";

describe("Spec 214 canonical workflow node contracts", () => {
  it("registers exactly the 16 canonical semantic node types", () => {
    expect(CORE_NODE_TYPE_IDS).toHaveLength(16);
    expect(new Set(CORE_NODE_TYPE_IDS).size).toBe(16);
    expect(canonicalNodeTypeRegistry.entries()).toHaveLength(16);
    expect(canonicalNodeTypeRegistry.entries().map(item => item.identity.typeId)).toEqual(
      expect.arrayContaining([
        "core.trigger",
        "data.transform",
        "ai.model",
        "ai.agent",
        "core.capability",
        "data.retrieval",
        "flow.subflow",
        "flow.router",
        "flow.join",
        "flow.loop",
        "human.approval",
        "human.input",
        "flow.wait",
        "automation.computer_use",
        "data.artifact",
        "quality.verifier",
      ])
    );
  });

  it("gives each canonical type a typed input and output contract", () => {
    for (const manifest of canonicalNodeTypeRegistry.entries()) {
      expect(manifest.ports.inputs[0].schema?.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(manifest.ports.outputs[0].schema?.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(manifest.ports.inputs[0].schema).not.toEqual({ $schema: "https://json-schema.org/draft/2020-12/schema", type: "object" });
      expect(manifest.ports.outputs[0].schema).not.toEqual({ $schema: "https://json-schema.org/draft/2020-12/schema", type: "object" });
    }
  });

  it("declares device-neutral human interaction and normalized provider-neutral retrieval contracts", () => {
    expect(getNodeTypeManifest("human.input", "1.0.0").interaction?.requiredCapabilities).toEqual([
      "interaction.text", "interaction.choice",
    ]);
    expect(getNodeTypeManifest("human.approval", "1.0.0").interaction?.requiredCapabilities).toEqual([
      "interaction.approval",
    ]);
    const retrieval = getNodeTypeManifest("data.retrieval", "1.0.0");
    expect(retrieval.config.schema.properties).toHaveProperty("intent");
    expect(JSON.stringify(retrieval)).not.toMatch(/pgvector|Vectorize|AI Search|embedding model/i);
    expect(() => validateNodePortPayload(retrieval, "output", "output", {
      retrievalTraceId: "trace-1", provider: { profile: "retrieval-default", version: "1" }, queryPlan: {},
      evidence: [{ evidenceRef: "ev-1", source: { identity: "skill:foo", revision: "1" }, acl: "denied", freshness: "fresh", score: 0.9 }],
      degraded: false, qualityGate: "passed",
    })).toThrow("NODE_PORT_PAYLOAD_INVALID");
    expect(() => validateNodePortPayload(retrieval, "output", "output", {
      retrievalTraceId: "trace-1", provider: { profile: "retrieval-default", version: "1" }, queryPlan: {},
      evidence: [{ evidenceRef: "ev-1", source: { identity: "skill:foo", revision: "1" }, acl: "authorized", freshness: "fresh", score: 0.9 }],
      degraded: false, qualityGate: "passed",
    }, { intent: "SKILL_DISCOVERY" })).toThrow("RETRIEVAL_CANDIDATE_AUTHORITY_FORBIDDEN");
    expect(validateNodePortPayload(retrieval, "output", "output", {
      retrievalTraceId: "trace-1", provider: { profile: "retrieval-default", version: "1" }, queryPlan: {},
      evidence: [{ evidenceRef: "ev-1", source: { identity: "skill:foo", revision: "1" }, acl: "authorized", freshness: "fresh", score: 0.9, candidateOnly: true }],
      degraded: true, degradationReasons: ["stale-source"], qualityGate: "insufficient",
    }, { intent: "SKILL_DISCOVERY" })).toBe(true);
  });

  it("resolves exact versioned identities and rejects legacy aliases", () => {
    expect(getNodeTypeManifest("ai.model", "1.0.0").identity.typeId).toBe(
      "ai.model"
    );
    expect(() => getNodeTypeManifest("ai.model", "2.0.0")).toThrow(
      "NODE_TYPE_VERSION_UNSUPPORTED"
    );
    expect(() => getNodeTypeManifest("llm", "1.0.0")).toThrow(
      "NODE_TYPE_UNKNOWN"
    );
  });

  it("rejects tampered manifests and preserves a deterministic digest", () => {
    const manifest = getNodeTypeManifest("data.transform", "1.0.0");
    expect(manifest.identity.manifestDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(() =>
      canonicalNodeTypeRegistry.register({
        ...manifest,
        identity: {
          ...manifest.identity,
          displayNameKey: "tampered",
        },
      })
    ).toThrow("NODE_TYPE_DIGEST_INVALID");
  });

  it("enforces required and compatible binding kinds on node instances", () => {
    const trigger: NodeInstance = {
      id: "trigger-1",
      typeId: "core.trigger",
      typeVersion: "1.0.0",
      config: {},
    };
    expect(() => validateNodeInstance(trigger)).toThrow(
      "NODE_BINDING_REQUIRED"
    );
    expect(() =>
      validateNodeInstance({
        ...trigger,
        binding: { kind: "model", ref: "model-1" },
      })
    ).toThrow("NODE_BINDING_KIND_INVALID");
    expect(() =>
      validateNodeInstance({
        ...trigger,
        binding: { kind: "trigger-source", ref: "trigger-1" },
      })
    ).not.toThrow();
  });

  it("rejects secret material and runtime fields from semantic instances", () => {
    const instance: NodeInstance = {
      id: "model-1",
      typeId: "ai.model",
      typeVersion: "1.0.0",
      binding: { kind: "model", ref: "model-1" },
      config: { prompt: "hello", apiKey: "should-not-persist" },
      metadata: { nodeRunId: "runtime-only" },
    };
    expect(() => validateNodeInstance(instance)).toThrow(
      "NODE_SECRET_CONFIG_FORBIDDEN"
    );
    expect(() => validateNodeInstance({
      ...instance,
      config: { prompt: "hello", nodeRunId: "runtime-only" },
      metadata: undefined,
    })).toThrow("NODE_RUNTIME_STATE_FORBIDDEN");
  });

  it("searches canonical semantics without exposing old implementation names", () => {
    expect(searchNodeTypes({ query: "autonomous agent" }).map(item => item.identity.typeId)).toContain(
      "ai.agent"
    );
    expect(searchNodeTypes({ family: "verifier" }).map(item => item.identity.typeId)).toEqual([
      "quality.verifier",
    ]);
    expect(searchNodeTypes({ query: "llm" }).some(item => item.identity.typeId === "llm")).toBe(
      false
    );
  });

  it("declares runtime resources, governance, and derived effects without duplicating execution state", () => {
    const capability = getNodeTypeManifest("core.capability", "1.0.0");
    expect(capability.runtimeRequirement).toHaveProperty("resources");
    expect(capability.execution.effects).toMatchObject({
      mode: "derived",
      resolveAt: "runtime-preflight",
    });
    expect(capability.dataGovernance).toMatchObject({
      outputClassificationRule: "derive",
    });
    expect(capability.ui).toHaveProperty("propertyGroups");
    expect(capability.aiBuilder).toHaveProperty("compositionHints");
    expect(capability.lifecycle.status).toMatch(/^(experimental|active|deprecated|retired|quarantined)$/);
    expect(capability).not.toHaveProperty("retryPolicy");
  });

  it("rejects invalid Draft 2020-12 configuration schemas even when the manifest digest matches", () => {
    const base = getNodeTypeManifest("data.transform", "1.0.0");
    const invalid = {
      ...base,
      config: {
        ...base.config,
        schema: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "not-a-json-schema-type" },
      },
      identity: { ...base.identity, manifestDigest: "" },
    };
    invalid.identity.manifestDigest = computeNodeManifestDigest(invalid);
    expect(() => validateNodeTypeManifest(invalid)).toThrow("NODE_CONFIG_SCHEMA_INVALID");
  });

  it("rejects malformed port schemas and preset targets", () => {
    const base = getNodeTypeManifest("data.transform", "1.0.0");
    const invalidPortSchema = {
      ...base,
      ports: {
        ...base.ports,
        inputs: [{ ...base.ports.inputs[0], schema: { type: "not-a-json-schema-type" } }],
      },
      identity: { ...base.identity, manifestDigest: "" },
    };
    invalidPortSchema.identity.manifestDigest = computeNodeManifestDigest(invalidPortSchema);
    expect(() => validateNodeTypeManifest(invalidPortSchema)).toThrow("NODE_PORT_SCHEMA_INVALID");

    const invalidPreset = {
      ...base,
      presets: [{ presetId: "wrong-target", typeId: "ai.model", compatibleVersionRange: "^1.0.0", labelKey: "preset.wrong" }],
      identity: { ...base.identity, manifestDigest: "" },
    };
    invalidPreset.identity.manifestDigest = computeNodeManifestDigest(invalidPreset);
    expect(() => validateNodeTypeManifest(invalidPreset)).toThrow("NODE_PRESET_INVALID");
  });

  it("validates instance configuration against the registered node schema", () => {
    const instance: NodeInstance = {
      id: "transform-1",
      typeId: "data.transform",
      typeVersion: "1.0.0",
      config: { operation: 42 },
    };
    expect(() => validateNodeInstance(instance)).toThrow("NODE_CONFIG_SCHEMA_INVALID");
  });

  it("returns stable, bounded semantic search results", () => {
    const all = searchNodeTypes({ query: "workflow", limit: 4 });
    expect(all).toHaveLength(4);
    expect(all.map(item => item.identity.typeId)).toEqual(
      [...all.map(item => item.identity.typeId)].sort()
    );
  });

  it("returns only presets compatible with the exact registered type version", () => {
    const base = getNodeTypeManifest("data.transform", "1.0.0");
    const manifest = {
      ...base,
      presets: [{ presetId: "stable", typeId: "data.transform", compatibleVersionRange: "^1.0.0", labelKey: "workflow.preset.stable" }],
      identity: { ...base.identity, manifestDigest: "" },
    };
    manifest.identity.manifestDigest = computeNodeManifestDigest(manifest);
    const nextVersion = {
      ...base,
      presets: [{ presetId: "future", typeId: "data.transform", compatibleVersionRange: "^2.0.0", labelKey: "workflow.preset.future" }],
      compatibility: { ...base.compatibility, acceptedVersionRange: "^2.0.0" },
      identity: { ...base.identity, version: "2.0.0", manifestDigest: "" },
    };
    nextVersion.identity.manifestDigest = computeNodeManifestDigest(nextVersion);
    const registry = new NodeTypeRegistry([manifest, nextVersion]);
    expect(registry.getCompatiblePresets("data.transform", "1.0.0").map(item => item.presetId)).toEqual(["stable"]);
    expect(registry.getCompatiblePresets("data.transform", "2.0.0").map(item => item.presetId)).toEqual(["future"]);
  });

  it("keeps historical manifests explicit and separate from current search", () => {
    const current = getNodeTypeManifest("data.transform", "1.0.0");
    const historical = {
      ...current,
      identity: { ...current.identity, version: "0.9.0", manifestDigest: "" },
      compatibility: { ...current.compatibility, acceptedVersionRange: "^0.9.0" },
      lifecycle: { ...current.lifecycle, status: "retired" as const, retiredAt: "2026-09-26" },
    };
    historical.identity.manifestDigest = computeNodeManifestDigest(historical);
    const registry = new NodeTypeRegistry([current]);
    registry.archiveHistorical(historical);
    expect(registry.getHistorical("data.transform", "0.9.0")?.identity.manifestDigest).toBe(
      historical.identity.manifestDigest
    );
    expect(registry.get("data.transform", "0.9.0")).toBeUndefined();
    expect(registry.search({ query: "typed values" }).map(item => item.identity.version)).not.toContain("0.9.0");
  });

  it("exposes coverage metadata from one registered manifest", () => {
    expect(getNodeTypeCoverageMetadata("automation.computer_use", "1.0.0")).toMatchObject({
      typeId: "automation.computer_use",
      family: "computer-use",
      requiredBinding: true,
      coverageIntents: expect.arrayContaining(["browse"]),
    });
  });

  it("projects binding-derived ports deterministically and preserves explicit null schemas", () => {
    const base = getNodeTypeManifest("data.transform", "1.0.0");
    const manifest = {
      ...base,
      ports: {
        ...base.ports,
        derivation: { mode: "binding-derived" as const, resolverRef: "test.resolver", resolverVersion: "1", stablePortIdStrategy: "sha256-v1" },
      },
      identity: { ...base.identity, manifestDigest: "" },
    };
    manifest.identity.manifestDigest = computeNodeManifestDigest(manifest);
    const registry = new NodeTypeRegistry([manifest]);
    const resolvedPorts = {
      inputs: [{ direction: "input" as const, channel: "data" as const, semanticName: "query", schema: { type: "null" } }],
      outputs: [{ direction: "output" as const, channel: "data" as const, semanticName: "result", schema: { type: "string" } }],
    };
    expect(() => projectNodePortContract(manifest, { config: {} })).toThrow("NODE_PORT_DERIVATION_UNRESOLVED");
    const projected = projectNodePortContract(manifest, { config: {}, resolvedPorts });
    const projectedAgain = projectNodePortContract(manifest, { config: {}, resolvedPorts });
    expect(projected).toEqual(projectedAgain);
    expect(projected.inputs[0].schema).toEqual({ type: "null" });
    expect(projected.inputs[0].id).toBe(stableDerivedPortId({
      typeId: "data.transform",
      resolverVersion: "1",
      bindingRef: "config-derived",
      direction: "input",
      semanticName: "query",
    }));
    expect(projected.outputs[0].id).toBe(stableDerivedPortId({
      typeId: "data.transform",
      resolverVersion: "1",
      bindingRef: "config-derived",
      direction: "output",
      semanticName: "result",
    }));
  });

  it("rejects extension types that can be represented by bindings or composition", () => {
    const proposal = {
      semanticUnique: true,
      graphSemanticImpact: true,
      contractUnique: true,
      authoringValue: true,
      providerNeutral: true,
      stableMeaning: true,
      useCaseEvidence: true,
      capabilitySubstitutionAvailable: true,
      bindingPolicySubstitutionAvailable: false,
      compositionSubstitutionAvailable: false,
      evidence: { semanticRationale: "Unique graph-level contract with independent authoring semantics", useCaseReferences: ["UC-0001"], reviewer: "test", recordedAt: "2026-09-26T00:00:00Z" },
    };
    expect(evaluateNodeTypeAdmission(proposal)).toEqual({
      admitted: false,
      failedChecks: [{ check: "capabilitySubstitutionAvailable", reason: "capabilitySubstitutionAvailable must be evidenced as false" }],
    });
  });

  it("requires a passing formal admission record before registering extension types", () => {
    const base = getNodeTypeManifest("data.transform", "1.0.0");
    const passingAdmission = {
      semanticUnique: true,
      graphSemanticImpact: true,
      contractUnique: true,
      authoringValue: true,
      providerNeutral: true,
      stableMeaning: true,
      useCaseEvidence: true,
      capabilitySubstitutionAvailable: false,
      bindingPolicySubstitutionAvailable: false,
      compositionSubstitutionAvailable: false,
      evidence: { semanticRationale: "Unique graph-level contract with independent authoring semantics", useCaseReferences: ["UC-0001"], reviewer: "test", recordedAt: "2026-09-26T00:00:00Z" },
    };
    const extension = {
      ...base,
      identity: {
        ...base.identity,
        typeId: "plugin.example.semantic-action",
        namespace: "plugin" as const,
        publisher: "example",
        extensionProvenance: { packageDigest: "a".repeat(64), hostApiVersion: "1.0.0", trustStatus: "approved" as const, uiIsolation: "sandboxed" as const },
        manifestDigest: "",
      },
      extensionAdmission: passingAdmission,
    };
    extension.identity.manifestDigest = computeNodeManifestDigest(extension);
    const registry = new NodeTypeRegistry();
    expect(() => registry.register(extension)).toThrow("NODE_TYPE_ADMISSION_REQUIRED");
    expect(() => registry.register(extension, {
      ...passingAdmission,
      capabilitySubstitutionAvailable: true,
    })).toThrow("NODE_TYPE_ADMISSION_REJECTED");
    registry.register(extension, passingAdmission);
    expect(registry.get(extension.identity.typeId, "1.0.0")?.identity.namespace).toBe("plugin");
  });

  it("rejects malformed projected ports and incomplete resolver declarations", () => {
    const base = getNodeTypeManifest("data.transform", "1.0.0");
    const derived = {
      ...base,
      ports: { ...base.ports, derivation: { mode: "binding-derived" as const, resolverRef: "resolver", resolverVersion: "1", stablePortIdStrategy: "sha256-v1" } },
      identity: { ...base.identity, manifestDigest: "" },
    };
    derived.identity.manifestDigest = computeNodeManifestDigest(derived);
    const malformed = {
      inputs: [{ direction: "input" as const, channel: "invalid" as "data", semanticName: "query" }],
      outputs: [],
    };
    expect(() => projectNodePortContract(derived, { config: {}, resolvedPorts: malformed })).toThrow("NODE_PORT_CONTRACT_INVALID");
    const incomplete = {
      ...base,
      ports: { ...base.ports, derivation: { mode: "config-derived" as const, resolverRef: "resolver", resolverVersion: "1" } },
      identity: { ...base.identity, manifestDigest: "" },
    };
    incomplete.identity.manifestDigest = computeNodeManifestDigest(incomplete);
    expect(() => validateNodeTypeManifest(incomplete)).toThrow("NODE_PORT_DERIVATION_INVALID");
  });

  it("rejects runtime state inside binding constraints and malformed instance declarations", () => {
    const base = getNodeTypeManifest("ai.model", "1.0.0");
    const valid = { id: "node-1", typeId: base.identity.typeId, typeVersion: base.identity.version,
      binding: { kind: "model" as const, ref: "provider/model-v1" }, config: {} };
    expect(() => validateNodeInstance({ ...valid, binding: { ...valid.binding, constraints: { nested: { attemptId: "a-1" } } } })).toThrow("NODE_RUNTIME_STATE_FORBIDDEN");
    expect(() => validateNodeInstance({ ...valid, presetId: "missing" })).toThrow("NODE_PRESET_INVALID");
    expect(() => validateNodeInstance({ ...valid, binding: { ...valid.binding, versionPolicy: { mode: "range" } as never } })).toThrow("NODE_BINDING_INVALID");
    expect(() => validateNodeInstance({ ...valid, size: { width: 0, height: 20 } })).toThrow("NODE_INSTANCE_INVALID");
  });

  it("uses bounded explicit schemas for every core node type and searches retrieval summaries", () => {
    for (const typeId of CORE_NODE_TYPE_IDS) {
      const manifest = getNodeTypeManifest(typeId, "1.0.0");
      expect(manifest.config.schema).toMatchObject({ type: "object", additionalProperties: false });
      expect(() => validateNodeInstance({ id: "node-1", typeId, typeVersion: "1.0.0", config: { unsupportedField: true } })).toThrow("NODE_CONFIG_SCHEMA_INVALID");
    }
    expect(searchNodeTypes({ query: "already available typed values", limit: 16 }).map(item => item.identity.typeId)).toContain("data.transform");
  });

  it("rejects malformed semantic, security, and governance declarations even when re-digested", () => {
    const base = getNodeTypeManifest("data.transform", "1.0.0");
    const invalid = {
      ...base,
      semantic: { ...base.semantic, family: "made-up" as never },
      dataGovernance: { ...base.dataGovernance!, outputClassificationRule: "unknown" as never },
      identity: { ...base.identity, manifestDigest: "" },
    };
    invalid.identity.manifestDigest = computeNodeManifestDigest(invalid);
    expect(() => validateNodeTypeManifest(invalid)).toThrow("NODE_MANIFEST_INVALID");
    const invalidLifecycle = {
      ...base,
      lifecycle: { ...base.lifecycle, introducedVersion: "not-semver" },
      identity: { ...base.identity, manifestDigest: "" },
    };
    invalidLifecycle.identity.manifestDigest = computeNodeManifestDigest(invalidLifecycle);
    expect(() => validateNodeTypeManifest(invalidLifecycle)).toThrow("NODE_LIFECYCLE_CONTRACT_INVALID");
  });
});
