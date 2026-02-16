import { describe, expect, it } from "vitest";

import {
  buildLibraryIndexJobPayload,
  parseLibraryIndexJobPayload,
  shouldThrottleLibraryEnqueue,
} from "./libraryIndexJobContract";

describe("libraryIndexJobContract payload builder", () => {
  it("builds gallery payload with required fields", () => {
    const payload = buildLibraryIndexJobPayload({
      domain: "gallery",
      operation: "index",
      tenantId: "tenant-001",
      entityId: "gallery:123",
      source: "gallery.create",
      sourceMetadata: { route: "gallery.create" },
    });

    expect(payload.version).toBe("v2");
    expect(payload.domain).toBe("gallery");
    expect(payload.operation).toBe("index");
    expect(payload.tenantId).toBe("tenant-001");
    expect(payload.dedupeKey).toContain("tenant-001");
    expect(payload.source).toBe("gallery.create");
  });

  it("builds library payload for delete operation", () => {
    const payload = buildLibraryIndexJobPayload({
      domain: "library",
      operation: "delete",
      tenantId: "tenant-002",
      entityId: "library:88",
      source: "library.delete",
      sourceMetadata: { route: "library.delete" },
    });

    expect(payload.version).toBe("v2");
    expect(payload.domain).toBe("library");
    expect(payload.operation).toBe("delete");
    expect(payload.entityId).toBe("library:88");
  });

  it("produces stable dedupe keys for retry-safe enqueue", () => {
    const a = buildLibraryIndexJobPayload({
      domain: "library",
      operation: "index",
      tenantId: "tenant-003",
      entityId: "library:99",
      source: "library.upload",
    });

    const b = buildLibraryIndexJobPayload({
      domain: "library",
      operation: "index",
      tenantId: "tenant-003",
      entityId: "library:99",
      source: "library.upload",
    });

    expect(a.dedupeKey).toBe(b.dedupeKey);
  });
});

describe("libraryIndexJobContract parser", () => {
  it("parses v2 payloads and preserves source metadata", () => {
    const payload = buildLibraryIndexJobPayload({
      domain: "library",
      operation: "index",
      tenantId: "tenant-004",
      entityId: "library:33",
      source: "ingestion.pipeline",
      sourceMetadata: { ingestion: "media_to_library", origin: "upload" },
    });

    const parsed = parseLibraryIndexJobPayload(payload);
    expect(parsed.version).toBe("v2");
    expect(parsed.sourceMetadata).toEqual({ ingestion: "media_to_library", origin: "upload" });
  });

  it("keeps legacy payload compatibility", () => {
    const parsed = parseLibraryIndexJobPayload({
      tenantId: "tenant-legacy",
      libraryItemId: 45,
      jobType: "initial_index",
    });

    expect(parsed.version).toBe("legacy");
    expect(parsed.domain).toBe("library");
    expect(parsed.operation).toBe("index");
    expect(parsed.entityId).toBe("library:45");
  });
});

describe("library enqueue backpressure", () => {
  it("throttles only when configured threshold is exceeded", () => {
    expect(
      shouldThrottleLibraryEnqueue({
        enabled: true,
        currentQueueLagMinutes: 16,
        maxQueueLagMinutes: 15,
      }),
    ).toBe(true);

    expect(
      shouldThrottleLibraryEnqueue({
        enabled: true,
        currentQueueLagMinutes: 8,
        maxQueueLagMinutes: 15,
      }),
    ).toBe(false);
  });
});
