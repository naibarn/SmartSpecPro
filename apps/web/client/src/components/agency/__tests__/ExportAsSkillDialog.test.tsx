/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";
import { ExportAsSkillDialog } from "@/components/agency/ExportAsSkillDialog";

const mockClipboardWriteText = vi.fn();

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: any) => createElement("div", null, children),
  DialogContent: ({ children }: any) => createElement("div", null, children),
  DialogDescription: ({ children }: any) => createElement("div", null, children),
  DialogFooter: ({ children }: any) => createElement("div", null, children),
  DialogHeader: ({ children }: any) => createElement("div", null, children),
  DialogTitle: ({ children }: any) => createElement("div", null, children),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("ExportAsSkillDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: mockClipboardWriteText,
      },
    });
  });

  it("copies the source link when available", () => {
    render(
      createElement(ExportAsSkillDialog, {
        open: true,
        onOpenChange: vi.fn(),
        selectedNodes: [
          {
            id: "node-1",
            data: {
              nodeType: "agent",
              name: "Research Lead",
              description: "Research the topic",
              instructions: "Summarize sources and decisions.",
              subgraphId: null,
              isEntryPoint: true,
              isOptional: false,
              nodeConfig: {},
              tools: [],
              toolIds: [],
              guardrailIds: [],
              examples: [],
              outputSchema: null,
              mcpServers: [],
              runtimeConfig: null,
            },
          },
        ],
        selectedEdges: [],
        onExport: vi.fn(),
        sourceLink: `${window.location.origin}/agencies/agency-123/edit?autoExport=1`,
      }),
    );

    expect(screen.getByText("Copy source link")).toBeTruthy();
    fireEvent.click(screen.getByText("Copy source link"));

    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/agencies/agency-123/edit?autoExport=1`,
    );
  });
});
