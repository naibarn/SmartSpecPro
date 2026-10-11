import { createInterface } from "node:readline";
import { closeDb } from "../server/db";
import { createJobControlPlane } from "../server/services/jobControlPlane";

type Input = {
  jobId: string;
  role: "interrupted-attempt" | "provider-wait" | "final-verify";
};

const input = JSON.parse(
  process.env.R7_TASK_CONTROL_INPUT ?? "null"
) as Input | null;
if (!input || !process.env.DATABASE_URL)
  throw new Error("R7_TASK_CONTROL_CHILD_INPUT_INVALID");

async function run() {
  const controlPlane = createJobControlPlane();
  const lease = await controlPlane.claim({
    jobId: input.jobId,
    runnerId: `r7-task-control-${input.role}`,
    adapter: "postgres-pull",
  });
  if (!lease) throw new Error(`R7_TASK_CONTROL_CLAIM_FAILED:${input.role}`);
  await controlPlane.start(lease);

  if (input.role === "interrupted-attempt") {
    await controlPlane.progress(lease, {
      progress: 20,
      stage: "execution",
      message: "Synthetic worker began the logical task.",
    });
    process.stdout.write(
      `R7_TASK_CONTROL_INTERRUPTED_READY ${lease.attemptId}\n`
    );
    await new Promise<void>(resolve => {
      const readline = createInterface({
        input: process.stdin,
        terminal: false,
      });
      readline.once("line", () => {
        readline.close();
        resolve();
      });
    });
    return;
  }

  if (input.role === "provider-wait") {
    await controlPlane.progress(lease, {
      progress: 35,
      stage: "provider_submission",
      message: "Synthetic provider operation accepted.",
    });
    await controlPlane.waitForExternal(lease, {
      operationKey: `r7-provider-operation:${input.jobId}`,
      providerReference: `synthetic:${input.jobId}`,
      resumeAfter: new Date(Date.now() + 60_000).toISOString(),
      metadata: { operation: "test-only-provider-wait" },
    });
    process.stdout.write("R7_TASK_CONTROL_PROVIDER_WAIT_PERSISTED\n");
    return;
  }

  await controlPlane.progress(lease, {
    progress: 90,
    stage: "final_verify",
    message: "Synthetic final evidence verification completed.",
    measured: { evidenceCount: 1, verified: true },
  });
  await controlPlane.complete(lease, {
    output: {
      finalVerification: {
        status: "passed",
        evidenceRef: `synthetic:final-verify:${input.jobId}`,
      },
    },
  });
  process.stdout.write("R7_TASK_CONTROL_FINAL_VERIFY_COMPLETED\n");
}

try {
  await run();
} finally {
  await closeDb();
}
