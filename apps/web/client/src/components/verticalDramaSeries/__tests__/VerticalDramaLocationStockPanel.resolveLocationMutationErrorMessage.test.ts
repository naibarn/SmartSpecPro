import { describe, expect, it } from "vitest";
import { resolveLocationMutationErrorMessage } from "@/components/verticalDramaSeries/VerticalDramaLocationStockPanel";

/**
 * Unit coverage for `resolveLocationMutationErrorMessage` — the shared
 * error-message resolver used by every mutation `onError` in
 * `VerticalDramaLocationStockPanel.tsx`. Same shape/convention as
 * `VerticalDramaCharacterStockPanel.tsx`'s own
 * `resolveVdCharacterMutationErrorMessage` (uses `??`, not `||`, so an
 * explicit empty-string server message passes through unmodified rather
 * than being treated as "no message").
 */
describe("resolveLocationMutationErrorMessage", () => {
  it("returns the error's own message when present", () => {
    expect(resolveLocationMutationErrorMessage({ message: "Location not found" }, "en")).toBe(
      "Location not found",
    );
    expect(resolveLocationMutationErrorMessage({ message: "ไม่พบสถานที่" }, "th")).toBe("ไม่พบสถานที่");
  });

  it("falls back to a localized generic message when `message` is undefined", () => {
    expect(resolveLocationMutationErrorMessage({}, "en")).toBe("Something went wrong");
    expect(resolveLocationMutationErrorMessage({}, "th")).toBe("เกิดข้อผิดพลาด");
  });

  it("falls back to a localized generic message for null/undefined error objects", () => {
    expect(resolveLocationMutationErrorMessage(null, "en")).toBe("Something went wrong");
    expect(resolveLocationMutationErrorMessage(undefined, "th")).toBe("เกิดข้อผิดพลาด");
  });

  it("passes an explicit empty-string message through unmodified (?? not ||)", () => {
    expect(resolveLocationMutationErrorMessage({ message: "" }, "en")).toBe("");
  });
});
