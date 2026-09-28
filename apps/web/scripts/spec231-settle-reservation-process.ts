import { getDb } from "../server/db";
import { settleDurableInferenceCreditReservation } from "../server/services/inference/durableCreditReservation";

async function main() {
  const serialized = process.env.SPEC231_SETTLEMENT_INPUT;
  if (!serialized) throw new Error("Spec 231 settlement input is missing");

  const input = JSON.parse(serialized);
  const settled = await settleDurableInferenceCreditReservation(input);
  await (getDb() as any).$client.end();
  process.stdout.write(`${String(settled)}\n`);
}

main().catch(async error => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Spec 231 settlement process failed"}\n`,
  );
  try {
    await (getDb() as any).$client.end();
  } catch {
    // A failed connection may not have created a client to close.
  }
  process.exitCode = 1;
});
