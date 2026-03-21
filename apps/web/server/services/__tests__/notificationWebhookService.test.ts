import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";

// Mock crypto module
vi.mock("../../services/crypto", () => ({
  encrypt: vi.fn((s: string) => `encrypted:${s}`),
  decrypt: vi.fn((s: string) => s.replace("encrypted:", "")),
}));

// Mock dns/promises
const mockResolve4 = vi.fn();
const mockResolve6 = vi.fn();
vi.mock("node:dns/promises", () => ({
  default: { resolve4: mockResolve4, resolve6: mockResolve6 },
  resolve4: mockResolve4,
  resolve6: mockResolve6,
}));

// Mock Redis
const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();
vi.mock("../../services/redis", () => ({
  getRedisClient: () => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
  }),
}));

// Mock getDb
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockReturning = vi.fn();
const mockValues = vi.fn();
const mockSet = vi.fn();
const mockOnConflictDoNothing = vi.fn();

vi.mock("../../db", () => ({
  getDb: () => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  }),
}));

// Mock redisClients
vi.mock("../redisClients", () => ({
  getRealtimeClient: () => ({
    duplicate: () => ({ host: "localhost", port: 6379 }),
  }),
}));

// Mock BullMQ
const mockQueueAdd = vi.fn();
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: vi.fn(),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    close: vi.fn(),
    on: vi.fn(),
  })),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock createNotification
vi.mock("../../services/notificationService", () => ({
  createNotification: vi.fn(),
  mapToCategory: vi.fn(() => "system_health"),
}));

describe("SSRF Prevention - isPrivateIp", () => {
  let isPrivateIp: (ip: string) => boolean;

  beforeEach(async () => {
    const mod = await import("../notificationWebhookService");
    isPrivateIp = mod.isPrivateIp;
  });

  it("detects 127.0.0.0/8 (loopback)", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("127.255.255.255")).toBe(true);
  });

  it("detects 10.0.0.0/8 (private)", () => {
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("10.255.255.255")).toBe(true);
  });

  it("detects 172.16.0.0/12 (private)", () => {
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
  });

  it("detects 192.168.0.0/16 (private)", () => {
    expect(isPrivateIp("192.168.0.1")).toBe(true);
    expect(isPrivateIp("192.168.255.255")).toBe(true);
  });

  it("detects 169.254.0.0/16 (link-local)", () => {
    expect(isPrivateIp("169.254.0.1")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
  });

  it("detects 0.0.0.0/8 (unspecified)", () => {
    expect(isPrivateIp("0.0.0.0")).toBe(true);
    expect(isPrivateIp("0.1.2.3")).toBe(true);
  });

  it("allows public IP addresses", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
    expect(isPrivateIp("203.0.113.1")).toBe(false);
  });
});

describe("SSRF Prevention - validateWebhookUrl", () => {
  let validateWebhookUrl: (url: string) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockResolve6.mockRejectedValue(new Error("ENODATA")); // No AAAA records by default
    const mod = await import("../notificationWebhookService");
    validateWebhookUrl = mod.validateWebhookUrl;
  });

  it("rejects http:// URLs (only HTTPS allowed)", async () => {
    await expect(validateWebhookUrl("http://example.com/hook")).rejects.toThrow(
      /HTTPS/i
    );
  });

  it("rejects URLs resolving to 127.0.0.0/8 (loopback)", async () => {
    mockResolve4.mockResolvedValue(["127.0.0.1"]);
    await expect(
      validateWebhookUrl("https://localhost/hook")
    ).rejects.toThrow(/private|reserved/i);
  });

  it("rejects URLs resolving to 10.0.0.0/8 (private)", async () => {
    mockResolve4.mockResolvedValue(["10.0.0.5"]);
    await expect(
      validateWebhookUrl("https://internal.example.com/hook")
    ).rejects.toThrow(/private|reserved/i);
  });

  it("rejects URLs resolving to 172.16.0.0/12 (private)", async () => {
    mockResolve4.mockResolvedValue(["172.16.0.1"]);
    await expect(
      validateWebhookUrl("https://internal.example.com/hook")
    ).rejects.toThrow(/private|reserved/i);
  });

  it("rejects URLs resolving to 192.168.0.0/16 (private)", async () => {
    mockResolve4.mockResolvedValue(["192.168.1.1"]);
    await expect(
      validateWebhookUrl("https://router.local/hook")
    ).rejects.toThrow(/private|reserved/i);
  });

  it("rejects URLs resolving to 169.254.0.0/16 (link-local)", async () => {
    mockResolve4.mockResolvedValue(["169.254.169.254"]);
    await expect(
      validateWebhookUrl("https://metadata.google.internal/hook")
    ).rejects.toThrow(/private|reserved/i);
  });

  it("accepts URLs resolving to public IP addresses", async () => {
    mockResolve4.mockResolvedValue(["93.184.216.34"]);
    await expect(
      validateWebhookUrl("https://example.com/hook")
    ).resolves.not.toThrow();
  });

  it("rejects invalid URL formats", async () => {
    await expect(validateWebhookUrl("not-a-url")).rejects.toThrow();
  });

  it("rejects URLs where DNS resolution fails", async () => {
    mockResolve4.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(
      validateWebhookUrl("https://nonexistent.example.com/hook")
    ).rejects.toThrow(/DNS|resolve/i);
  });
});

