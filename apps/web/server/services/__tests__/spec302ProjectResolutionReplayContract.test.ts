import { describe, expect, it } from "vitest";

import {
  compareSpec302ProjectResolutionReplay,
  digestSpec302ProjectResolutionReplayPayload,
  Spec302ReceiptReplayContractError,
  type Spec302ProjectResolutionReplayCandidate,
  type Spec302ProjectResolutionReplayPayload,
} from "../spec302ProjectResolutionReplayContract";

const payload: Spec302ProjectResolutionReplayPayload = {
  tenantId: "tenant-r4",
  principalId: "user:42",
  appId: "app-notes",
  canonicalProjectId: "project-notes",
  sessionId: "session-7",
  conversationId: "conversation-9",
  noSessionSelection: false,
  resolutionState: "RESOLVED_EXPLICIT",
  provenance: "server_conversation_binding",
  resolverPolicyVersion: "spec302-context-resolution.v1",
  authorizationPolicyVersion: "project-acl.v2",
  authorizationReference: "correlation-1:current-project-acl-check",
  operationCeiling: "PROJECT_READ",
};

function candidate(
  overrides: Partial<Spec302ProjectResolutionReplayPayload> = {},
  idempotencyKey = "idem-1"
): Spec302ProjectResolutionReplayCandidate {
  return { idempotencyKey, payload: { ...payload, ...overrides } };
}

function expectContractError(value: unknown, code: string): void {
  try {
    digestSpec302ProjectResolutionReplayPayload(
      value as Spec302ProjectResolutionReplayPayload
    );
    throw new Error("EXPECTED_CONTRACT_ERROR");
  } catch (error) {
    expect(error).toBeInstanceOf(Spec302ReceiptReplayContractError);
    expect(error).toMatchObject({ code });
  }
}

describe("SPEC-302 durable receipt replay contract", () => {
  it("produces a stable digest independent of object property order", () => {
    const reordered = Object.fromEntries(
      Object.entries(payload).reverse()
    ) as Spec302ProjectResolutionReplayPayload;

    expect(digestSpec302ProjectResolutionReplayPayload(reordered)).toBe(
      digestSpec302ProjectResolutionReplayPayload(payload)
    );
  });

  it("requires identity values to be canonicalized by the caller", () => {
    expectContractError(
      { ...payload, tenantId: " tenant-r4" },
      "TENANT_ID_INVALID"
    );
  });

  it("classifies an identical key and payload as an exact replay without authority", () => {
    expect(
      compareSpec302ProjectResolutionReplay(candidate(), candidate())
    ).toMatchObject({
      outcome: "EXACT_REPLAY",
      normalizedPayloadDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it.each([
    ["tenant", { tenantId: "tenant-other" }],
    ["principal", { principalId: "user:99" }],
    ["App", { appId: "app-other" }],
    ["Project", { canonicalProjectId: "project-other" }],
    ["session", { sessionId: "session-other" }],
    ["conversation", { conversationId: "conversation-other" }],
    [
      "no-session binding",
      { sessionId: null, conversationId: null, noSessionSelection: true },
    ],
    ["resolution state", { resolutionState: "RESOLVED_CONTEXTUAL" as const }],
    ["provenance", { provenance: "explicit_user_selection" }],
    ["resolver policy", { resolverPolicyVersion: "resolver-v2" }],
    ["authorization policy", { authorizationPolicyVersion: "acl-v3" }],
    ["authorization reference", { authorizationReference: "auth-check-2" }],
    ["operation ceiling", { operationCeiling: "PROJECT_WRITE" as const }],
  ])("rejects a same-key replay with changed %s", (_field, change) => {
    expect(
      compareSpec302ProjectResolutionReplay(candidate(), candidate(change))
    ).toMatchObject({ outcome: "IDEMPOTENCY_CONFLICT" });
  });

  it("treats a different idempotency key as a new request", () => {
    expect(
      compareSpec302ProjectResolutionReplay(
        candidate(),
        candidate({ tenantId: "tenant-b" }, "idem-2")
      )
    ).toMatchObject({ outcome: "NEW_KEY" });
  });

  it("requires an explicit no-session binding for unbound explicit selections", () => {
    const noSessionSelection = {
      ...payload,
      sessionId: null,
      conversationId: null,
      noSessionSelection: true,
    };
    expect(
      compareSpec302ProjectResolutionReplay(candidate(), {
        idempotencyKey: "idem-explicit-no-session",
        payload: noSessionSelection,
      })
    ).toMatchObject({ outcome: "NEW_KEY" });

    expectContractError(
      { ...noSessionSelection, noSessionSelection: false },
      "SESSION_BINDING_INVALID"
    );
    expectContractError(
      { ...noSessionSelection, resolutionState: "RESOLVED_CONTEXTUAL" },
      "SESSION_BINDING_INVALID"
    );
  });

  it.each([
    "AMBIGUOUS",
    "UNRESOLVED",
    "NO_PROJECT",
    "SESSION_PENDING_SCOPE",
  ] as const)(
    "rejects a Project destination for %s resolution",
    resolutionState => {
      expectContractError(
        { ...payload, resolutionState },
        "PROJECT_DESTINATION_STATE_MISMATCH"
      );
    }
  );

  it("rejects Project operations for unresolved context and durable writes for pending scope", () => {
    expectContractError(
      { ...payload, resolutionState: "AMBIGUOUS", canonicalProjectId: null },
      "OPERATION_CEILING_SCOPE_INVALID"
    );
    expectContractError(
      {
        ...payload,
        resolutionState: "SESSION_PENDING_SCOPE",
        canonicalProjectId: null,
        operationCeiling: "PROJECT_WRITE",
      },
      "OPERATION_CEILING_SCOPE_INVALID"
    );
  });

  it("rejects raw prompt or secret fields through a strict allow-list", () => {
    expectContractError(
      { ...payload, prompt: "synthetic private prompt" },
      "REPLAY_PAYLOAD_FIELDS_INVALID"
    );
    expectContractError(
      { ...payload, accessToken: "synthetic secret" },
      "REPLAY_PAYLOAD_FIELDS_INVALID"
    );
  });

  it("rejects hidden properties and non-plain objects from the replay identity", () => {
    const hiddenField = {
      ...payload,
    } as Spec302ProjectResolutionReplayPayload & Record<string, unknown>;
    Object.defineProperty(hiddenField, "prompt", {
      value: "synthetic hidden prompt",
      enumerable: false,
    });
    expectContractError(hiddenField, "REPLAY_PAYLOAD_FIELDS_INVALID");

    const customPrototype = Object.assign(
      Object.create({ inheritedSecret: "secret" }),
      payload
    );
    expectContractError(customPrototype, "REPLAY_PAYLOAD_FIELDS_INVALID");
  });

  it("returns only a digest rather than embedding normalized identity values", () => {
    const result = compareSpec302ProjectResolutionReplay(
      candidate(),
      candidate()
    );
    expect(result.normalizedPayloadDigest).not.toContain(payload.tenantId);
    expect(result.normalizedPayloadDigest).not.toContain(
      payload.canonicalProjectId
    );
  });
});
