import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildSkillContractSnapshot,
  compareSkillContractSnapshots,
} from "../skillCompatibilityGate";

describe("skillCompatibilityGate", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function createSkillDir(structure: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-compat-test-"));
    tempDirs.push(dir);

    for (const [relativePath, content] of Object.entries(structure)) {
      const absolutePath = path.join(dir, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, content, "utf-8");
    }

    return dir;
  }

  it("captures input and output schema hashes in the snapshot", () => {
    const skillDir = createSkillDir({
      "SKILL.md": "---\nname: Demo\ncategory: article_generation\n---\n# Demo\n",
      "schemas/input.schema.json": JSON.stringify({
        type: "object",
        required: ["topic"],
        properties: { topic: { type: "string" } },
      }),
      "schemas/output.schema.json": JSON.stringify({
        type: "object",
        required: ["article"],
        properties: { article: { type: "string" } },
      }),
      "tests/tests.json": JSON.stringify({ smoke: true }),
    });

    const snapshot = buildSkillContractSnapshot({
      slug: "demo-skill",
      folderPath: skillDir,
      executionMode: "llm-only",
    });

    expect(snapshot.inputSchemaHash).toBeTruthy();
    expect(snapshot.outputSchemaHash).toBeTruthy();
    expect(snapshot.testsHash).toBeTruthy();
    expect(snapshot.schemaSummary.input.requiredFields).toEqual(["topic"]);
    expect(snapshot.schemaSummary.output.requiredFields).toEqual(["article"]);
  });

  it("blocks removal of required input fields", () => {
    const baselineDir = createSkillDir({
      "SKILL.md": "---\nname: Demo\ncategory: article_generation\n---\n# Demo\n",
      "schemas/input.schema.json": JSON.stringify({
        type: "object",
        required: ["topic", "audience"],
        properties: {
          topic: { type: "string" },
          audience: { type: "string" },
        },
      }),
      "schemas/output.schema.json": JSON.stringify({
        type: "object",
        required: ["article"],
        properties: { article: { type: "string" } },
      }),
    });
    const candidateDir = createSkillDir({
      "SKILL.md": "---\nname: Demo\ncategory: article_generation\n---\n# Demo\n",
      "schemas/input.schema.json": JSON.stringify({
        type: "object",
        required: ["topic"],
        properties: {
          topic: { type: "string" },
          audience: { type: "string" },
        },
      }),
      "schemas/output.schema.json": JSON.stringify({
        type: "object",
        required: ["article"],
        properties: { article: { type: "string" } },
      }),
    });

    const report = compareSkillContractSnapshots(
      buildSkillContractSnapshot({ slug: "demo", folderPath: baselineDir, executionMode: "llm-only" }),
      buildSkillContractSnapshot({ slug: "demo", folderPath: candidateDir, executionMode: "llm-only" }),
    );

    expect(report.status).toBe("blocked");
    expect(report.issues.some((issue) => issue.kind === "input-required-field-removed")).toBe(true);
  });

  it("blocks removal of required output fields", () => {
    const baselineDir = createSkillDir({
      "SKILL.md": "---\nname: Demo\ncategory: article_generation\n---\n# Demo\n",
      "schemas/input.schema.json": JSON.stringify({
        type: "object",
        required: ["topic"],
        properties: { topic: { type: "string" } },
      }),
      "schemas/output.schema.json": JSON.stringify({
        type: "object",
        required: ["article", "summary"],
        properties: {
          article: { type: "string" },
          summary: { type: "string" },
        },
      }),
    });
    const candidateDir = createSkillDir({
      "SKILL.md": "---\nname: Demo\ncategory: article_generation\n---\n# Demo\n",
      "schemas/input.schema.json": JSON.stringify({
        type: "object",
        required: ["topic"],
        properties: { topic: { type: "string" } },
      }),
      "schemas/output.schema.json": JSON.stringify({
        type: "object",
        required: ["article"],
        properties: {
          article: { type: "string" },
          summary: { type: "string" },
        },
      }),
    });

    const report = compareSkillContractSnapshots(
      buildSkillContractSnapshot({ slug: "demo", folderPath: baselineDir, executionMode: "llm-only" }),
      buildSkillContractSnapshot({ slug: "demo", folderPath: candidateDir, executionMode: "llm-only" }),
    );

    expect(report.status).toBe("blocked");
    expect(report.issues.some((issue) => issue.kind === "output-required-field-removed")).toBe(true);
  });
});
