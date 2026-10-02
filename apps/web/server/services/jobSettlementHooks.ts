export type JobSettlementHook = (jobId: string) => Promise<void>;

const hooks = new Map<string, JobSettlementHook>();

export function registerJobSettlementHook(
  jobType: string,
  hook: JobSettlementHook
): void {
  if (!jobType.trim() || hooks.has(jobType))
    throw new Error("JOB_SETTLEMENT_HOOK_DUPLICATE");
  hooks.set(jobType, hook);
}

export async function runJobSettlementHooks(input: {
  jobId: string;
  jobType: string;
}): Promise<void> {
  await hooks.get(input.jobType)?.(input.jobId);
}

export function resetJobSettlementHooksForTests(): void {
  hooks.clear();
}
