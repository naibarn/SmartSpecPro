import { describe, expect, it } from "vitest";
import { decodeSpec260EmergencyMessageCursor, encodeSpec260EmergencyMessageCursor } from "../spec260EmergencyMessageCursor";

describe("Spec 260 emergency message cursor", () => {
  it("round trips a stable timestamp and message id", () => {
    const cursor = { createdAt: new Date("2026-09-30T12:34:56.789Z"), id: "c9f2d8a2-9449-4a5e-b34e-49c3f39969ca" };
    expect(decodeSpec260EmergencyMessageCursor(encodeSpec260EmergencyMessageCursor(cursor))).toEqual(cursor);
  });

  it.each([undefined, "", "not-a-cursor", "%%%", "bm90LWEtdXVpZA==", "YQpi\nZGVm"])(
    "rejects malformed cursor %s",
    cursor => expect(decodeSpec260EmergencyMessageCursor(cursor)).toBeNull(),
  );
});