describe("HMAC Signing - computeSignature", () => {
  let computeSignature: (body: string, secret: string) => string;

  beforeEach(async () => {
    const mod = await import("../notificationWebhookService");
    computeSignature = mod.computeSignature;
  });

  it("computes HMAC-SHA256 over JSON body string", () => {
    const sig = computeSignature('{"test":true}', "mysecret");
    expect(sig).toBeTruthy();
    expect(typeof sig).toBe("string");
  });

  it("returns hex-encoded signature string", () => {
    const sig = computeSignature('{"test":true}', "mysecret");
    expect(sig).toMatch(/^[0-9a-f]+$/);
  });

  it("produces consistent signature for same body and secret", () => {
    const sig1 = computeSignature('{"test":true}', "mysecret");
    const sig2 = computeSignature('{"test":true}', "mysecret");
    expect(sig1).toBe(sig2);
  });

  it("produces different signatures for different secrets", () => {
    const sig1 = computeSignature('{"test":true}', "secret1");
    const sig2 = computeSignature('{"test":true}', "secret2");
    expect(sig1).not.toBe(sig2);
  });
});

describe("Webhook Matching - findMatchingWebhooks", () => {
  let findMatchingWebhooks: (
    tenantId: string,
    userId: number,
    category: string,
    priority: string
  ) => Promise<any[]>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../notificationWebhookService");
    findMatchingWebhooks = mod.findMatchingWebhooks;

    // Set up chainable mock
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([]);
  });

  it("returns tenant-wide webhooks (userId=null) for any user in tenant", async () => {
    mockWhere.mockResolvedValue([
      {
        id: 1,
        tenantId: "tenant-1",
        userId: null,
        name: "Tenant Hook",
        url: "https://example.com/hook",
        categories: null,
        minSeverity: null,
        isEnabled: true,
        failureCount: 0,
      },
    ]);

    const result = await findMatchingWebhooks("tenant-1", 42, "system_health", "normal");
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBeNull();
  });

  it("returns user-specific webhooks only for that user", async () => {
    mockWhere.mockResolvedValue([
      {
        id: 2,
        tenantId: "tenant-1",
        userId: 42,
        name: "My Hook",
        url: "https://example.com/hook",
        categories: null,
        minSeverity: null,
        isEnabled: true,
        failureCount: 0,
      },
    ]);

    const result = await findMatchingWebhooks("tenant-1", 42, "system_health", "normal");
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe(42);
  });

  it("filters by categories when categories is not null", async () => {
    mockWhere.mockResolvedValue([
      {
        id: 1,
        categories: ["media_jobs"],
        minSeverity: null,
        isEnabled: true,
      },
    ]);

    const result = await findMatchingWebhooks("tenant-1", 42, "system_health", "normal");
    expect(result).toHaveLength(0);
  });

  it("returns webhook when categories is null (matches all)", async () => {
    mockWhere.mockResolvedValue([
      {
        id: 1,
        categories: null,
        minSeverity: null,
        isEnabled: true,
      },
    ]);

    const result = await findMatchingWebhooks("tenant-1", 42, "system_health", "normal");
    expect(result).toHaveLength(1);
  });

  it("filters by minSeverity (skips lower priority notifications)", async () => {
    mockWhere.mockResolvedValue([
      {
        id: 1,
        categories: null,
        minSeverity: "high",
        isEnabled: true,
      },
    ]);

    const result = await findMatchingWebhooks("tenant-1", 42, "system_health", "normal");
    expect(result).toHaveLength(0);
  });

  it("returns webhook when notification meets minSeverity threshold", async () => {
    mockWhere.mockResolvedValue([
      {
        id: 1,
        categories: null,
        minSeverity: "normal",
        isEnabled: true,
      },
    ]);

    const result = await findMatchingWebhooks("tenant-1", 42, "system_health", "high");
    expect(result).toHaveLength(1);
  });

  it("excludes disabled webhooks (isEnabled=false)", async () => {
    mockWhere.mockResolvedValue([]);
    const result = await findMatchingWebhooks("tenant-1", 42, "system_health", "normal");
    expect(result).toHaveLength(0);
  });
});

