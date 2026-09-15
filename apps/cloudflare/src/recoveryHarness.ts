import type { CanonicalJobEnvelope } from "./contracts";

export type RecoveryEvent = {
  sequence: number;
  key: string;
  type: string;
};

export type RecoverySnapshot = {
  jobs: Record<string, { status: "queued" | "succeeded"; events: RecoveryEvent[] }>;
  outbox: Record<string, { envelope: CanonicalJobEnvelope; published: boolean }>;
  callbacks: string[];
  settlements: string[];
  checkpoints: Record<string, { revision: number; digest: string }>;
};

/**
 * Small deterministic model for local recovery tests. It deliberately models
 * evidence/idempotency only; it is not a second production job ledger.
 */
export class LocalRecoveryHarness {
  private readonly jobs = new Map<string, { status: "queued" | "succeeded"; events: RecoveryEvent[] }>();
  private readonly outbox = new Map<string, { envelope: CanonicalJobEnvelope; published: boolean }>();
  private readonly callbacks = new Set<string>();
  private readonly settlements = new Set<string>();
  private readonly checkpoints = new Map<string, { revision: number; digest: string }>();

  create(jobId: string, envelope: CanonicalJobEnvelope): void {
    if (!this.jobs.has(jobId)) this.jobs.set(jobId, { status: "queued", events: [{ sequence: 1, key: `created:${jobId}`, type: "CREATED" }] });
    if (!this.outbox.has(envelope.dedupe_key)) this.outbox.set(envelope.dedupe_key, { envelope, published: false });
  }

  appendEvent(jobId: string, key: string, type: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error("JOB_NOT_FOUND");
    if (job.events.some(event => event.key === key)) return false;
    job.events.push({ sequence: job.events.length + 1, key, type });
    if (type === "COMPLETED") job.status = "succeeded";
    return true;
  }

  async replayOutbox(publish: (envelope: CanonicalJobEnvelope) => Promise<void>): Promise<void> {
    for (const item of this.outbox.values()) {
      if (item.published) continue;
      await publish(item.envelope);
      item.published = true;
    }
  }

  acceptCallback(adapterNamespace: string, providerEventId: string): boolean {
    const key = `${adapterNamespace}:${providerEventId}`;
    if (this.callbacks.has(key)) return false;
    this.callbacks.add(key);
    return true;
  }

  recordSettlement(settlementKey: string): boolean {
    if (this.settlements.has(settlementKey)) return false;
    this.settlements.add(settlementKey);
    return true;
  }

  recordCheckpoint(checkpointKey: string, revision: number, digest: string): boolean {
    const existing = this.checkpoints.get(checkpointKey);
    if (!existing) {
      this.checkpoints.set(checkpointKey, { revision, digest });
      return true;
    }
    if (existing.revision !== revision || existing.digest !== digest) throw new Error("CHECKPOINT_CONFLICT");
    return false;
  }

  snapshot(): RecoverySnapshot {
    return {
      jobs: Object.fromEntries([...this.jobs.entries()].map(([id, job]) => [id, { status: job.status, events: job.events.map(event => ({ ...event })) }])),
      outbox: Object.fromEntries([...this.outbox.entries()].map(([key, item]) => [key, { envelope: structuredClone(item.envelope), published: item.published }])),
      callbacks: [...this.callbacks],
      settlements: [...this.settlements],
      checkpoints: Object.fromEntries([...this.checkpoints.entries()].map(([key, value]) => [key, { ...value }])),
    };
  }

  static restore(snapshot: RecoverySnapshot): LocalRecoveryHarness {
    const harness = new LocalRecoveryHarness();
    for (const [id, job] of Object.entries(snapshot.jobs)) harness.jobs.set(id, { status: job.status, events: job.events.map(event => ({ ...event })) });
    for (const [key, item] of Object.entries(snapshot.outbox)) harness.outbox.set(key, { envelope: structuredClone(item.envelope), published: item.published });
    snapshot.callbacks.forEach(key => harness.callbacks.add(key));
    snapshot.settlements.forEach(key => harness.settlements.add(key));
    for (const [key, value] of Object.entries(snapshot.checkpoints)) harness.checkpoints.set(key, { ...value });
    return harness;
  }
}
