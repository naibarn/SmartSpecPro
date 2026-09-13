import { describe, expect, it } from "vitest";
import { canonicalizeStoryboardLocationGroups } from "../locationGrouping";

describe("canonicalizeStoryboardLocationGroups", () => {
  it("folds camera-distance wording into one physical location", () => {
    const result = canonicalizeStoryboardLocationGroups([
      {
        locationKey: "clinic-front",
        locationName: "หน้าคลินิก",
        description: "ทางเข้าคลินิกพร้อมป้ายชื่อ",
        shotNumbers: [8],
      },
      {
        locationKey: "clinic-parking",
        locationName: "ลานจอดรถหน้าคลินิก",
        description: "ลานจอดรถมองเห็นอาคารคลินิก",
        shotNumbers: [9],
      },
    ]);

    expect(result).toEqual([
      {
        locationKey: "clinic-front",
        locationName: "หน้าคลินิก",
        description: "ทางเข้าคลินิกพร้อมป้ายชื่อ ลานจอดรถมองเห็นอาคารคลินิก",
        shotNumbers: [8, 9],
      },
    ]);
  });

  it("does not merge two different existing roster keys with the same anchor", () => {
    const result = canonicalizeStoryboardLocationGroups(
      [
        {
          locationKey: "clinic-a",
          locationName: "หน้าคลินิก",
          description: "branch A",
          shotNumbers: [1],
        },
        {
          locationKey: "clinic-b",
          locationName: "ลานจอดรถหน้าคลินิก",
          description: "branch B",
          shotNumbers: [2],
        },
      ],
      { knownLocationKeys: new Set(["clinic-a", "clinic-b"]) }
    );

    expect(result.map(group => group.locationKey)).toEqual([
      "clinic-a",
      "clinic-b",
    ]);
  });

  it("promotes a known roster key when it arrives after a newly-authored view label", () => {
    const result = canonicalizeStoryboardLocationGroups(
      [
        {
          locationKey: "generated-clinic-front",
          locationName: "หน้าคลินิก",
          description: "front view",
          shotNumbers: [8],
        },
        {
          locationKey: "clinic-exterior",
          locationName: "ลานจอดรถหน้าคลินิก",
          description: "wide view",
          shotNumbers: [9],
        },
      ],
      { knownLocationKeys: new Set(["clinic-exterior"]) }
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.locationKey).toBe("clinic-exterior");
  });

  it("keeps genuinely different locations separate", () => {
    const result = canonicalizeStoryboardLocationGroups([
      {
        locationKey: "clinic",
        locationName: "หน้าคลินิก",
        description: "clinic entrance",
        shotNumbers: [1],
      },
      {
        locationKey: "clinic-room",
        locationName: "ห้องตรวจคลินิก",
        description: "exam room",
        shotNumbers: [2],
      },
    ]);

    expect(result).toHaveLength(2);
  });

  it("does not merge a generic front-of-room label with the room itself", () => {
    const result = canonicalizeStoryboardLocationGroups([
      {
        locationKey: "exam-room-front",
        locationName: "หน้าห้องตรวจ",
        description: "ทางเดินหน้าห้องตรวจ",
        shotNumbers: [1],
      },
      {
        locationKey: "exam-room",
        locationName: "ห้องตรวจ",
        description: "ภายในห้องตรวจ",
        shotNumbers: [2],
      },
    ]);

    expect(result).toHaveLength(2);
  });

  it("folds repeated groups that already carry the same stable key", () => {
    const result = canonicalizeStoryboardLocationGroups([
      {
        locationKey: "store",
        locationName: "ร้านสะดวกซื้อ",
        description: "aisle",
        shotNumbers: [1, 2],
      },
      {
        locationKey: "store",
        locationName: "ร้านสะดวกซื้อด้านหลัง",
        description: "back aisle",
        shotNumbers: [3],
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.shotNumbers).toEqual([1, 2, 3]);
  });
});
