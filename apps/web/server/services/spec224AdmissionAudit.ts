import { isDeepStrictEqual } from "node:util";

import { appendJobEvent } from "./jobControlPlane";
import { db, getDb } from "../db";
import { and, eq } from "drizzle-orm";
import { workerJobEvents } from "../../drizzle/schema";

export async function recordSpec224RunnerDispatchDenied(input: {
  workerJobId: string;
  attemptId: string;
  commandId: string;
  attempt: number;
  fencingToken: number;
}): Promise<void> {
  if (
    !input.workerJobId ||
    !input.attemptId ||
    !input.commandId ||
    !Number.isSafeInteger(input.attempt) ||
    input.attempt < 1 ||
    !Number.isSafeInteger(input.fencingToken) ||
    input.fencingToken < 0
  ) {
    throw new Error("SPEC224_ADMISSION_DENIAL_AUDIT_BINDING_INVALID");
  }
  getDb();
  const payloadJson = {
    commandId: input.commandId,
    reason: "DENIED_ADMISSION_NOT_ENABLED",
    attempt: input.attempt,
    fenceVersion: input.fencingToken,
  };
  const eventIdempotencyKey = `spec224:runner-admission-denied:${input.commandId}`;
  await db.instance.transaction(async tx => {
    await appendJobEvent(tx, {
      workerJobId: input.workerJobId,
      attemptId: input.attemptId,
      eventType: "SPEC224_RUNNER_DISPATCH_DENIED",
      eventIdempotencyKey,
      payloadJson,
    });
    const [existing] = await tx
      .select({
        eventType: workerJobEvents.eventType,
        payloadJson: workerJobEvents.payloadJson,
      })
      .from(workerJobEvents)
      .where(
        and(
          eq(workerJobEvents.workerJobId, input.workerJobId),
          eq(workerJobEvents.eventIdempotencyKey, eventIdempotencyKey)
        )
      )
      .limit(1);
    if (
      existing?.eventType !== "SPEC224_RUNNER_DISPATCH_DENIED" ||
      !isDeepStrictEqual(existing.payloadJson, payloadJson)
    ) {
      throw new Error("SPEC224_ADMISSION_DENIAL_AUDIT_CONFLICT");
    }
  });
}
