export type PostCaptureRefundRequest = {
  tenantId: string;
  capturedJournalEntryId: string;
  amountMinorUnits: number;
  currency: string;
  idempotencyKey: string;
  actorId: string;
  reason: string;
};

/**
 * Spec 207 requires refunds/reversals to post new immutable accounting facts,
 * but this repository has no approved refund policy or canonical reversal
 * service/rail adapter. Keep post-capture refunds closed until those exist.
 */
export function requestPostCaptureRefund(_input: PostCaptureRefundRequest): never {
  throw new Error("ECONOMIC_REFUND_POLICY_REQUIRED");
}
