import { afterEach, describe, expect, it, vi } from "vitest";
import { withCloudflareStagingLeaseHeartbeat } from "./cloudflareStagingLeaseHeartbeat";

afterEach(() => vi.useRealTimers());
describe("staging artifact verification lease renewal", () => {
  it("retains the same fence through a slow read beyond the original expiry and stops the timer", async () => {
    vi.useFakeTimers();
    let authoritativeExpiry = Date.now() + 1000;
    const lease = { jobId: "job", attemptId: "attempt", leaseToken: "disposable-test-only", fencingVersion: 1, expiresAt: new Date(authoritativeExpiry).toISOString() };
    const reporter = {
      assertActive: vi.fn(async current => { expect(current).toBe(lease); if (Date.now() >= authoritativeExpiry) throw Error("STALE"); }),
      heartbeat: vi.fn(async current => { expect(current).toBe(lease); authoritativeExpiry = Date.now() + 1000; }),
    };
    const execution = withCloudflareStagingLeaseHeartbeat(async input => {
      await new Promise(resolve => setTimeout(resolve, 3500));
      await input.reporter.assertActive(input.lease);
      return { output: { verified: true } };
    })({ reporter, lease } as never);
    await vi.advanceTimersByTimeAsync(3500);
    await expect(execution).resolves.toMatchObject({ output: { verified: true } });
    expect(reporter.heartbeat.mock.calls.length).toBeGreaterThan(3);
    const count = reporter.heartbeat.mock.calls.length;
    await vi.advanceTimersByTimeAsync(4000);
    expect(reporter.heartbeat).toHaveBeenCalledTimes(count);
  });

  it("blocks the next provider boundary after renewal is denied", async () => {
    vi.useFakeTimers();
    const mutate = vi.fn();
    const reporter = { assertActive: vi.fn(async () => undefined), heartbeat: vi.fn(async () => undefined) };
    reporter.heartbeat.mockResolvedValueOnce(undefined).mockRejectedValue(Error("LEASE_REVOKED"));
    const execution = withCloudflareStagingLeaseHeartbeat(async input => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await input.reporter.assertActive(input.lease);
      mutate(); return {};
    })({ reporter, lease: { expiresAt: new Date(Date.now() + 1000).toISOString() } } as never);
    const assertion = expect(execution).rejects.toThrow("LEASE_REVOKED");
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;
    expect(mutate).not.toHaveBeenCalled();
  });
});
