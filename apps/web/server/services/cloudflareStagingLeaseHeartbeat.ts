import type { JobExecutor } from "./jobExecutor";

/** Artifact verification may exceed one lease; renewal never extends the hard deadline. */
export function withCloudflareStagingLeaseHeartbeat(executor: JobExecutor): JobExecutor {
  return async input => {
    const { reporter, lease } = input;
    await reporter.assertActive(lease);
    await reporter.heartbeat(lease);
    let active = true;
    let failure: unknown;
    let pending: Promise<void> | undefined;
    const remaining = Date.parse(lease.expiresAt) - Date.now();
    const interval = Number.isFinite(remaining) ? Math.max(250, Math.min(15_000, remaining / 3)) : 15_000;
    const timer = setInterval(() => {
      if (!active || pending || failure) return;
      pending = reporter.heartbeat(lease).catch(error => { failure = error; }).finally(() => { pending = undefined; });
    }, interval);
    timer.unref?.();
    try {
      const result = await executor({ ...input, reporter: { ...reporter,
        assertActive: async current => {
          await pending;
          if (failure) throw failure;
          await reporter.assertActive(current);
        },
      } });
      await pending;
      if (failure) throw failure;
      return result;
    } finally {
      active = false;
      clearInterval(timer);
      await pending;
    }
  };
}
