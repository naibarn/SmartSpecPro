import { describe, expect, it } from "vitest";
import {
  computeGeneratedSurfacePatchDigest,
  DEFAULT_GENERATED_SURFACE_LIMITS,
  reduceGeneratedSurfaceRegionPatch,
  validateCompiledGeneratedSurfaceV3,
  type AuthorizedGeneratedSurfaceRegionState,
  type GeneratedSurfaceRegionPatchV1,
  type RegionPatchDependencies,
  type TrustedGeneratedSurfaceManifest,
} from "./generatedSurfaceEnvelope";

const NOW = Date.parse("2026-10-10T12:00:00.000Z");
const limits = { ...DEFAULT_GENERATED_SURFACE_LIMITS };

function makeManifest(
  overrides: Partial<TrustedGeneratedSurfaceManifest> = {}
): TrustedGeneratedSurfaceManifest {
  return {
    ref: "manifest://trusted/v3",
    version: "catalog-12",
    validateComponents: (_regionId, components) =>
      components.every(component => {
        if (component === null || typeof component !== "object") return false;
        const record = component as Record<string, unknown>;
        return (
          typeof record.id === "string" &&
          typeof record.type === "string" &&
          ["Text", "Table"].includes(record.type)
        );
      }),
    ...overrides,
  };
}

function makeSurface(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    protocol: "smartaihub.generated-ui",
    schemaVersion: "3.0",
    surfaceId: "surface-1",
    surfaceRevision: 3,
    dataRevision: "data-r8",
    sourceResultRef: "result://r8",
    provenanceDigest: "source-digest-from-trusted-compiler",
    scopeRef: "scope://opaque-1",
    componentManifestRef: "manifest://trusted/v3",
    renderPolicyRef: "render-policy://read-only",
    regions: [
      {
        regionId: "summary",
        revision: 7,
        components: [{ id: "title", type: "Text", props: { text: "Hello" } }],
        sourceFieldAllowlistRef: "allowlist://summary",
      },
    ],
    serverActionBindingRefs: ["action-ref://short-lived-1"],
    fallbackResultRef: "fallback://r8",
    retentionPolicyRef: "retention://tenant-policy",
    createdAt: "2026-10-10T11:00:00.000Z",
    expiresAt: "2026-10-10T13:00:00.000Z",
    ...overrides,
  };
}

function makeState(
  overrides: Partial<AuthorizedGeneratedSurfaceRegionState> = {}
): AuthorizedGeneratedSurfaceRegionState {
  return {
    surfaceId: "surface-1",
    regionId: "summary",
    revision: 7,
    sourceDataRevision: "data-r8",
    componentManifestRef: "manifest://trusted/v3",
    manifestVersion: "catalog-12",
    lastSequence: 4,
    components: [{ id: "title", type: "Text", props: { text: "Hello" } }],
    otherRegionComponentIds: [],
    ...overrides,
  };
}

function makePatch(
  overrides: Partial<GeneratedSurfaceRegionPatchV1> = {}
): GeneratedSurfaceRegionPatchV1 {
  return {
    surfaceId: "surface-1",
    regionId: "summary",
    sequence: 5,
    baseRegionRevision: 7,
    nextRegionRevision: 8,
    sourceDataRevision: "data-r8",
    manifestVersion: "catalog-12",
    operations: [{ kind: "replace-text", id: "title", text: "Updated" }],
    contentDigest: "sha256:" + "0".repeat(64),
    traceId: "trace-5",
    ...overrides,
  };
}

function makeDependencies(
  overrides: Partial<RegionPatchDependencies> = {}
): RegionPatchDependencies {
  return {
    manifest: makeManifest(),
    limits,
    validateAndApplyOperations: () => [
      { id: "title", type: "Text", props: { text: "Updated" } },
    ],
    ...overrides,
  };
}

async function signedPatch(
  patch = makePatch()
): Promise<GeneratedSurfaceRegionPatchV1> {
  return {
    ...patch,
    contentDigest: await computeGeneratedSurfacePatchDigest(patch),
  };
}

