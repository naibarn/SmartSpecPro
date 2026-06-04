import { describe, expect, it } from "vitest";

import {
  HYPERFRAMES_BLOCKER_COPY,
  HYPERFRAMES_STATUS_COPY,
  assertHyperframesCopyCoverage,
  getHyperframesBlockerCopy,
  getHyperframesStatusCopy,
} from "../statusCopy";
import {
  hyperframesBlockerCodes,
  hyperframesRenderStatuses,
} from "../contracts";

describe("HyperFrames status copy", () => {
  it("covers every status and blocker in Thai and English", () => {
    expect(() => assertHyperframesCopyCoverage()).not.toThrow();
    for (const status of hyperframesRenderStatuses) {
      expect(HYPERFRAMES_STATUS_COPY[status].label.en).toBeTruthy();
      expect(HYPERFRAMES_STATUS_COPY[status].label.th).toBeTruthy();
    }
    for (const code of hyperframesBlockerCodes) {
      expect(HYPERFRAMES_BLOCKER_COPY[code].description.en).toBeTruthy();
      expect(HYPERFRAMES_BLOCKER_COPY[code].description.th).toBeTruthy();
    }
  });

  it("returns localized copy with stable copy IDs", () => {
    expect(getHyperframesStatusCopy("queued", "th")).toMatchObject({
      copyId: "hyperframes.status.queued",
      label: "เข้าคิวแล้ว",
    });
    expect(getHyperframesBlockerCopy("worker_disabled", "en")).toMatchObject({
      copyId: "hyperframes.blocker.worker_disabled",
      label: "Worker unavailable",
    });
  });
});
