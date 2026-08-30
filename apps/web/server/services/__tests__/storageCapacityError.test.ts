import { describe, expect, it } from "vitest";
import {
  inspectStorageCapacity,
  normalizeStorageCapacityError,
} from "../storageCapacityError";

describe("server storage capacity diagnostics", () => {
  it("reports bytes/inodes and the mount supplied by the filesystem probe", () => {
    const details = inspectStorageCapacity("/tmp/render/output.mp4", {
      statFs: () => ({ bavail: 0, bsize: 4096, ffree: 42 }),
      mountPoint: () => "/render-disk",
    });
    expect(details).toEqual({
      availableBytes: 0,
      availableInodes: 42,
      capacityKind: "bytes",
      mountPoint: "/render-disk",
    });
  });

  it("normalizes only capacity errors", () => {
    expect(
      normalizeStorageCapacityError(
        new Error("ENOSPC: no space left on device, write"),
        "/tmp/render/output.mp4",
      ),
    ).toContain("storage_capacity_exhausted");
    expect(normalizeStorageCapacityError(new Error("invalid video"), "/tmp")).toBeNull();
  });
});
