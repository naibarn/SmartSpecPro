/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const trpcState = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  suggestions: vi.fn(),
  createDraft: vi.fn(),
  answerClarification: vi.fn(),
  dismissClarification: vi.fn(),
  compile: vi.fn(),
  simulate: vi.fn(),
  startRun: vi.fn(),
  utils: {
    workpack: {
      list: { invalidate: vi.fn() },
      getDetail: { invalidate: vi.fn() },
      replay: { invalidate: vi.fn() },
      readiness: { invalidate: vi.fn() },
      exceptionInbox: { invalidate: vi.fn() },
    },
  },
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => trpcState.utils,
    workpack: {
      list: { useQuery: (...args: unknown[]) => trpcState.list(...args) },
      getDetail: { useQuery: (...args: unknown[]) => trpcState.detail(...args) },
      listDomainPackSuggestions: { useQuery: (...args: unknown[]) => trpcState.suggestions(...args) },
      createDraft: { useMutation: (...args: unknown[]) => trpcState.createDraft(...args) },
      answerClarification: { useMutation: (...args: unknown[]) => trpcState.answerClarification(...args) },
      dismissClarification: { useMutation: (...args: unknown[]) => trpcState.dismissClarification(...args) },
      compile: { useMutation: (...args: unknown[]) => trpcState.compile(...args) },
      simulate: { useMutation: (...args: unknown[]) => trpcState.simulate(...args) },
      startRun: { useMutation: (...args: unknown[]) => trpcState.startRun(...args) },
    },
  },
}));

import WorkpackIntakeStudio from "../WorkpackIntakeStudio";

describe("WorkpackIntakeStudio", () => {
  beforeEach(() => {
    trpcState.list.mockReturnValue({
      data: [
        {
          workpack: {
            id: "wp_1",
            title: "Support Intake",
            goal: "Classify tickets",
            lifecycleState: "clarification_needed",
          },
          readiness: {
            nextAction: "Request a missing SLA field",
          },
        },
      ],
      isLoading: false,
    });
    trpcState.detail.mockReturnValue({
      data: {
        caseSources: [
          {
            id: "src_1",
            title: "Support SOP",
            type: "document",
            summary: "Ticket handling guide",
            trace: [{ originSurface: "chat", label: "Case capture" }],
          },
        ],
        playbook: {
          extractedFields: [],
          clarificationQueue: [],
          localFileIntelligence: { available: false, parserStatus: "unknown" },
        },
      },
      isLoading: false,
    });
    trpcState.suggestions.mockReturnValue({
      data: ["support_ops", "sales_ops"],
      isLoading: false,
    });
    for (const key of ["createDraft", "answerClarification", "dismissClarification", "compile", "simulate", "startRun"] as const) {
      trpcState[key].mockReturnValue({ mutate: vi.fn(), isPending: false });
    }
  });

  it("renders draft queue, provenance, and clarification cues", () => {
    render(<WorkpackIntakeStudio />);

    expect(screen.getByText("Draft Queue")).toBeInTheDocument();
    expect(screen.getByText("Support Intake")).toBeInTheDocument();
    expect(screen.getByText(/request a missing sla field/i)).toBeInTheDocument();
    expect(screen.getByText("Source Provenance")).toBeInTheDocument();
  });
});
