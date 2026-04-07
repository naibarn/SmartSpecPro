import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  billingEnvelopeFromMetadata,
  DEFAULT_WORKER_JOB_RESERVATION_CREDITS,
  reserveWorkerJobCredits,
  reconcileWorkerJobCredits,
  WORKER_RUNTIME_CREDIT_SOURCE,
} from "../workerBillingService";

describe("workerBillingService", () => {
  const createCreditReservationMock = vi.fn();
  const drawFromReservationMock = vi.fn();
  const refundReservationMock = vi.fn();
  const deductCreditsMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createCreditReservationMock.mockResolvedValue({
      reservationId: "res-1",
      reservedAmount: DEFAULT_WORKER_JOB_RESERVATION_CREDITS,
    });
    drawFromReservationMock.mockResolvedValue({ drawn: 0, remaining: 0 });
    refundReservationMock.mockResolvedValue({ refundedAmount: 0 });
    deductCreditsMock.mockResolvedValue({ transactionId: 99 });
  });

  it("creates worker reservations with the worker_runtime source type", async () => {
    const result = await reserveWorkerJobCredits(
      {
        userId: 7,
        tenantId: "tenant-1",
      },
      {
        createCreditReservation: createCreditReservationMock as any,
      },
    );

    expect(createCreditReservationMock).toHaveBeenCalledWith(
      7,
      DEFAULT_WORKER_JOB_RESERVATION_CREDITS,
      WORKER_RUNTIME_CREDIT_SOURCE,
      expect.objectContaining({
        tenantId: "tenant-1",
        sourceType: WORKER_RUNTIME_CREDIT_SOURCE,
      }),
    );
    expect(result).toEqual({
      reservationId: "res-1",
      reservedCredits: DEFAULT_WORKER_JOB_RESERVATION_CREDITS,
      sourceType: WORKER_RUNTIME_CREDIT_SOURCE,
    });
  });

  it("reconciles completed jobs by drawing actual usage and refunding unused credits", async () => {
    const result = await reconcileWorkerJobCredits(
      {
        userId: 7,
        tenantId: "tenant-1",
        jobId: "job-1",
        billing: {
          reservationId: "res-1",
          reservedCredits: 25,
          sourceType: WORKER_RUNTIME_CREDIT_SOURCE,
        },
        finalStatus: "completed",
        actualCreditsUsed: 12,
      },
      {
        drawFromReservation: drawFromReservationMock as any,
        refundReservation: refundReservationMock as any,
        deductCredits: deductCreditsMock as any,
      },
    );

    expect(drawFromReservationMock).toHaveBeenCalledWith(
      "res-1",
      12,
      "Worker job job-1 credit reconciliation",
    );
    expect(refundReservationMock).toHaveBeenCalledWith("res-1");
    expect(deductCreditsMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "reconciled",
      actualCreditsUsed: 12,
      overflowCredits: 0,
    });
  });

  it("deducts overflow credits when actual usage exceeds the reservation", async () => {
    await reconcileWorkerJobCredits(
      {
        userId: 8,
        tenantId: "tenant-1",
        jobId: "job-2",
        billing: {
          reservationId: "res-2",
          reservedCredits: 25,
          sourceType: WORKER_RUNTIME_CREDIT_SOURCE,
        },
        finalStatus: "completed",
        actualCreditsUsed: 40,
      },
      {
        drawFromReservation: drawFromReservationMock as any,
        refundReservation: refundReservationMock as any,
        deductCredits: deductCreditsMock as any,
      },
    );

    expect(drawFromReservationMock).toHaveBeenCalledWith(
      "res-2",
      25,
      "Worker job job-2 credit reconciliation",
    );
    expect(deductCreditsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 8,
        amount: 15,
        idempotencyKey: "worker-job:job-2:overflow",
        sourceType: WORKER_RUNTIME_CREDIT_SOURCE,
      }),
    );
  });

  it("refunds reserved credits for failed jobs", async () => {
    const result = await reconcileWorkerJobCredits(
      {
        userId: 9,
        jobId: "job-3",
        billing: {
          reservationId: "res-3",
          reservedCredits: 25,
          sourceType: WORKER_RUNTIME_CREDIT_SOURCE,
        },
        finalStatus: "failed",
      },
      {
        drawFromReservation: drawFromReservationMock as any,
        refundReservation: refundReservationMock as any,
        deductCredits: deductCreditsMock as any,
      },
    );

    expect(drawFromReservationMock).not.toHaveBeenCalled();
    expect(refundReservationMock).toHaveBeenCalledWith("res-3");
    expect(deductCreditsMock).not.toHaveBeenCalled();
    expect(result.status).toBe("refunded");
  });

  it("parses billing envelopes from worker job metadata", () => {
    expect(
      billingEnvelopeFromMetadata({
        reservationId: "res-9",
        reservedCredits: 32,
        sourceType: "worker_runtime",
      }),
    ).toEqual({
      reservationId: "res-9",
      reservedCredits: 32,
      sourceType: "worker_runtime",
    });
    expect(billingEnvelopeFromMetadata({ reservationId: "res-9" })).toBeNull();
  });
});
