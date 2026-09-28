export const NODE_WORKER_SHUTDOWN_GRACE_MS = 20_000;

export type NodeWorkerDrainResult = "drained" | "timed_out";

export async function waitForNodeWorkerExecutions(
  executions: Iterable<Promise<unknown>>,
  timeoutMs = NODE_WORKER_SHUTDOWN_GRACE_MS,
): Promise<NodeWorkerDrainResult> {
  const active = [...executions];
  if (active.length === 0) return "drained";

  const drained = Promise.allSettled(active).then(() => "drained" as const);
  const timeout = new Promise<NodeWorkerDrainResult>(resolve => {
    const timer = setTimeout(() => resolve("timed_out"), Math.max(0, timeoutMs));
    timer.unref?.();
  });
  return Promise.race([drained, timeout]);
}
