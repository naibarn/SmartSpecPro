import { getDb } from "../server/db";
import { createDurableInferenceCreditReservation } from "../server/services/inference/durableCreditReservation";

async function main() {
  const serialized = process.env.SPEC231_RESERVATION_INPUT;
  if (!serialized) throw new Error("Spec 231 reservation input is missing");
  const input = JSON.parse(serialized) as {
    userId: number;
    tenantId: string;
    principalRef: string;
    amount: number;
    idempotencyKey: string;
  };
  const result = await createDurableInferenceCreditReservation(input);
  process.stdout.write(`${JSON.stringify(result.ok
    ? { ok: true, reservationId: result.reservationId }
    : { ok: false, reason: result.reason })}\n`);
  await (getDb() as any).$client.end();
}

main().catch(async error => {
  process.stderr.write(`${error instanceof Error ? error.message : "Spec 231 reservation process failed"}\n`);
  try {
    await (getDb() as any).$client.end();
  } catch {
    // A failed connection may not have created a client to close.
  }
  process.exitCode = 1;
});
