import { publishPendingJobOutbox, type JobAdapterResolver } from "./jobOutboxPublisher";
import type { JobTransportAdapter } from "./jobTransportAdapters";

export type JobOutboxRunnerOptions = {
  adapters: ReadonlyMap<string, JobTransportAdapter>;
  resolveAdapter?: JobAdapterResolver;
  batchSize?: number;
  intervalMs?: number;
  publishBatch?: typeof publishPendingJobOutbox;
  now?: () => Date;
  onError?: (error: unknown) => void;
};

/** A bounded, stoppable runtime loop for the durable publication outbox. */
export class JobOutboxRunner {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopped = true;

  private readonly batchSize: number;
  private readonly intervalMs: number;
  private readonly publishBatch: typeof publishPendingJobOutbox;

  constructor(private readonly options: JobOutboxRunnerOptions) {
    this.batchSize = Math.max(1, Math.min(options.batchSize ?? 50, 500));
    this.intervalMs = Math.max(250, Math.min(options.intervalMs ?? 1000, 60_000));
    this.publishBatch = options.publishBatch ?? publishPendingJobOutbox;
  }

  get isRunning(): boolean {
    return !this.stopped;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.tick();
  }

  async runOnce(now = this.options.now?.() ?? new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.publishBatch(this.options.adapters, this.batchSize, now, this.options.resolveAdapter);
    } catch (error) {
      this.options.onError?.(error);
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    await this.runOnce();
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, this.intervalMs);
  }
}