describe("BullMQ Job Enqueue - enqueueWebhookDelivery", () => {
  let enqueueWebhookDelivery: (
    webhookId: number,
    payload: any
  ) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../notificationWebhookService");
    enqueueWebhookDelivery = mod.enqueueWebhookDelivery;
  });

  it("enqueues a BullMQ job with webhookId and payload", async () => {
    const payload = {
      event: "notification.created" as const,
      timestamp: new Date().toISOString(),
      notification: {
        id: 1,
        type: "system",
        title: "Test",
        content: null,
        priority: "normal",
        relatedResourceType: null,
        relatedResourceId: null,
        actionUrl: null,
        metadata: null,
        createdAt: new Date().toISOString(),
      },
    };

    await enqueueWebhookDelivery(1, payload);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "webhook-deliver",
      { webhookId: 1, payload },
      expect.objectContaining({
        attempts: 3,
        backoff: expect.objectContaining({
          type: "exponential",
          delay: 5000,
        }),
      })
    );
  });

  it("enqueue failure does not throw (fire-and-forget)", async () => {
    mockQueueAdd.mockRejectedValue(new Error("Redis down"));
    const payload = {
      event: "notification.created" as const,
      timestamp: new Date().toISOString(),
      notification: {
        id: 1,
        type: "system",
        title: "Test",
        content: null,
        priority: "normal",
        relatedResourceType: null,
        relatedResourceId: null,
        actionUrl: null,
        metadata: null,
        createdAt: new Date().toISOString(),
      },
    };

    await expect(enqueueWebhookDelivery(1, payload)).resolves.not.toThrow();
  });
});

