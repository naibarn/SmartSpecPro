/**
 * Coverage for `verticalDramaStoryBible.ts`'s `extractJson` — the shared JSON
 * extraction helper used by every vertical-drama LLM planning call via
 * `executeJsonPlanningCallWithRetry`.
 *
 * Root cause this exists to fix (2026-07-06 evidence, series 4 episode 11
 * script generation): both attempts failed with
 * `LLM response was not valid JSON: Unexpected non-whitespace character
 * after JSON at position 4664 (line 1 column 4665)` — the LLM produced a
 * COMPLETE, valid, compact JSON object (`finishReason: "stop"` on both
 * attempts, well within the token ceiling) followed by trailing content
 * (commentary / a second JSON object / stray tokens). The previous
 * "first `{` to last `}`" heuristic swallowed the whole string — including
 * the trailing junk — into a single `JSON.parse` call, which fails the
 * instant there is ANY non-whitespace character after the legitimate
 * closing `}`. `extractJson` now scans for the first *balanced* JSON value
 * (string-aware, so braces/brackets inside string values don't confuse the
 * counter) and parses only that slice, ignoring anything after it.
 */
import { describe, it, expect } from "vitest";
import { extractJson, VdSchemaValidationError } from "../verticalDramaStoryBible";

describe("extractJson", () => {
  it("parses plain JSON with no surrounding content", () => {
    const result = extractJson('{"a":1,"b":"two"}');
    expect(result).toEqual({ a: 1, b: "two" });
  });

  it("parses JSON wrapped in a markdown code fence", () => {
    const result = extractJson('```json\n{"a":1,"b":"two"}\n```');
    expect(result).toEqual({ a: 1, b: "two" });
  });

  it("parses JSON followed by trailing prose commentary (the reported live failure)", () => {
    const json = '{"episode_title":"Test","hook":"A hook"}';
    const text = `${json}\n\nHope this helps! Let me know if you would like changes.`;
    const result = extractJson(text);
    expect(result).toEqual({ episode_title: "Test", hook: "A hook" });
  });

  it("parses the FIRST JSON object when the model duplicates a second JSON object after it", () => {
    const first = '{"episode_title":"First","hook":"one"}';
    const second = '{"episode_title":"Second","hook":"two"}';
    const result = extractJson(`${first}\n${second}`);
    expect(result).toEqual({ episode_title: "First", hook: "one" });
  });

  it("correctly balances braces/brackets that appear INSIDE string values", () => {
    const json = '{"dialogue":"she said \\"use {curly} and [square] chars\\" then left","ok":true}';
    const trailing = "some trailing note after the object";
    const result = extractJson(`${json} ${trailing}`);
    expect(result).toEqual({
      dialogue: 'she said "use {curly} and [square] chars" then left',
      ok: true,
    });
  });

  it("handles escaped backslashes immediately before a quote without breaking string-state tracking", () => {
    // The string value ends in a literal backslash (`\\`) followed by the
    // closing quote — a naive escape-tracker could misinterpret this as an
    // escaped quote and keep scanning inside the "string" indefinitely.
    const json = '{"path":"C\\\\","trailing":"after"}';
    const result = extractJson(`${json}\nEXTRA JUNK { not real json`);
    expect(result).toEqual({ path: "C\\", trailing: "after" });
  });

  it("parses a top-level JSON array followed by trailing junk", () => {
    const json = '["a","b",{"nested":"[{}]"}]';
    const result = extractJson(`${json} trailing text here`);
    expect(result).toEqual(["a", "b", { nested: "[{}]" }]);
  });

  it("still throws VdSchemaValidationError for genuinely truncated/unterminated JSON", () => {
    const truncated = '{"items":["a","b"';
    expect(() => extractJson(truncated)).toThrow(VdSchemaValidationError);
  });

  it("still throws VdSchemaValidationError for text with no JSON at all", () => {
    expect(() => extractJson("just plain text, no JSON here")).toThrow(
      VdSchemaValidationError,
    );
  });

  it("includes the original raw response on the thrown error for debugging", () => {
    const truncated = '{"items":["a","b"';
    try {
      extractJson(truncated);
      expect.fail("expected extractJson to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(VdSchemaValidationError);
      expect((error as VdSchemaValidationError).issues).toEqual({ rawResponse: truncated });
    }
  });
});
