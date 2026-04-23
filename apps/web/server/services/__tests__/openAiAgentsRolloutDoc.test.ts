import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Feature 101 rollout doc", () => {
  it("exists and documents upgrade and rollback guidance", () => {
    const docPath = path.resolve(
      process.cwd(),
      "../../specs/feature/101-openai-agents-sdk-chat-team-orchestration/rollout.md",
    );
    const content = fs.readFileSync(docPath, "utf8");

    expect(content).toContain("SDK Upgrade Gate");
    expect(content).toContain("Rollback Validation");
    expect(content).toContain("Operator Recovery Playbook");
    expect(content).toContain("Implementation And Manifest Ownership Matrix");
    expect(content).toContain("python-backend/requirements.txt");
    expect(content).toContain("openai-agents==0.14.2");
    expect(content).toContain("current/current-1");
    expect(content).toContain("Media Studio");
    expect(content).toContain("uv run pytest");
    expect(content).toContain("npm --prefix apps/web test --");
    expect(content).toContain("chatOpenAiAgentsReplay.test.ts");
    expect(content).toContain("teamOpenAiAgentsReplay.test.ts");
    expect(content).toContain("responsesOpenAiAgentsReplay.test.ts");
  });
});
