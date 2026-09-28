import { describe, expect, it } from "vitest";
import { sortLocationCandidatesForGallery } from "../VerticalDramaLocationStockPanel";

/**
 * Unit coverage for `sortLocationCandidatesForGallery` — the candidate-
 * gallery reorder rule: the current primary (however it was resolved —
 * explicit pick or newest-approved fallback) always renders first, since it
 * is not always the newest entry in the array the backend returns.
 */
describe("sortLocationCandidatesForGallery", () => {
  it("floats the primary candidate to the front, even when it is NOT first in the input order", () => {
    const older = { assetLinkId: "801", isPrimary: true };
    const newer = { assetLinkId: "802", isPrimary: false };
    expect(sortLocationCandidatesForGallery([newer, older])).toEqual([older, newer]);
  });

  it("preserves the relative order of non-primary candidates", () => {
    const a = { assetLinkId: "801", isPrimary: false };
    const b = { assetLinkId: "802", isPrimary: false };
    const c = { assetLinkId: "803", isPrimary: false };
    expect(sortLocationCandidatesForGallery([a, b, c])).toEqual([a, b, c]);
  });

  it("is a no-op ordering-wise when the primary is already first", () => {
    const primary = { assetLinkId: "801", isPrimary: true };
    const rest = { assetLinkId: "802", isPrimary: false };
    expect(sortLocationCandidatesForGallery([primary, rest])).toEqual([primary, rest]);
  });

  it("returns an empty array unchanged", () => {
    expect(sortLocationCandidatesForGallery([])).toEqual([]);
  });

  it("returns everything unmarked-primary, in its original order, when nothing is primary yet", () => {
    const a = { assetLinkId: "801", isPrimary: false };
    const b = { assetLinkId: "802", isPrimary: false };
    expect(sortLocationCandidatesForGallery([b, a])).toEqual([b, a]);
  });
});
