import { describe, expect, it } from "vitest";
import {
  formatStorageCapacityErrorForUser,
  formatStorageCapacityErrorMessage,
  isStorageCapacityError,
  parseStorageCapacityErrorMessage,
} from "../storageCapacityError";

describe("storage capacity error contract", () => {
  it("recognizes native ENOSPC and quota failures", () => {
    expect(isStorageCapacityError(new Error("ENOSPC: no space left on device, write"))).toBe(true);
    expect(isStorageCapacityError("disk quota exceeded")).toBe(true);
    expect(isStorageCapacityError("ffmpeg exited with code 1")).toBe(false);
  });

  it("round-trips safe mount and capacity details", () => {
    const message = formatStorageCapacityErrorMessage({
      mountPoint: "/tmp",
      capacityKind: "bytes",
      availableBytes: 0,
      availableInodes: 100,
    });
    expect(message).toBe(
      "storage_capacity_exhausted [mount=/tmp; kind=bytes; availableBytes=0; availableInodes=100]",
    );
    expect(parseStorageCapacityErrorMessage(message)).toEqual({
      mountPoint: "/tmp",
      capacityKind: "bytes",
      availableBytes: 0,
      availableInodes: 100,
    });
  });

  it("produces clear bilingual copy and keeps the disk label", () => {
    const message = formatStorageCapacityErrorMessage({
      mountPoint: "/dev/sdb1",
      capacityKind: "bytes",
      availableBytes: 0,
    });
    expect(formatStorageCapacityErrorForUser(message, "th")).toContain("/dev/sdb1");
    expect(formatStorageCapacityErrorForUser(message, "th")).toContain("พื้นที่จัดเก็บ");
    expect(formatStorageCapacityErrorForUser(message, "en")).toContain("/dev/sdb1");
    expect(formatStorageCapacityErrorForUser("ordinary bug", "th")).toBeNull();
  });
});