describe("Webhook Delivery - deliverWebhook", () => {
  let deliverWebhook: (webhookId: number, payload: any) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../notificationWebhookService");
    deliverWebhook = mod.deliverWebhook;

    // Default: webhook exists and DNS resolves to public IP
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([
      {
        id: 1,
        tenantId: "tenant-1",
        userId: null,
        name: "Test Hook",
        url: "https://example.com/hook",
        secretEncrypted: "encrypted:my-secret-key-1234",
        categories: null,
        minSeverity: null,
        isEnabled: true,
        failureCount: 0,
      },
    ]);

    mockResolve4.mockResolvedValue(["93.184.216.34"]);
    mockResolve6.mockRejectedValue(new Error("ENODATA")); // No AAAA records by default

    // Mock update chain
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    // For update, where should return a returning() chain
    mockWhere.mockReturnValue({
      returning: () => Promise.resolve([{ failureCount: 0 }]),
    });
  });

  it("sends POST with correct payload format", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    // Re-setup mocks for the delivery flow
    let callCount = 0;
    mockWhere.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: select webhook - needs .limit()
        return {
          limit: () =>
            Promise.resolve([
              {
                id: 1,
                tenantId: "tenant-1",
                userId: null,
                name: "Test Hook",
                url: "https://example.com/hook",
                secretEncrypted: "encrypted:my-secret-key-1234",
                categories: null,
                minSeverity: null,
                isEnabled: true,
                failureCount: 0,
              },
            ]),
        };
      }
      // Subsequent calls: update operations (success path has no .returning())
      return Promise.resolve(undefined);
    });
    // For success path, the update.set.where chain resolves directly
    mockSet.mockReturnValue({ where: mockWhere });

    const payload = {
      event: "notification.created" as const,
      timestamp: "2026-03-21T00:00:00.000Z",
      notification: {
        id: 1,
        type: "system",
        title: "Test",
        content: null,
        priority: "normal",
        relatedResourceType: null,
        relatedResourceId: null,
        actionUrl: null,
        metadata: null,
        createdAt: "2026-03-21T00:00:00.000Z",
      },
    };

    await deliverWebhook(1, payload);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "User-Agent": "SmartSpecPro-Webhook/1.0",
        }),
      })
    );
  });

  it("includes X-Signature-256 header with HMAC signature", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    let callCount = 0;
    mockWhere.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          limit: () =>
            Promise.resolve([
              {
                id: 1,
                url: "https://example.com/hook",
                secretEncrypted: "encrypted:my-secret-key-1234",
                isEnabled: true,
                failureCount: 0,
              },
            ]),
        };
      }
      return Promise.resolve(undefined);
    });

    await deliverWebhook(1, {
      event: "notification.created",
      timestamp: "2026-03-21T00:00:00.000Z",
      notification: { id: 1, type: "system", title: "Test", content: null, priority: "normal", relatedResourceType: null, relatedResourceId: null, actionUrl: null, metadata: null, createdAt: "2026-03-21T00:00:00.000Z" },
    });

    const fetchCall = mockFetch.mock.calls[0];
    const headers = fetchCall[1].headers;
    expect(headers["X-Signature-256"]).toMatch(/^sha256=[0-9a-f]+$/);
  });

  it("rejects delivery if resolved IP is private at delivery time", async () => {
    mockResolve4.mockResolvedValue(["10.0.0.1"]);

    let callCount = 0;
    mockWhere.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          limit: () =>
            Promise.resolve([
              {
                id: 1,
                url: "https://example.com/hook",
                secretEncrypted: "encrypted:my-secret-key-1234",
                isEnabled: true,
                failureCount: 0,
              },
            ]),
        };
      }
      return Promise.resolve(undefined);
    });

    await expect(
      deliverWebhook(1, {
        event: "notification.created",
        timestamp: "2026-03-21T00:00:00.000Z",
        notification: { id: 1, type: "system", title: "Test", content: null, priority: "normal", relatedResourceType: null, relatedResourceId: null, actionUrl: null, metadata: null, createdAt: "2026-03-21T00:00:00.000Z" },
      })
    ).rejects.toThrow(/private|reserved|SSRF/i);
  });

  it("increments failureCount on delivery failure", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" });

    let callCount = 0;
    mockWhere.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          limit: () =>
            Promise.resolve([
              {
                id: 1,
                tenantId: "1",
                url: "https://example.com/hook",
                secretEncrypted: "encrypted:my-secret-key-1234",
                isEnabled: true,
                failureCount: 0,
              },
            ]),
        };
      }
      // For atomic update with .returning()
      return {
        returning: () => Promise.resolve([{ failureCount: 1 }]),
      };
    });

    await expect(
      deliverWebhook(1, {
        event: "notification.created",
        timestamp: "2026-03-21T00:00:00.000Z",
        notification: { id: 1, type: "system", title: "Test", content: null, priority: "normal", relatedResourceType: null, relatedResourceId: null, actionUrl: null, metadata: null, createdAt: "2026-03-21T00:00:00.000Z" },
      })
    ).rejects.toThrow(/delivery failed/i);

    // Verify update was called to increment failure count
    expect(mockUpdate).toHaveBeenCalled();
  });
});
