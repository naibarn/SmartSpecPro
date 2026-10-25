import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleDB } from "../db";
import { workerJobs, workerJobEvents } from "../../drizzle/schema";
import { appendJobEvent } from "./jobControlPlane";
import { PRODUCTION_INGRESS_CONTRACT } from "./cloudflareProductionIngressContract";

export const ingressBrowserReceiptSchema = z
  .object({
    routeId: z.string().regex(/^[a-f0-9]{32}$/),
    deploymentId: z.string().uuid(),
    versionId: z.string().uuid(),
  })
  .strict();
export type IngressBrowserReceipt = z.infer<typeof ingressBrowserReceiptSchema>;
export const INGRESS_BROWSER_STAGE = "AWAITING_AUTHENTICATED_ACCEPTANCE";
const eventKey = (jobId: string, fence: number) =>
  `ingress-browser:${jobId}:${fence}`;

/** An observation under the existing canary, never a new approval or a caller-
 * supplied identity. Only the same requester arriving through attested apex
 * ingress can record it while the canonical executor retains its lease. */
export async function recordIngressBrowserAcceptance(
  db: DrizzleDB,
  input: {
    jobId: string;
    actorUserId: number;
    tenantId: string;
    verifiedPublicOrigin?: string;
    receipt: IngressBrowserReceipt;
    passed: boolean;
  }
) {
  if (input.verifiedPublicOrigin !== "https://smartaihub.app")
    throw new Error("INGRESS_ACCEPTANCE_NOT_EDGE_ATTESTED");
  const receipt = ingressBrowserReceiptSchema.parse(input.receipt);
  return db.transaction(async tx => {
    const [job] = await tx
      .select()
      .from(workerJobs)
      .where(eq(workerJobs.id, input.jobId))
      .for("update");
    const progress = job?.progressJson as
      { stage?: string; measured?: Record<string, unknown> } | undefined;
    const measured = progress?.measured;
    if (
      !job ||
      job.jobType !== "cloudflare.production.deploy" ||
      job.contractVersion !== PRODUCTION_INGRESS_CONTRACT ||
      job.tenantId !== input.tenantId ||
      job.requestedByUserId !== input.actorUserId ||
      job.status !== "running" ||
      !job.leaseExpiresAt ||
      job.leaseExpiresAt.getTime() <= Date.now() ||
      progress?.stage !== INGRESS_BROWSER_STAGE ||
      !measured ||
      !Number.isFinite(Number(measured.acceptanceDeadline)) ||
      Number(measured.acceptanceDeadline) <= Date.now() ||
      Object.entries(receipt).some(([key, value]) => measured[key] !== value)
    )
      throw new Error("INGRESS_ACCEPTANCE_SCOPE_DENIED");
    const payload = {
      ...receipt,
      actorUserId: input.actorUserId,
      tenantId: input.tenantId,
      fencingVersion: job.fencingVersion,
      passed: input.passed,
      verifiedPublicOrigin: input.verifiedPublicOrigin,
      verifiedAt: new Date().toISOString(),
    };
    await appendJobEvent(tx, {
      workerJobId: job.id,
      eventType: "INGRESS_BROWSER_ACCEPTANCE",
      attemptId: undefined,
      eventIdempotencyKey: eventKey(job.id, job.fencingVersion),
      payloadJson: payload,
    });
    return { recorded: true };
  });
}

export async function waitForIngressBrowserAcceptance(
  db: DrizzleDB,
  input: {
    jobId: string;
    requesterUserId: number;
    tenantId: string;
    fencingVersion: number;
    receipt: IngressBrowserReceipt;
    deadline: number;
    assertActive: () => Promise<void>;
    pollMs?: number;
  }
) {
  while (Date.now() < input.deadline) {
    await input.assertActive();
    const [event] = await db
      .select({ payload: workerJobEvents.payloadJson })
      .from(workerJobEvents)
      .where(
        and(
          eq(workerJobEvents.workerJobId, input.jobId),
          eq(
            workerJobEvents.eventIdempotencyKey,
            eventKey(input.jobId, input.fencingVersion)
          )
        )
      );
    const value = event?.payload as Record<string, unknown> | undefined;
    if (value) {
      if (
        value.actorUserId !== input.requesterUserId ||
        value.tenantId !== input.tenantId ||
        value.fencingVersion !== input.fencingVersion ||
        value.verifiedPublicOrigin !== "https://smartaihub.app" ||
        Object.entries(input.receipt).some(([key, v]) => value[key] !== v)
      ) {
        throw new Error("INGRESS_BROWSER_ACCEPTANCE_SCOPE_INVALID");
      }
      if (value.passed !== true)
        throw new Error("INGRESS_BROWSER_ACCEPTANCE_FAILED");
      return {
        verified: true as const,
        actorUserId: input.requesterUserId,
        verifiedAt: String(value.verifiedAt),
      };
    }
    await new Promise(resolve =>
      setTimeout(
        resolve,
        Math.min(input.pollMs ?? 2000, Math.max(1, input.deadline - Date.now()))
      )
    );
  }
  throw new Error("INGRESS_BROWSER_ACCEPTANCE_TIMEOUT");
}
