import { getDb } from "../server/db";
import { completeInferenceAttempt } from "../server/services/inference/persistence";

async function main() {
  const serialized = process.env.SPEC231_COMPLETE_ATTEMPT_INPUT;
  if (!serialized) throw new Error("Spec 231 attempt input is missing");

  const input = JSON.parse(serialized);
  const accepted = await completeInferenceAttempt(input);
  await (getDb() as any).$client.end();
  process.stdout.write(`${String(accepted)}\n`);
}

main().catch(async error => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Spec 231 attempt process failed"}\n`,
  );
  try {
    await (getDb() as any).$client.end();
  } catch {
    // A failed connection may not have created a client to close.
  }
  process.exitCode = 1;
});
