import { getDb } from "../server/db";
import { persistInferencePlan } from "../server/services/inference/persistence";

async function main() {
  const serialized = process.env.SPEC231_PERSIST_PLAN_INPUT;
  if (!serialized) throw new Error("Spec 231 test input is missing");

  const input = JSON.parse(serialized);
  const result = await persistInferencePlan(input);
  await (getDb() as any).$client.end();
  process.stdout.write(
    `${JSON.stringify({ created: result.created, planId: result.plan.planId })}\n`,
  );
}

main().catch(async error => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Spec 231 process test failed"}\n`,
  );
  try {
    await (getDb() as any).$client.end();
  } catch {
    // A failed connection may not have created a client to close.
  }
  process.exitCode = 1;
});
