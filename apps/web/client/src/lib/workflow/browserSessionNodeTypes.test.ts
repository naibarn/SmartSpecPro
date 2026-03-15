import { describe, expect, it } from "vitest";

import { filterWorkflowNodeTypes } from "./browserSessionNodeTypes";

describe("filterWorkflowNodeTypes", () => {
  const nodeTypes = [
    {
      type: "llm_call",
      display_name: "LLM Call",
      description: "",
      icon: "brain",
      color: "blue",
      category: "ai" as const,
      inputs: [],
      outputs: [],
      executor: "app.test.LLMExecutor",
    },
    {
      type: "browser_session_start",
      display_name: "Browser Session Start",
      description: "",
      icon: "monitor-play",
      color: "cyan",
      category: "integrations" as const,
      inputs: [],
      outputs: [],
      executor: "app.test.BrowserSessionExecutor",
    },
  ];

  it("hides browser-session workflow nodes when the rollout flag is disabled", () => {
    expect(
      filterWorkflowNodeTypes(nodeTypes, { workflowBrowserSessionNodes: false }).map((node) => node.type),
    ).toEqual(["llm_call"]);
  });

  it("keeps browser-session workflow nodes visible when the rollout flag is enabled", () => {
    expect(
      filterWorkflowNodeTypes(nodeTypes, { workflowBrowserSessionNodes: true }).map((node) => node.type),
    ).toEqual(["llm_call", "browser_session_start"]);
  });
});
