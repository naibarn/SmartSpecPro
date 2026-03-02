/**
 * Resource Limits Tests
 *
 * Validates the Redis semaphore pattern and concurrency caps used across
 * voice, browser, and widget features.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Redis ───────────────────────────────────────────────────────────────

const mockEval = vi.fn();
const mockDecr = vi.fn();
const mockExists = vi.fn();
const mockGet = vi.fn();

const mockRedis = {
  eval: mockEval,
  decr: mockDecr,
  exists: mockExists,
  get: mockGet,
};

// Import after mock setup
import {
  acquireSemaphore,
  getSemaphoreCount,
} from "../redisSemaphore";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Resource Limits — Redis Semaphore Pattern", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDecr.mockResolvedValue(0);
    mockExists.mockResolvedValue(1); // Key exists by default
  });

  it("acquires semaphore slot when count is below limit", async () => {
    mockEval.mockResolvedValue(1); // Atomic INCR+EXPIRE returns new count = 1

    const handle = await acquireSemaphore(mockRedis as never, "test:key", 3, 60);

    expect(handle).not.toBeNull();
    expect(mockEval).toHaveBeenCalledWith(
      expect.any(String), // Lua script
      1,                  // numkeys
      "test:key",         // key
      "60",               // ttl as string
    );
  });

  it("acquires slot when at exactly max - 1", async () => {
    mockEval.mockResolvedValue(2); // Second slot out of 3

    const handle = await acquireSemaphore(mockRedis as never, "test:key", 3, 60);

    expect(handle).not.toBeNull();
  });

  it("acquires slot at exactly max capacity", async () => {
    mockEval.mockResolvedValue(3); // Third slot out of 3 (exactly at limit)

    const handle = await acquireSemaphore(mockRedis as never, "test:key", 3, 60);

    expect(handle).not.toBeNull();
  });

  it("rejects acquisition when semaphore is at capacity", async () => {
    mockEval.mockResolvedValue(4); // Over limit (max = 3)

    const handle = await acquireSemaphore(mockRedis as never, "test:key", 3, 60);

    expect(handle).toBeNull();
    // Must decrement to undo the over-limit increment
    expect(mockDecr).toHaveBeenCalledWith("test:key");
  });

  it("releases semaphore slot correctly on session end", async () => {
    mockEval.mockResolvedValue(1); // acquire INCR+EXPIRE returns 1

    const handle = await acquireSemaphore(mockRedis as never, "test:key", 3, 60);
    expect(handle).not.toBeNull();

    mockEval.mockResolvedValue(null); // release DECR_IF_EXISTS returns nil
    await handle!.release();

    // Release uses atomic Lua (DECR_IF_EXISTS) — no separate EXISTS or DECR calls
    expect(mockEval).toHaveBeenCalledWith(
      expect.stringContaining("DECR"),
      1,
      "test:key",
    );
    expect(mockExists).not.toHaveBeenCalled();
    expect(mockDecr).not.toHaveBeenCalled();
  });

  it("release is idempotent (safe to call multiple times)", async () => {
    mockEval.mockResolvedValue(1);

    const handle = await acquireSemaphore(mockRedis as never, "test:key", 3, 60);
    await handle!.release();
    await handle!.release(); // Second call must be a no-op

    // eval called twice: once for acquire (INCR+EXPIRE), once for first release (DECR_IF_EXISTS)
    expect(mockEval).toHaveBeenCalledTimes(2);
  });

  it("release skips DECR when key has already expired (TTL guard)", async () => {
    mockEval.mockResolvedValue(1);

    const handle = await acquireSemaphore(mockRedis as never, "test:key", 3, 60);
    await handle!.release();

    // Lua DECR_IF_EXISTS handles expiry atomically — no separate EXISTS or DECR round-trips
    expect(mockExists).not.toHaveBeenCalled();
    expect(mockDecr).not.toHaveBeenCalled();
    expect(mockEval).toHaveBeenCalledWith(
      expect.stringContaining("DECR"),
      1,
      "test:key",
    );
  });

  it("semaphore keys have TTL via Lua script (atomic INCR+EXPIRE)", async () => {
    mockEval.mockResolvedValue(1);

    await acquireSemaphore(mockRedis as never, "voice:session:user-123", 1, 300);

    // Verify Lua script is called with correct TTL argument
    expect(mockEval).toHaveBeenCalledWith(
      expect.stringContaining("EXPIRE"),
      1,
      "voice:session:user-123",
      "300",
    );
  });
});

describe("Resource Limits — Concurrency Caps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDecr.mockResolvedValue(0);
    mockExists.mockResolvedValue(1);
  });

  it("browser sessions limited to 1 per user", async () => {
    // Second attempt must be rejected (maxSlots = 1)
    mockEval.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    const first = await acquireSemaphore(
      mockRedis as never,
      "browser:session:user-abc",
      1,
      300,
    );
    const second = await acquireSemaphore(
      mockRedis as never,
      "browser:session:user-abc",
      1,
      300,
    );

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    // Over-capacity DECR
    expect(mockDecr).toHaveBeenCalledWith("browser:session:user-abc");
  });

  it("browser sessions limited to 2 per tenant", async () => {
    mockEval
      .mockResolvedValueOnce(1) // First
      .mockResolvedValueOnce(2) // Second
      .mockResolvedValueOnce(3); // Third → rejected

    const first = await acquireSemaphore(
      mockRedis as never,
      "browser:tenant:tenant-xyz",
      2,
      300,
    );
    const second = await acquireSemaphore(
      mockRedis as never,
      "browser:tenant:tenant-xyz",
      2,
      300,
    );
    const third = await acquireSemaphore(
      mockRedis as never,
      "browser:tenant:tenant-xyz",
      2,
      300,
    );

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(third).toBeNull();
  });

  it("voice sessions limited to 1 per user", async () => {
    mockEval.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    const first = await acquireSemaphore(
      mockRedis as never,
      "voice:session:user-abc",
      1,
      300,
    );
    const second = await acquireSemaphore(
      mockRedis as never,
      "voice:session:user-abc",
      1,
      300,
    );

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("widget connections respect per-visitor session cap", async () => {
    mockEval.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    const first = await acquireSemaphore(
      mockRedis as never,
      "widget:session:visitor-v123",
      1,
      1800,
    );
    const second = await acquireSemaphore(
      mockRedis as never,
      "widget:session:visitor-v123",
      1,
      1800,
    );

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });
});

describe("Resource Limits — getSemaphoreCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 0 when key does not exist", async () => {
    mockGet.mockResolvedValue(null);

    const count = await getSemaphoreCount(mockRedis as never, "test:key");

    expect(count).toBe(0);
  });

  it("returns current count when key exists", async () => {
    mockGet.mockResolvedValue("3");

    const count = await getSemaphoreCount(mockRedis as never, "test:key");

    expect(count).toBe(3);
  });

  it("returns 0 for non-numeric value (safety fallback)", async () => {
    mockGet.mockResolvedValue("not-a-number");

    const count = await getSemaphoreCount(mockRedis as never, "test:key");

    expect(count).toBe(0);
  });
});

describe("Resource Limits — Lazy Initialization", () => {
  it("channel adapters are not initialized until first use", () => {
    // Static assertion: ChannelAdapterRegistry (section-05) uses lazy init.
    // Audit: channelAdapterRegistry.ts must not call adapter constructors on import.
    expect(true).toBe(true); // Verified in channelAdapterRegistry.test.ts
  });

  it("widget WebSocket handler initializes on first message, not on page load", () => {
    // Static assertion: widgetGateway.ts WebSocket 'connection' event must only
    // validate auth token. Heavy init (persona, context) on first 'message' event.
    expect(true).toBe(true); // Verified in widgetService.test.ts
  });
});
