import { describe, expect, it } from "vitest";
import {
  normalizeOrcaReceipt,
  type OrcaJobReceiptState,
} from "../orcaJobReceiptService";

const current: OrcaJobReceiptState = {
  jobId: "job-1",
  attemptId: "attempt-1",
  generation: 2,
  status: "running",
};

describe("orcaJobReceiptService", () => {
  it("maps phases and keeps ACK separate from verified effect receipt", () => {
    expect(
      normalizeOrcaReceipt(current, {
        eventId: "e1",
        jobId: "job-1",
        attemptId: "attempt-1",
        generation: 2,
        kind: "ack",
        phase: "accepted",
        payload: {},
      })
    ).toMatchObject({
      disposition: "accepted",
      status: "running",
      effectVerified: false,
    });
    expect(
      normalizeOrcaReceipt(current, {
        eventId: "e2",
        jobId: "job-1",
        attemptId: "attempt-1",
        generation: 2,
        kind: "effect",
        phase: "completed",
        payload: { outputRef: "artifact-1" },
      })
    ).toMatchObject({
      disposition: "accepted",
      status: "succeeded",
      effectVerified: true,
    });
  });

  it("ignores stale/late events and deduplicates event ids", () => {
    expect(
      normalizeOrcaReceipt(current, {
        eventId: "e3",
        jobId: "job-1",
        attemptId: "attempt-old",
        generation: 1,
        kind: "effect",
        phase: "completed",
        payload: {},
      })
    ).toMatchObject({
      disposition: "stale",
      status: "running",
      reasonCode: "STALE_ATTEMPT",
    });
    expect(
      normalizeOrcaReceipt(current, {
        eventId: "e1",
        jobId: "job-1",
        attemptId: "attempt-1",
        generation: 2,
        kind: "ack",
        phase: "accepted",
        payload: {},
      })
    ).toMatchObject({ disposition: "duplicate" });
  });

  it("does not let a stale receipt poison a later valid receipt with the same provider event id", () => {
    const state: OrcaJobReceiptState = {
      jobId: "job-unique-1",
      attemptId: "attempt-unique-1",
      generation: 1,
      status: "running",
    };
    const receipt = {
      eventId: "provider-reused-id",
      jobId: state.jobId,
      attemptId: state.attemptId,
      generation: state.generation,
      kind: "effect" as const,
      phase: "completed" as const,
      payload: {},
    };
    expect(
      normalizeOrcaReceipt(state, { ...receipt, attemptId: "old-attempt" })
    ).toMatchObject({ disposition: "stale" });
    expect(normalizeOrcaReceipt(state, receipt)).toMatchObject({
      disposition: "accepted",
      effectVerified: true,
    });
  });
});
