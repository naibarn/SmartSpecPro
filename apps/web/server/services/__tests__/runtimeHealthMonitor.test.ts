import { describe, expect, it } from "vitest";
import {
  collectRuntimeHealthEvidence,
  getEventLoopMetrics,
  getRuntimeMemoryMetrics,
  parseCgroupEvents,
  readCgroupMemoryMetrics,
} from "../runtimeHealthMonitor";

describe("runtimeHealthMonitor", () => {
  it("normalizes self-attested runtime identity and revision without claiming deployment proof", () => {
    const result = collectRuntimeHealthEvidence({
      now: new Date("2026-10-07T12:00:00.000Z"),
      env: { NODE_ENV: "test", SMARTSPEC_RUNTIME_ID: "web-test-1", SMARTSPEC_EXPECTED_REVISION: "abc", COMMIT_SHA: "abc" },
      snapshot: {
        timestamp: "2026-10-07T12:00:00.000Z",
        memory: { rssBytes: 100, heapTotalBytes: 200, heapUsedBytes: 150, externalBytes: 75, arrayBuffersBytes: 25 },
        eventLoop: { meanMs: null, p95Ms: null, maxMs: null, minMs: null },
        cgroup: { root: null, currentBytes: null, highBytes: null, maxBytes: null, events: {} },
      },
    });
    expect(result).toMatchObject({ status: "OBSERVED", value: {
      runtimeIdentity: "web-test-1", expectedRevision: "abc", observedRevision: "abc",
      readiness: "UNKNOWN", health: "HEALTHY", freshness: "FRESH",
      evidenceSource: "web_process_self_attestation",
    } });
  });

  it("exposes RSS, external memory, and ArrayBuffer memory", () => {
    expect(getRuntimeMemoryMetrics({
      rss: 100,
      heapTotal: 200,
      heapUsed: 150,
      external: 75,
      arrayBuffers: 25,
    })).toEqual({
      rssBytes: 100,
      heapTotalBytes: 200,
      heapUsedBytes: 150,
      externalBytes: 75,
      arrayBuffersBytes: 25,
    });
  });

  it("parses cgroup memory events and handles max limits", () => {
    expect(parseCgroupEvents("low 2\nhigh 7\noom 0\n")).toEqual({
      low: 2,
      high: 7,
      oom: 0,
    });
    expect(readCgroupMemoryMetrics("/path/that/does/not/exist")).toEqual({
      root: "/path/that/does/not/exist",
      currentBytes: null,
      highBytes: null,
      maxBytes: null,
      events: {},
    });
  });

  it("returns null event-loop values until the histogram has samples", () => {
    expect(getEventLoopMetrics()).toEqual({
      meanMs: null,
      p95Ms: null,
      maxMs: null,
      minMs: null,
    });
  });
});
