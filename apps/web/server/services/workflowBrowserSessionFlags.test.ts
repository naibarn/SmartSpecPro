import { describe, expect, it } from "vitest";

import {
  assertWorkflowBrowserSessionNodesAllowed,
  filterWorkflowNodeRegistryForFlags,
} from "./workflowBrowserSessionFlags";

describe("workflowBrowserSessionFlags", () => {
  it("rejects workflow graphs with browser session nodes when the flag is disabled", () => {
    expect(() =>
      assertWorkflowBrowserSessionNodesAllowed(
        { workflowBrowserSessionNodes: false },
        [{ type: "workflow", data: { nodeType: "browser_session_start" } }],
      ),
    ).toThrowError(/disabled for this tenant/i);
  });

  it("allows legacy workflow graphs when the flag is disabled", () => {
    expect(() =>
      assertWorkflowBrowserSessionNodesAllowed(
        { workflowBrowserSessionNodes: false },
        [{ type: "workflow", data: { nodeType: "web_automation" } }],
      ),
    ).not.toThrow();
  });

  it("filters workflow browser session registry nodes when the flag is disabled", () => {
    const nodeTypes = [
      { type: "llm_call" },
      { type: "browser_session_instruction" },
    ];

    expect(
      filterWorkflowNodeRegistryForFlags(nodeTypes, { workflowBrowserSessionNodes: false }),
    ).toEqual([{ type: "llm_call" }]);
    expect(
      filterWorkflowNodeRegistryForFlags(nodeTypes, { workflowBrowserSessionNodes: true }),
    ).toEqual(nodeTypes);
  });
});
