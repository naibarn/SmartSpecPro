import { describe, it, expect, vi } from "vitest";
import { parseArtifactBlocks } from "../artifactParser";

describe("artifactParser", () => {
  describe("parseArtifactBlocks", () => {
    it("parses single artifact:chart block from response text", () => {
      const text = `Here is a chart:

\`\`\`artifact:chart title="Sales Chart"
{"type":"bar","data":[{"label":"Q1","value":100}]}
\`\`\`

Let me know if you need changes.`;

      const result = parseArtifactBlocks(text);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("chart");
      expect(result[0].title).toBe("Sales Chart");
      expect(result[0].content).toContain('"type":"bar"');
    });

    it("parses multiple artifact blocks from single response", () => {
      const text = `Here are two artifacts:

\`\`\`artifact:code language="python" title="Script"
print("hello")
\`\`\`

And a table:

\`\`\`artifact:table title="Users"
[{"name":"Alice","age":30},{"name":"Bob","age":25}]
\`\`\``;

      const result = parseArtifactBlocks(text);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("code");
      expect(result[0].language).toBe("python");
      expect(result[0].title).toBe("Script");
      expect(result[1].type).toBe("table");
      expect(result[1].title).toBe("Users");
    });

    it("returns empty array for response with no artifact blocks", () => {
      const text = "Just a regular response with no artifacts at all.";
      const result = parseArtifactBlocks(text);
      expect(result).toEqual([]);
    });

    it("handles malformed artifact blocks gracefully", () => {
      const text = `Here is a broken block:

\`\`\`artifact:chart title="Broken"
{"data": [1,2,3]
`;
      // Unclosed block - should return empty or skip
      const result = parseArtifactBlocks(text);
      expect(result).toEqual([]);
    });

    it("extracts title from artifact metadata if present", () => {
      const text = `\`\`\`artifact:code title="My Script"
console.log("hi");
\`\`\``;

      const result = parseArtifactBlocks(text);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("My Script");
    });

    it("extracts language for code-type artifacts", () => {
      const text = `\`\`\`artifact:code language="python"
print("hello")
\`\`\``;

      const result = parseArtifactBlocks(text);
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe("python");
    });
  });
});
