import { describe, expect, it } from "vitest";
import { replacePendingMarketplaceSelection, toggleSpecialReference } from "../specialTieInReferences";

const ref = (id: string) => ({ mediaAssetId: id, source: "marketplace_capture" as const });
describe("special tie-in reference selection", () => {
  it("enforces aggregate three-reference cap", () => {
    const current = [ref("1"), ref("2"), ref("3")];
    expect(toggleSpecialReference(current, ref("4"))).toEqual({ value: current, rejected: true });
  });
  it("clears only pending images when switching product", () => {
    const result = replacePendingMarketplaceSelection([ref("confirmed")], [ref("pending-1"), ref("pending-2"), ref("pending-3")]);
    expect(result.confirmed.map(item => item.mediaAssetId)).toEqual(["confirmed"]);
    expect(result.pending.map(item => item.mediaAssetId)).toEqual(["pending-1", "pending-2"]);
  });
});
