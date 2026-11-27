import { describe, expect, it } from "vitest";

import { selectShotCharacterReferenceItems } from "../shotCast";

describe("five-person staged image references", () => {
  it("passes all five selected character portraits to the shot", () => {
    const characterItems = ["host", "guest", "child", "support-2", "support-3"].map(
      name => ({ name, url: `https://cdn.test/${name}.png` })
    );

    const selected = selectShotCharacterReferenceItems({
      characterItems,
      castInShot: ["cast-1", "cast-2", "cast-3", "cast-4", "cast-5"],
    });

    expect(selected.map(item => item.name)).toEqual([
      "host",
      "guest",
      "child",
      "support-2",
      "support-3",
    ]);
  });
});
