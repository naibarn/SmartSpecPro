import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { parseSkillFile } from "@smartspec/skills";

describe("vertical-drama-prompt-expansion skill bundle", () => {
  it("is a versioned llm-only skill with a real output contract", () => {
    const skillDir = path.resolve(process.cwd(), "skills/vertical-drama-prompt-expansion");
    const skillMd = fs.readFileSync(path.join(skillDir, "skill.md"), "utf8");
    const { metadata, content } = parseSkillFile(skillMd);
    const manifest = JSON.parse(fs.readFileSync(path.join(skillDir, "skill.json"), "utf8")) as Record<string, unknown>;
    const inputSchema = JSON.parse(fs.readFileSync(path.join(skillDir, "input.schema.json"), "utf8")) as Record<string, any>;
    const outputSchema = JSON.parse(fs.readFileSync(path.join(skillDir, "output.schema.json"), "utf8")) as Record<string, unknown>;

    expect(manifest.smartspec_slug).toBe("vertical-drama-prompt-expansion");
    expect(manifest.version).toBe("2.0.0");
    expect(metadata.name).toBe(manifest.display_name);
    expect(metadata.execution_mode).toBe("llm-only");
    expect(content).toContain("Return JSON matching `output.schema.json` exactly");
    expect(inputSchema.properties?.userPremise?.maxLength).toBe(5000);
    expect(content).toContain("not replace the Draft with scenes");
    expect(outputSchema.required).toEqual(expect.arrayContaining(["brief", "expandedPrompt", "slots"]));
  });
});
