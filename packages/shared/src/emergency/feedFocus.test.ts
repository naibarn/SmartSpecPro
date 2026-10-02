import { describe, expect, it } from "vitest";
import {
  classifyViewportZoom,
  parseFeedFocusEnvelope,
  parseFeedFocusRequest,
  shouldRefreshFeedFocus,
  ViewportIntentStabilizer,
  viewportOverlapRatio,
  type FeedFocusRequest,
} from "./feedFocus";

const followMap: FeedFocusRequest = {
  version: 1,
  crs: "EPSG:4326",
  viewport: { west: 100.4, south: 13.6, east: 100.7, north: 13.9 },
  zoom: 11,
  mode: "FOLLOW_MAP",
};

describe("Spec 262 bounded adaptive feed focus", () => {
  it("accepts a finite WGS84 focus and rejects malformed, inverted, polar, oversized, and antimeridian bounds", () => {
    expect(parseFeedFocusRequest(followMap)).toEqual({ ...followMap, limit: 50 });
    expect(parseFeedFocusRequest({ ...followMap, crs: "EPSG:3857" })).toBeUndefined();
    expect(parseFeedFocusRequest({ ...followMap, viewport: { ...followMap.viewport, east: 100.4 } })).toBeUndefined();
    expect(parseFeedFocusRequest({ ...followMap, viewport: { ...followMap.viewport, north: 85.1 } })).toBeUndefined();
    expect(parseFeedFocusRequest({ ...followMap, viewport: { west: -30, south: -10, east: 30, north: 10 } })).toBeUndefined();
    expect(parseFeedFocusRequest({ ...followMap, viewport: { west: 170, south: 0, east: -170, north: 10 } })).toBeUndefined();
  });

  it("requires the matching canonical focus reference for area and route modes without treating it as authority", () => {
    expect(parseFeedFocusRequest({ ...followMap, mode: "SAVED_AREA" })).toBeUndefined();
    expect(parseFeedFocusRequest({ ...followMap, mode: "SAVED_AREA", focusRef: { kind: "route", id: "route:1", revision: 1 } })).toBeUndefined();
    expect(parseFeedFocusRequest({ ...followMap, mode: "SAVED_AREA", focusRef: { kind: "public-area", id: "area:1", revision: 1 } }))
      .toMatchObject({ mode: "SAVED_AREA", focusRef: { kind: "public-area" } });
    expect(parseFeedFocusRequest({ ...followMap, mode: "ROUTE_CORRIDOR", focusRef: { kind: "route", id: "route:1", revision: 1 } }))
      .toMatchObject({ mode: "ROUTE_CORRIDOR", focusRef: { kind: "route" } });
    expect(parseFeedFocusRequest({ ...followMap, focusRef: { kind: "public-area", id: "area:1", revision: 1 } })).toBeUndefined();
  });

  it("bounds page inputs and keeps cursors opaque, short, and non-capability-shaped", () => {
    expect(parseFeedFocusRequest({ ...followMap, limit: 1, cursor: "cursor_A-1.2~next" })).toMatchObject({ limit: 1, cursor: "cursor_A-1.2~next" });
    expect(parseFeedFocusRequest({ ...followMap, limit: 101 })).toBeUndefined();
    expect(parseFeedFocusRequest({ ...followMap, cursor: "bad cursor" })).toBeUndefined();
    expect(parseFeedFocusRequest({ ...followMap, cursor: "a".repeat(257) })).toBeUndefined();
    expect(parseFeedFocusRequest({ ...followMap, tenant: "another-tenant" })).toBeUndefined();
  });

  it("uses an injected, deterministic zoom policy and rejects gaps or overlapping thresholds", () => {
    const policy = [
      { zoomClass: "COUNTRY" as const, minimumZoom: 0, maximumZoom: 5 },
      { zoomClass: "REGION" as const, minimumZoom: 5, maximumZoom: 9 },
      { zoomClass: "DISTRICT" as const, minimumZoom: 9, maximumZoom: 14 },
      { zoomClass: "SITE" as const, minimumZoom: 14, maximumZoom: 22 },
    ];
    expect(classifyViewportZoom(5, policy)).toBe("REGION");
    expect(classifyViewportZoom(14, policy)).toBe("SITE");
    expect(classifyViewportZoom(5, [{ zoomClass: "COUNTRY", minimumZoom: 0, maximumZoom: 5 }, { zoomClass: "REGION", minimumZoom: 4, maximumZoom: 22 }])).toBeUndefined();
    expect(classifyViewportZoom(7, [{ zoomClass: "COUNTRY", minimumZoom: 0, maximumZoom: 5 }, { zoomClass: "REGION", minimumZoom: 6, maximumZoom: 22 }])).toBeUndefined();
  });

  it("suppresses tiny settled pans in the same zoom class and accepts a changed class or meaningful overlap loss", () => {
    const policy = [
      { zoomClass: "REGION" as const, minimumZoom: 0, maximumZoom: 12 },
      { zoomClass: "DISTRICT" as const, minimumZoom: 12, maximumZoom: 22 },
    ];
    const tinyPan = { ...followMap, viewport: { west: 100.41, south: 13.6, east: 100.71, north: 13.9 }, zoom: 11 };
    const farPan = { ...followMap, viewport: { west: 101.0, south: 13.6, east: 101.3, north: 13.9 }, zoom: 11 };
    expect(viewportOverlapRatio(followMap.viewport, tinyPan.viewport)).toBeGreaterThan(0.9);
    expect(shouldRefreshFeedFocus(tinyPan, followMap, { zoomPolicy: policy, minimumOverlapRatio: 0.8 })).toBe(false);
    expect(shouldRefreshFeedFocus({ ...followMap, zoom: 12 }, followMap, { zoomPolicy: policy, minimumOverlapRatio: 0.8 })).toBe(true);
    expect(shouldRefreshFeedFocus(farPan, followMap, { zoomPolicy: policy, minimumOverlapRatio: 0.8 })).toBe(true);
  });

  it("accepts only bounded authority-neutral impact references in a focus envelope", () => {
    expect(parseFeedFocusEnvelope({
      version: 1,
      request: followMap,
      source: "VIEWPORT",
      zoomClass: "DISTRICT",
      impactExtensions: [{ classification: "AFFECTS_VIEWPORT", relevance: "UPSTREAM_HYDRO", ref: { kind: "hazard-occurrence", id: "hazard:1", revision: 2 } }],
    })).toMatchObject({ source: "VIEWPORT", impactExtensions: [{ relevance: "UPSTREAM_HYDRO" }] });
    expect(parseFeedFocusEnvelope({
      version: 1,
      request: followMap,
      source: "VIEWPORT",
      zoomClass: "DISTRICT",
      impactExtensions: [{ classification: "IN_VIEWPORT", relevance: "UPSTREAM_HYDRO", ref: { kind: "hazard-occurrence", id: "hazard:1", revision: 2 } }],
    })).toBeUndefined();
  });

  it("keeps a locked accepted focus while map movement continues, then resumes follow after unlock", () => {
    const stabilizer = new ViewportIntentStabilizer({
      zoomPolicy: [{ zoomClass: "REGION", minimumZoom: 0, maximumZoom: 22 }],
      minimumOverlapRatio: 0.8,
    });
    expect(stabilizer.consider(followMap)).toEqual({ accepted: true, locked: false, focus: { ...followMap, limit: 50 } });
    expect(stabilizer.lock()).toBe(true);
    expect(stabilizer.consider({ ...followMap, viewport: { west: 101, south: 13.6, east: 101.3, north: 13.9 } })).toEqual({ accepted: false, locked: true });
    expect(stabilizer.unlock()).toBe(true);
    expect(stabilizer.consider({ ...followMap, viewport: { west: 101, south: 13.6, east: 101.3, north: 13.9 } })).toMatchObject({ accepted: true, locked: false });
  });
});