describe("CompiledGeneratedSurfaceV3 validation", () => {
  it("accepts a bounded V3 surface against an explicit trusted manifest", () => {
    const result = validateCompiledGeneratedSurfaceV3(
      makeSurface(),
      makeManifest(),
      limits,
      NOW
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.schemaVersion).toBe("3.0");
  });

  it("rejects legacy and unrecognized schema versions", () => {
    expect(
      validateCompiledGeneratedSurfaceV3(
        makeSurface({ schemaVersion: "2.0" }),
        makeManifest(),
        limits,
        NOW
      )
    ).toMatchObject({ ok: false, code: "UNSUPPORTED_VERSION" });
  });

  it("rejects unknown envelope fields and nested authority fields", () => {
    expect(
      validateCompiledGeneratedSurfaceV3(
        makeSurface({ tenantId: "tenant-1" }),
        makeManifest(),
        limits,
        NOW
      )
    ).toMatchObject({ ok: false, code: "UNKNOWN_RESERVED_FIELD" });
    expect(
      validateCompiledGeneratedSurfaceV3(
        makeSurface({
          regions: [
            {
              regionId: "summary",
              revision: 7,
              components: [{ id: "title", type: "Text", tenant_id: "forged" }],
              sourceFieldAllowlistRef: "allowlist://summary",
            },
          ],
        }),
        makeManifest(),
        limits,
        NOW
      )
    ).toMatchObject({ ok: false, code: "UNKNOWN_RESERVED_FIELD" });
  });

  it("rejects symbol and non-enumerable fields and contains proxy failures", () => {
    const symbolKey = Symbol("hidden");
    const withSymbol = Object.assign(makeSurface(), { [symbolKey]: "hidden" });
    expect(
      validateCompiledGeneratedSurfaceV3(
        withSymbol,
        makeManifest(),
        limits,
        NOW
      ).ok
    ).toBe(false);
    const withHidden = makeSurface();
    Object.defineProperty(withHidden, "internalFlag", {
      value: true,
      enumerable: false,
    });
    expect(
      validateCompiledGeneratedSurfaceV3(
        withHidden,
        makeManifest(),
        limits,
        NOW
      ).ok
    ).toBe(false);
    const throwingProxy = new Proxy(makeSurface(), {
      get: () => {
        throw new Error("proxy trap");
      },
    });
    expect(
      validateCompiledGeneratedSurfaceV3(
        throwingProxy,
        makeManifest(),
        limits,
        NOW
      ).ok
    ).toBe(false);
  });

  it("rejects a manifest reference mismatch and unknown component schema", () => {
    expect(
      validateCompiledGeneratedSurfaceV3(
        makeSurface(),
        makeManifest({ ref: "manifest://other" }),
        limits,
        NOW
      )
    ).toMatchObject({ ok: false, code: "MANIFEST_MISMATCH" });
    expect(
      validateCompiledGeneratedSurfaceV3(
        makeSurface({
          regions: [
            {
              regionId: "summary",
              revision: 7,
              components: [{ id: "x", type: "Unknown" }],
              sourceFieldAllowlistRef: "allowlist://summary",
            },
          ],
        }),
        makeManifest(),
        limits,
        NOW
      )
    ).toMatchObject({ ok: false, code: "COMPONENT_SCHEMA_REJECTED" });
    expect(
      validateCompiledGeneratedSurfaceV3(
        makeSurface(),
        makeManifest({
          validateComponents: () => "truthy" as unknown as boolean,
        }),
        limits,
        NOW
      )
    ).toMatchObject({ ok: false, code: "COMPONENT_SCHEMA_REJECTED" });
  });

  it("rejects duplicate regions and duplicate component ids across regions", () => {
    const region = {
      regionId: "summary",
      revision: 7,
      components: [{ id: "title", type: "Text" }],
      sourceFieldAllowlistRef: "allowlist://summary",
    };
    expect(
      validateCompiledGeneratedSurfaceV3(
        makeSurface({ regions: [region, region] }),
        makeManifest(),
        limits,
        NOW
      )
    ).toMatchObject({ ok: false, code: "DUPLICATE_ID" });
    expect(
      validateCompiledGeneratedSurfaceV3(
        makeSurface({ regions: [region, { ...region, regionId: "details" }] }),
        makeManifest(),
        limits,
        NOW
      )
    ).toMatchObject({ ok: false, code: "DUPLICATE_ID" });
  });

  it("enforces caller budget, revision and timestamp bounds", () => {
    expect(
      validateCompiledGeneratedSurfaceV3(
        makeSurface(),
        makeManifest(),
        { ...limits, maxRegions: 1, maxComponents: 1 },
        NOW
      ).ok
    ).toBe(true);
    expect(
      validateCompiledGeneratedSurfaceV3(
        makeSurface({
          regions: [
            ...(makeSurface().regions as unknown[]),
            {
              regionId: "details",
              revision: 0,
              components: [],
              sourceFieldAllowlistRef: "allowlist://details",
            },
          ],
        }),
        makeManifest(),
        { ...limits, maxRegions: 1 },
        NOW
      )
    ).toMatchObject({ ok: false, code: "BUDGET_EXCEEDED" });
    expect(
      validateCompiledGeneratedSurfaceV3(
        makeSurface({ expiresAt: "2026-10-10T11:30:00.000Z" }),
        makeManifest(),
        limits,
        NOW
      )
    ).toMatchObject({ ok: false, code: "INVALID_TIME" });
    expect(
      validateCompiledGeneratedSurfaceV3(
        makeSurface({ createdAt: "tomorrow" }),
        makeManifest(),
        limits,
        NOW
      )
    ).toMatchObject({ ok: false, code: "INVALID_TIME" });
    expect(
      validateCompiledGeneratedSurfaceV3(
        makeSurface({ surfaceRevision: -1 }),
        makeManifest(),
        limits,
        NOW
      )
    ).toMatchObject({ ok: false, code: "INVALID_REVISION" });
  });

  it("rejects non-JSON payload values", () => {
    expect(
      validateCompiledGeneratedSurfaceV3(
        makeSurface({
          regions: [
            {
              regionId: "summary",
              revision: 7,
              components: [{ id: "title", type: "Text", value: Number.NaN }],
              sourceFieldAllowlistRef: "allowlist://summary",
            },
          ],
        }),
        makeManifest(),
        limits,
        NOW
      )
    ).toMatchObject({ ok: false, code: "INVALID_JSON_VALUE" });
  });

  it("bounds nested JSON before invoking the trusted component validator", () => {
    let called = false;
    const result = validateCompiledGeneratedSurfaceV3(
      makeSurface({
        regions: [
          {
            regionId: "summary",
            revision: 7,
            components: [
              { id: "title", type: "Text", props: { text: "x".repeat(2_000) } },
            ],
            sourceFieldAllowlistRef: "allowlist://summary",
          },
        ],
      }),
      makeManifest({
        validateComponents: () => {
          called = true;
          return true;
        },
      }),
      { ...limits, maxPayloadBytes: 1_024 },
      NOW
    );
    expect(result).toMatchObject({ ok: false, code: "BUDGET_EXCEEDED" });
    expect(called).toBe(false);
  });
});

