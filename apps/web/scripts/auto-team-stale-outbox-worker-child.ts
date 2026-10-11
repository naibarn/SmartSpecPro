import { createInterface } from "node:readline";
import { createJobControlPlane } from "../server/services/jobControlPlane";

type Input = { role: "stale" | "current"; jobId: string };
const input = JSON.parse(process.env.SPEC277_OUTBOX_INPUT ?? "null") as Input | null;
if (!input || !process.env.DATABASE_URL)
  throw new Error("SPEC277_OUTBOX_CHILD_INPUT_INVALID");

async function waitForSignal(): Promise<void> {
  await new Promise<void>(resolve => {
    const readline = createInterface({ input: process.stdin, terminal: false });
    readline.once("line", () => {
      readline.close();
      resolve();
    });
  });
}

async function run(): Promise<void> {
  const controlPlane = createJobControlPlane();
  if (input.role === "stale") {
    const lease = await controlPlane.claim({
      jobId: input.jobId,
      runnerId: "r7-outbox-stale",
      adapter: "postgres-pull",
    });
    if (!lease) throw new Error("SPEC277_OUTBOX_STALE_CLAIM_FAILED");
    await controlPlane.start(lease);
    process.stdout.write(`SPEC277_OUTBOX_STALE_READY ${lease.attemptId}\n`);
    await waitForSignal();
    for (const [label, action] of [
      ["TERMINAL", () => controlPlane.complete(lease, { output: { stale: true } })],
      ["RETRY_OUTBOX", () => controlPlane.fail(lease, {
        class: "retryable",
        code: "r7_stale_attempt_retry",
        message: "stale generation must not create a retry outbox",
      })],
    ] as const) {
      try {
        await action();
        throw new Error(`SPEC277_STALE_${label}_WAS_ACCEPTED`);
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        if (code !== "JOB_LEASE_STALE") throw error;
        process.stdout.write(`SPEC277_OUTBOX_STALE_${label}_REJECTED\n`);
      }
    }
    return;
  }

  const recovered = await controlPlane.recoverExpiredLease(input.jobId, new Date());
  if (recovered !== "recovered")
    throw new Error("SPEC277_OUTBOX_LEASE_RECOVERY_FAILED");
  if (!(await controlPlane.makeRetryDue(input.jobId)))
    throw new Error("SPEC277_OUTBOX_RETRY_NOT_DUE");
  const lease = await controlPlane.claim({
    jobId: input.jobId,
    runnerId: "r7-outbox-current",
    adapter: "postgres-pull",
  });
  if (!lease) throw new Error("SPEC277_OUTBOX_CURRENT_CLAIM_FAILED");
  await controlPlane.start(lease);
  process.stdout.write(`SPEC277_OUTBOX_CURRENT_READY ${lease.attemptId}\n`);
  await waitForSignal();
  await controlPlane.complete(lease, { output: { current: true } });
  process.stdout.write("SPEC277_OUTBOX_CURRENT_TERMINAL_ACCEPTED\n");
}

let exitCode = 0;
try {
  await run();
} catch (error) {
  exitCode = 1;
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  );
} finally {
  const { closeDb } = await import("../server/db");
  await closeDb();
}
await new Promise<void>(resolve => process.stdout.write("", resolve));
process.exit(exitCode);
