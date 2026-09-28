import { describe, expect, it } from "vitest";
import {
  normalizeClipIdentityQcAnalysis,
  resolveClipIdentityQcStatus,
} from "../clipIdentityQc";

describe("clip identity QC contract", () => {
  it("normalizes snake_case output and preserves required roster order", () => {
    const result = normalizeClipIdentityQcAnalysis(
      {
        characters: [
          { character_key: "b", verdict: "minor_drift", drift_kind: "hair", worst_frame_index: 2 },
          { character_key: "unknown", verdict: "consistent" },
        ],
      },
      [{ characterKey: "a", name: "A" }, { characterKey: "b", name: "B" }],
    );
    expect(result.characters[0]).toMatchObject({
      characterKey: "a",
      verdict: "identity_break",
    });
    expect(result.characters[1]).toMatchObject({
      characterKey: "b",
      verdict: "minor_drift",
      driftKind: "hair",
      worstFrameIndex: 2,
    });
    expect(resolveClipIdentityQcStatus(result)).toBe("fail");
  });

  it("fails closed on an identity break but does not block the render path", () => {
    expect(resolveClipIdentityQcStatus({
      characters: [{ characterKey: "a", verdict: "identity_break" }],
    })).toBe("fail");
    expect(resolveClipIdentityQcStatus({
      characters: [{ characterKey: "a", verdict: "minor_drift" }],
    })).toBe("warn");
    expect(resolveClipIdentityQcStatus({ characters: [] })).toBe("pass");
  });

  it("matches a model row by normalized name when the key is omitted", () => {
    const result = normalizeClipIdentityQcAnalysis(
      { characters: [{ name: "  Alice ", verdict: "consistent" }] },
      [{ characterKey: "char-a", name: "Alice" }],
    );
    expect(result.characters).toHaveLength(1);
    expect(result.characters[0]).toMatchObject({ name: "Alice", verdict: "consistent" });
  });
});
