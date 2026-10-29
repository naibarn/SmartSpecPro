import { describe, expect, it } from "vitest";
import {
  findVerticalDramaSpeakerVisualBinding,
  normalizeVerticalDramaSpeakerVisualBindings,
  renderVerticalDramaSpeakerVisualBindings,
} from "./speakerVisualBinding";

describe("shot-local speaker visual bindings", () => {
  it("normalizes shot-local entries and matches labels case and whitespace insensitively", () => {
    const bindings = normalizeVerticalDramaSpeakerVisualBindings([
      {
        id: "local-1",
        speakerLabel: " นักตรวจผนึก ",
        visualCue: "ชายชุดเข้มด้านขวา",
      },
      { id: "duplicate", speakerLabel: "นักตรวจผนึก", visualCue: "duplicate" },
      { speakerLabel: "ยาม", visualCue: "" },
    ]);

    expect(bindings).toHaveLength(1);
    expect(
      findVerticalDramaSpeakerVisualBinding(bindings, "  นักตรวจผนึก ")?.id
    ).toBe("local-1");
    expect(renderVerticalDramaSpeakerVisualBindings(bindings)).toContain(
      "animate only this person's mouth for that line"
    );
    expect(renderVerticalDramaSpeakerVisualBindings(bindings)).toContain(
      "Do not turn these speakers into off-screen voices"
    );
  });
});