describe("per-region generated surface patch reducer", () => {
  it("uses stable SHA-256 canonical JSON independent of object key order", async () => {
    const left = makePatch({ operations: [{ z: 2, a: 1 }] });
    const right = makePatch({ operations: [{ a: 1, z: 2 }] });
    expect(await computeGeneratedSurfacePatchDigest(left)).toBe(
      await computeGeneratedSurfacePatchDigest(right)
    );
  });

  it("applies a fully validated patch atomically and advances region sequence", async () => {
    const current = makeState();
    const patch = await signedPatch();
    const result = await reduceGeneratedSurfaceRegionPatch(
      current,
      patch,
      makeDependencies()
    );
    expect(result.status).toBe("APPLIED");
    expect(current.revision).toBe(7);
    expect(current.lastSequence).toBe(4);
    if (result.status === "APPLIED") {
      expect(result.state.revision).toBe(8);
      expect(result.state.lastSequence).toBe(5);
      expect(result.state.components).toEqual([
        { id: "title", type: "Text", props: { text: "Updated" } },
      ]);
    }
  });

  it("snapshots patch, state, budget and trusted adapters before async digest verification", async () => {
    const current = makeState();
    const patch = await signedPatch();
    const mutableLimits = { ...limits };
    const dependencies = makeDependencies({
      limits: mutableLimits,
      validateAndApplyOperations: () => [
        { id: "title", type: "Text", props: { text: "Trusted result" } },
      ],
    });
    const pending = reduceGeneratedSurfaceRegionPatch(
      current,
      patch,
      dependencies
    );

    (patch.operations[0] as Record<string, unknown>).text =
      "Changed after submission";
    (current.components[0] as Record<string, unknown>).props = {
      text: "Changed snapshot",
    };
    mutableLimits.maxStringLength = 1;
    dependencies.manifest.version = "changed-after-submission";
    dependencies.validateAndApplyOperations = () => [
      { id: "evil", type: "Unknown" },
    ];

    const result = await pending;
    expect(result.status).toBe("APPLIED");
    if (result.status === "APPLIED") {
      expect(result.state.components).toEqual([
        { id: "title", type: "Text", props: { text: "Trusted result" } },
      ]);
    }
  });

  it("leaves state unchanged and skips operations when digest fails", async () => {
    let called = false;
    const current = makeState();
    const result = await reduceGeneratedSurfaceRegionPatch(
      current,
      makePatch(),
      makeDependencies({
        validateAndApplyOperations: () => {
          called = true;
          return [];
        },
      })
    );
    expect(result).toMatchObject({
      status: "RECONCILE_SNAPSHOT",
      reason: "PATCH_DIGEST_MISMATCH",
    });
    expect(result.state).toEqual(current);
    expect(called).toBe(false);
  });

  it("requests a snapshot for sequence gaps, stale revisions and stale source data", async () => {
    const patch = await signedPatch();
    for (const [state, changedPatch] of [
      [makeState(), { ...patch, sequence: 6 }],
      [makeState({ revision: 6 }), patch],
      [makeState({ sourceDataRevision: "data-r9" }), patch],
    ] as const) {
      const result = await reduceGeneratedSurfaceRegionPatch(
        state,
        changedPatch,
        makeDependencies()
      );
      expect(result.status).toBe("RECONCILE_SNAPSHOT");
      expect(result.state).toEqual(state);
    }
  });

  it("rejects a changed manifest before calling the operation validator", async () => {
    let called = false;
    const current = makeState();
    const result = await reduceGeneratedSurfaceRegionPatch(
      current,
      await signedPatch(),
      makeDependencies({
        manifest: makeManifest({ version: "catalog-13" }),
        validateAndApplyOperations: () => {
          called = true;
          return [];
        },
      })
    );
    expect(result).toMatchObject({
      status: "RECONCILE_SNAPSHOT",
      reason: "MANIFEST_CHANGED",
    });
    expect(result.state).toEqual(current);
    expect(called).toBe(false);
  });

  it("preserves the current state when trusted operation validation fails", async () => {
    const current = makeState();
    const result = await reduceGeneratedSurfaceRegionPatch(
      current,
      await signedPatch(),
      makeDependencies({
        validateAndApplyOperations: () => {
          throw new Error("invalid op");
        },
      })
    );
    expect(result).toMatchObject({
      status: "RECONCILE_SNAPSHOT",
      reason: "PATCH_OPERATION_REJECTED",
    });
    expect(result.state).toEqual(current);
  });

  it("rejects an invalid authorized snapshot before running patch operations", async () => {
    let called = false;
    const current = makeState({ components: [{ id: "bad", type: "Unknown" }] });
    const result = await reduceGeneratedSurfaceRegionPatch(
      current,
      await signedPatch(),
      makeDependencies({
        validateAndApplyOperations: () => {
          called = true;
          return [];
        },
      })
    );
    expect(result).toMatchObject({
      status: "RECONCILE_SNAPSHOT",
      reason: "AUTHORIZED_SNAPSHOT_COMPONENTS_INVALID",
    });
    expect(result.state).toEqual(current);
    expect(called).toBe(false);
  });

  it("rejects oversized nested patch data before running patch operations", async () => {
    let called = false;
    const current = makeState();
    const patch = await signedPatch(
      makePatch({ operations: [{ text: "x".repeat(2_000) }] })
    );
    const result = await reduceGeneratedSurfaceRegionPatch(
      current,
      patch,
      makeDependencies({
        limits: { ...limits, maxPayloadBytes: 1_024 },
        validateAndApplyOperations: () => {
          called = true;
          return [];
        },
      })
    );
    expect(result).toMatchObject({
      status: "RECONCILE_SNAPSHOT",
      reason: "PATCH_SECURITY_OR_BUDGET_REJECTED",
    });
    expect(result.state).toEqual(current);
    expect(called).toBe(false);
  });

  it("does not expose mutable current components to the operation adapter", async () => {
    const current = makeState();
    const result = await reduceGeneratedSurfaceRegionPatch(
      current,
      await signedPatch(),
      makeDependencies({
        validateAndApplyOperations: components => {
          expect(Object.isFrozen(components)).toBe(true);
          expect(Object.isFrozen(components[0])).toBe(true);
          return [{ id: "title", type: "Text", props: { text: "Safe" } }];
        },
      })
    );
    expect(result.status).toBe("APPLIED");
    expect(current.components).toEqual([
      { id: "title", type: "Text", props: { text: "Hello" } },
    ]);
  });

  it("rejects a replacement that fails the trusted manifest schema", async () => {
    const current = makeState();
    const result = await reduceGeneratedSurfaceRegionPatch(
      current,
      await signedPatch(),
      makeDependencies({
        validateAndApplyOperations: () => [{ id: "bad", type: "Unknown" }],
      })
    );
    expect(result).toMatchObject({
      status: "RECONCILE_SNAPSHOT",
      reason: "PATCH_REPLACEMENT_SCHEMA_REJECTED",
    });
    expect(result.state).toEqual(current);
  });

  it("rejects malformed or security-bearing patch envelopes without mutation", async () => {
    const current = makeState();
    const malformed = await signedPatch();
    const withAuthority = { ...malformed, tenantId: "tenant-forgery" };
    const result = await reduceGeneratedSurfaceRegionPatch(
      current,
      withAuthority,
      makeDependencies()
    );
    expect(result.status).toBe("RECONCILE_SNAPSHOT");
    expect(result.state).toEqual(current);
  });

  it("rejects revision jumps and component ID collisions with other regions", async () => {
    const current = makeState({
      otherRegionComponentIds: ["occupied-elsewhere"],
    });
    const revisionJump = await signedPatch(
      makePatch({ nextRegionRevision: 9 })
    );
    expect(
      await reduceGeneratedSurfaceRegionPatch(
        current,
        revisionJump,
        makeDependencies()
      )
    ).toMatchObject({
      status: "RECONCILE_SNAPSHOT",
      reason: "INVALID_PATCH_ENVELOPE",
    });
    const collision = await reduceGeneratedSurfaceRegionPatch(
      current,
      await signedPatch(),
      makeDependencies({
        validateAndApplyOperations: () => [
          { id: "occupied-elsewhere", type: "Text" },
        ],
      })
    );
    expect(collision).toMatchObject({
      status: "RECONCILE_SNAPSHOT",
      reason: "PATCH_COMPONENT_ID_COLLISION",
    });
    expect(collision.state).toEqual(current);
  });

  it("contains malformed proxy state as a reconciliation result", async () => {
    const proxyState = new Proxy(makeState(), {
      get: () => {
        throw new Error("proxy trap");
      },
    });
    const result = await reduceGeneratedSurfaceRegionPatch(
      proxyState,
      await signedPatch(),
      makeDependencies()
    );
    expect(result.status).toBe("RECONCILE_SNAPSHOT");
    expect(result.state).toBe(proxyState);
  });
});
