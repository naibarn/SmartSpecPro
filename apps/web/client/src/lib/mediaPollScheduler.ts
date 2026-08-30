/**
 * Serializes status reads for a group of already-submitted media tasks.
 * Provider status endpoints are often rate-limited more aggressively than
 * generation submission endpoints, so a candidate batch must not poll all
 * tasks at the exact same instant.
 */
export class SerializedMediaPollScheduler {
  private tail: Promise<void> = Promise.resolve();
  private nextAllowedAt = 0;

  constructor(private readonly minimumGapMs = 750) {}

  run<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(resolve => {
      release = resolve;
    });

    return previous.then(async () => {
      try {
        const waitMs = Math.max(0, this.nextAllowedAt - Date.now());
        if (waitMs > 0) {
          await new Promise<void>(resolve => setTimeout(resolve, waitMs));
        }
        return await operation();
      } finally {
        this.nextAllowedAt = Date.now() + this.minimumGapMs;
        release();
      }
    });
  }
}
