import { createHash } from "node:crypto";

export type RevisionReceipt = {
  mutationId: string;
  payloadHash: string;
  revisionId: string;
  revision: number;
};

export type RevisionMutationInput = {
  expectedRevision: number;
  currentRevision: number;
  mutationId: string;
  payload: unknown;
  receipts: readonly RevisionReceipt[];
};

export type RevisionMutationResult =
  | { kind: "applied"; revision: number; revisionId: string; receipt: RevisionReceipt }
  | { kind: "duplicate"; revision: number; revisionId: string }
  | { kind: "conflict"; currentRevision: number };

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
}

export function hashRevisionPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable(payload))).digest("hex");
}

/** Pure CAS/idempotency decision; caller applies the result in one DB transaction. */
export function decideRevisionMutation(input: RevisionMutationInput): RevisionMutationResult {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || !Number.isSafeInteger(input.currentRevision) || input.currentRevision < 0) {
    throw new Error("REVISION_INVALID");
  }
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(input.mutationId)) throw new Error("REVISION_MUTATION_ID_INVALID");
  const existing = input.receipts.find((receipt) => receipt.mutationId === input.mutationId);
  const payloadHash = hashRevisionPayload(input.payload);
  if (existing) {
    if (existing.payloadHash !== payloadHash) throw new Error("REVISION_MUTATION_REUSED");
    return { kind: "duplicate", revision: existing.revision, revisionId: existing.revisionId };
  }
  if (input.expectedRevision !== input.currentRevision) {
    return { kind: "conflict", currentRevision: input.currentRevision };
  }
  const revision = input.currentRevision + 1;
  const revisionId = `rev-${revision}-${payloadHash.slice(0, 12)}`;
  const receipt: RevisionReceipt = { mutationId: input.mutationId, payloadHash, revisionId, revision };
  return { kind: "applied", revision, revisionId, receipt };
}
