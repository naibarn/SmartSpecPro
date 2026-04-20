import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  scanForForbiddenOpenAiAgentsImports,
} from "../agentRuntime/importBoundary";
import {
  getOpenAiAgentsRuntimeFlagSnapshot,
  selectAgentRuntime,
} from "../agentRuntime/runtimeSelection";

const tempDirs: string[] = [];

function makeFlags(
  overrides: Partial<ReturnType<typeof getOpenAiAgentsRuntimeFlagSnapshot>> = {}
) {
  return getOpenAiAgentsRuntimeFlagSnapshot(overrides);
}

describe("selectAgentRuntime", () => {
  it("force rollback returns legacy for new Chat selection", () => {
    const result = selectAgentRuntime({
      surface: "chat",
      featureFlags: makeFlags({
        openAiAgentsRuntimeEnabled: true,
        openAiAgentsRuntimeChatActive: true,
        openAiAgentsRuntimeForceRollback: true,
      }),
    });

    expect(result.engine).toBe("legacy");
    expect(result.mode).toBe("legacy");
    expect(result.rollbackReason).toBe("force_rollback_flag");
  });

  it("force rollback returns legacy for new Team selection", () => {
    const result = selectAgentRuntime({
      surface: "team",
      featureFlags: makeFlags({
        openAiAgentsRuntimeEnabled: true,
        openAiAgentsRuntimeTeamActive: true,
        openAiAgentsRuntimeForceRollback: true,
      }),
    });

    expect(result.engine).toBe("legacy");
    expect(result.mode).toBe("legacy");
  });

  it("force rollback returns legacy for new Responses selection", () => {
    const result = selectAgentRuntime({
      surface: "responses",
      featureFlags: makeFlags({
        openAiAgentsRuntimeEnabled: true,
        openAiAgentsRuntimeResponsesActive: true,
        openAiAgentsRuntimeForceRollback: true,
      }),
    });

    expect(result.engine).toBe("legacy");
    expect(result.mode).toBe("legacy");
  });

  it("force rollback returns legacy for new shared skill selection", () => {
    const result = selectAgentRuntime({
      surface: "skill",
      originSurface: "media_studio",
      entryPoint: "enhance_prompt",
      featureFlags: makeFlags({
        openAiAgentsRuntimeEnabled: true,
        openAiAgentsRuntimeSkillActive: true,
        openAiAgentsRuntimeForceRollback: true,
      }),
    });

    expect(result.engine).toBe("legacy");
    expect(result.mode).toBe("legacy");
  });

  it("frozen legacy Team run remains legacy after active flags are enabled", () => {
    const result = selectAgentRuntime({
      surface: "team",
      frozenDecision: {
        engine: "legacy",
        mode: "legacy",
        selectionReason: "existing_frozen_decision",
        flagSnapshot: makeFlags(),
        frozenAtRecommendation: "run",
        rollbackReason: null,
      },
      featureFlags: makeFlags({
        openAiAgentsRuntimeEnabled: true,
        openAiAgentsRuntimeTeamActive: true,
      }),
    });

    expect(result.engine).toBe("legacy");
    expect(result.mode).toBe("legacy");
    expect(result.frozenAtRecommendation).toBe("already_frozen");
  });

  it("frozen SDK Team run remains SDK after rollback is toggled", () => {
    const result = selectAgentRuntime({
      surface: "team",
      frozenDecision: {
        engine: "openai_agents",
        mode: "active",
        selectionReason: "existing_frozen_decision",
        flagSnapshot: makeFlags({
          openAiAgentsRuntimeEnabled: true,
          openAiAgentsRuntimeTeamActive: true,
        }),
        frozenAtRecommendation: "run",
        rollbackReason: null,
      },
      featureFlags: makeFlags({
        openAiAgentsRuntimeEnabled: true,
        openAiAgentsRuntimeTeamActive: true,
        openAiAgentsRuntimeForceRollback: true,
      }),
    });

    expect(result.engine).toBe("openai_agents");
    expect(result.mode).toBe("active");
    expect(result.frozenAtRecommendation).toBe("already_frozen");
  });

  it("Chat shadow selects openai_agents shadow only when master flag is true", () => {
    const withoutMaster = selectAgentRuntime({
      surface: "chat",
      featureFlags: makeFlags({
        openAiAgentsRuntimeEnabled: false,
        openAiAgentsRuntimeChatShadow: true,
      }),
    });
    const withMaster = selectAgentRuntime({
      surface: "chat",
      featureFlags: makeFlags({
        openAiAgentsRuntimeEnabled: true,
        openAiAgentsRuntimeChatShadow: true,
      }),
    });

    expect(withoutMaster.mode).toBe("legacy");
    expect(withMaster.mode).toBe("shadow");
    expect(withMaster.engine).toBe("openai_agents");
  });

  it("Team active selects openai_agents active only when master flag is true", () => {
    const withoutMaster = selectAgentRuntime({
      surface: "team",
      featureFlags: makeFlags({
        openAiAgentsRuntimeEnabled: false,
        openAiAgentsRuntimeTeamActive: true,
      }),
    });
    const withMaster = selectAgentRuntime({
      surface: "team",
      featureFlags: makeFlags({
        openAiAgentsRuntimeEnabled: true,
        openAiAgentsRuntimeTeamActive: true,
      }),
    });

    expect(withoutMaster.mode).toBe("legacy");
    expect(withMaster.mode).toBe("active");
    expect(withMaster.engine).toBe("openai_agents");
  });

  it("Responses shadow selects openai_agents shadow only when master flag is true", () => {
    const withoutMaster = selectAgentRuntime({
      surface: "responses",
      featureFlags: makeFlags({
        openAiAgentsRuntimeEnabled: false,
        openAiAgentsRuntimeResponsesShadow: true,
      }),
    });
    const withMaster = selectAgentRuntime({
      surface: "responses",
      featureFlags: makeFlags({
        openAiAgentsRuntimeEnabled: true,
        openAiAgentsRuntimeResponsesShadow: true,
      }),
    });

    expect(withoutMaster.mode).toBe("legacy");
    expect(withMaster.mode).toBe("shadow");
  });

  it("shared skill active selects openai_agents active only when master flag is true", () => {
    const withoutMaster = selectAgentRuntime({
      surface: "skill",
      originSurface: "media_studio",
      entryPoint: "execute_custom_skill",
      featureFlags: makeFlags({
        openAiAgentsRuntimeEnabled: false,
        openAiAgentsRuntimeSkillActive: true,
      }),
    });
    const withMaster = selectAgentRuntime({
      surface: "skill",
      originSurface: "media_studio",
      entryPoint: "execute_custom_skill",
      featureFlags: makeFlags({
        openAiAgentsRuntimeEnabled: true,
        openAiAgentsRuntimeSkillActive: true,
      }),
    });

    expect(withoutMaster.mode).toBe("legacy");
    expect(withMaster.mode).toBe("active");
  });
});

describe("scanForForbiddenOpenAiAgentsImports", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("flags forbidden OpenAI Agents SDK imports in Node/TypeScript files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-runtime-imports-"));
    tempDirs.push(dir);
    const tsFile = path.join(dir, "bad.ts");
    fs.writeFileSync(tsFile, 'import { Agent } from "openai-agents";\n');

    const findings = scanForForbiddenOpenAiAgentsImports([dir]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      filePath: tsFile,
      lineNumber: 1,
      specifier: "openai-agents",
    });
  });

  it("ignores markdown/spec files and only scans source files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-runtime-imports-"));
    tempDirs.push(dir);
    fs.writeFileSync(path.join(dir, "spec.md"), 'import { Agent } from "openai-agents";\n');
    fs.writeFileSync(path.join(dir, "safe.ts"), "export const value = 1;\n");

    const findings = scanForForbiddenOpenAiAgentsImports([dir]);

    expect(findings).toEqual([]);
  });
});
