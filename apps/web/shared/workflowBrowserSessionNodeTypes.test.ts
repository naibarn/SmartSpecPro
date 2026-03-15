import { describe, expect, it } from "vitest";

import {
  WORKFLOW_BROWSER_SESSION_NODE_TYPES,
  filterWorkflowNodeTypeSpecs,
  isWorkflowBrowserSessionNodeType,
  workflowContainsBrowserSessionNodes,
} from "./workflowBrowserSessionNodeTypes";

describe("workflowBrowserSessionNodeTypes", () => {
  it("identifies browser session node types", () => {
    expect(isWorkflowBrowserSessionNodeType("browser_session_start")).toBe(true);
    expect(isWorkflowBrowserSessionNodeType("llm_call")).toBe(false);
    expect(isWorkflowBrowserSessionNodeType(null)).toBe(false);
  });

  it("filters browser session node specs when disabled", () => {
    const nodeTypes = [
      { type: "llm_call" },
      { type: WORKFLOW_BROWSER_SESSION_NODE_TYPES[0] },
    ];

    expect(filterWorkflowNodeTypeSpecs(nodeTypes, false)).toEqual([{ type: "llm_call" }]);
    expect(filterWorkflowNodeTypeSpecs(nodeTypes, true)).toEqual(nodeTypes);
  });

  it("detects browser session workflow nodes from saved graphs", () => {
    expect(
      workflowContainsBrowserSessionNodes([
        { type: "workflow", data: { nodeType: "browser_session_wait_for_user" } },
      ]),
    ).toBe(true);
    expect(
      workflowContainsBrowserSessionNodes([
        { type: "workflow", data: { nodeType: "llm_call" } },
        { type: "group" },
      ]),
    ).toBe(false);
  });
});
