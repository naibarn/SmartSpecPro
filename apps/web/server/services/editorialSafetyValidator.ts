import type { EditorialIntentOperation } from "@smartspec/shared";

export function validateEditorialSafety(
  operations: EditorialIntentOperation[],
  options: { protectedRanges: Array<{ startTick: number; endTick: number }> }
): void {
  for (const operation of operations) {
    for (const protectedRange of options.protectedRanges) {
      if (
        operation.startTick < protectedRange.endTick &&
        operation.endTick > protectedRange.startTick
      )
        throw new Error("PROTECTED_RANGE_CONFLICT");
    }
    if (
      (operation.type === "reframe" || operation.type === "camera") &&
      operation.payload
    ) {
      const scale = operation.payload.scale ?? operation.payload.zoom;
      if (
        scale !== undefined &&
        (typeof scale !== "number" || scale < 0.5 || scale > 3)
      )
        throw new Error("GEOMETRY_UNSAFE");
    }
  }
}
