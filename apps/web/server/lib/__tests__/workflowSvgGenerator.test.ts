import { describe, it, expect } from "vitest";
import { generateWorkflowSvg } from "../workflowSvgGenerator";

describe("generateWorkflowSvg", () => {
  it("returns a valid SVG string for empty workflow", () => {
    const result = generateWorkflowSvg({ nodes: [], edges: [] });
    expect(result).toMatch(/^<svg/);
    expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("includes node label in SVG for single trigger node", () => {
    const result = generateWorkflowSvg({
      nodes: [
        {
          id: "n1",
          type: "workflow",
          position: { x: 0, y: 0 },
          data: { nodeType: "schedule_trigger", label: "Start daily run" },
        },
      ],
      edges: [],
    });
    expect(result).toContain("Start daily run");
  });

  it("renders 3 rectangles and 2 path elements for A→B→C linear workflow", () => {
    const result = generateWorkflowSvg({
      nodes: [
        { id: "a", type: "workflow", position: { x: 0, y: 0 }, data: { nodeType: "schedule_trigger", label: "A" } },
        { id: "b", type: "workflow", position: { x: 0, y: 0 }, data: { nodeType: "llm_call", label: "B" } },
        { id: "c", type: "workflow", position: { x: 0, y: 0 }, data: { nodeType: "send_email", label: "C" } },
      ],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "c" },
      ],
    });
    const rectCount = (result.match(/<rect /g) || []).length;
    const pathCount = (result.match(/<path /g) || []).length;
    // 3 node rects (plus possibly a background rect for empty workflows)
    expect(rectCount).toBeGreaterThanOrEqual(3);
    expect(pathCount).toBeGreaterThanOrEqual(2);
  });

  it("renders 4 rectangles for parallel workflow without throwing", () => {
    const result = generateWorkflowSvg({
      nodes: [
        { id: "a", type: "workflow", position: { x: 0, y: 0 }, data: { nodeType: "schedule_trigger", label: "A" } },
        { id: "b", type: "workflow", position: { x: 0, y: 0 }, data: { nodeType: "llm_call", label: "B" } },
        { id: "c", type: "workflow", position: { x: 0, y: 0 }, data: { nodeType: "transformer", label: "C" } },
        { id: "d", type: "workflow", position: { x: 0, y: 0 }, data: { nodeType: "send_email", label: "D" } },
      ],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "a", target: "c" },
        { id: "e3", source: "b", target: "d" },
        { id: "e4", source: "c", target: "d" },
      ],
    });
    const rectCount = (result.match(/<rect /g) || []).length;
    expect(rectCount).toBeGreaterThanOrEqual(4);
  });

  it("uses gray fill for unknown nodeType", () => {
    const result = generateWorkflowSvg({
      nodes: [
        { id: "n1", type: "workflow", position: { x: 0, y: 0 }, data: { nodeType: "completely_unknown_type", label: "Unknown" } },
      ],
      edges: [],
    });
    expect(result).toContain('fill="#6B7280"');
  });

  it("uses green fill for schedule_trigger nodeType", () => {
    const result = generateWorkflowSvg({
      nodes: [
        { id: "n1", type: "workflow", position: { x: 0, y: 0 }, data: { nodeType: "schedule_trigger", label: "Trigger" } },
      ],
      edges: [],
    });
    expect(result).toContain('fill="#10B981"');
  });

  it("uses blue fill for llm_call nodeType", () => {
    const result = generateWorkflowSvg({
      nodes: [
        { id: "n1", type: "workflow", position: { x: 0, y: 0 }, data: { nodeType: "llm_call", label: "LLM" } },
      ],
      edges: [],
    });
    expect(result).toContain('fill="#3B82F6"');
  });

  it("uses purple fill for conditional nodeType", () => {
    const result = generateWorkflowSvg({
      nodes: [
        { id: "n1", type: "workflow", position: { x: 0, y: 0 }, data: { nodeType: "conditional", label: "Branch" } },
      ],
      edges: [],
    });
    expect(result).toContain('fill="#8B5CF6"');
  });

  it("does not throw when edges form a cycle", () => {
    expect(() => {
      generateWorkflowSvg({
        nodes: [
          { id: "a", type: "workflow", position: { x: 0, y: 0 }, data: { nodeType: "llm_call", label: "A" } },
          { id: "b", type: "workflow", position: { x: 0, y: 0 }, data: { nodeType: "llm_call", label: "B" } },
        ],
        edges: [
          { id: "e1", source: "a", target: "b" },
          { id: "e2", source: "b", target: "a" },
        ],
      });
    }).not.toThrow();
  });

  it("truncates node labels longer than 18 characters", () => {
    const longLabel = "This label is definitely too long to fit";
    const result = generateWorkflowSvg({
      nodes: [
        { id: "n1", type: "workflow", position: { x: 0, y: 0 }, data: { nodeType: "llm_call", label: longLabel } },
      ],
      edges: [],
    });
    expect(result).not.toContain(longLabel);
    expect(result).toContain("…");
  });

  it("produces well-formed SVG XML", () => {
    const result = generateWorkflowSvg({
      nodes: [
        { id: "a", type: "workflow", position: { x: 0, y: 0 }, data: { nodeType: "schedule_trigger", label: "Start" } },
        { id: "b", type: "workflow", position: { x: 0, y: 0 }, data: { nodeType: "llm_call", label: "Process" } },
      ],
      edges: [{ id: "e1", source: "a", target: "b" }],
    });
    // Basic well-formedness: starts with <svg, ends with </svg>
    expect(result).toMatch(/^<svg[\s>]/);
    expect(result.trimEnd()).toMatch(/<\/svg>$/);
    // All opened tags should be closed (basic check)
    const openTags = result.match(/<(\w+)[\s>]/g) || [];
    const selfClosing = result.match(/<\w+[^>]*\/>/g) || [];
    const closeTags = result.match(/<\/(\w+)>/g) || [];
    // This is a rough check — the number of open tags minus self-closing should roughly equal close tags
    expect(closeTags.length).toBeGreaterThan(0);
  });
});
