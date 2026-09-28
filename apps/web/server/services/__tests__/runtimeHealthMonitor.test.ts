import { describe, expect, it } from "vitest";
import {
  getEventLoopMetrics,
  getRuntimeMemoryMetrics,
  parseCgroupEvents,
  readCgroupMemoryMetrics,
} from "../runtimeHealthMonitor";

describe("runtimeHealthMonitor", () => {
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
