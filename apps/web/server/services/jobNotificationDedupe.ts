export function jobNotificationKey(input: { jobId: string; terminalState: string; revision: number }): string {
  return `${input.jobId}:${input.terminalState}:${input.revision}`;
}

export function shouldNotifyJob(seen: ReadonlySet<string>, input: { jobId: string; terminalState: string; revision: number }): boolean {
  return !seen.has(jobNotificationKey(input));
}
