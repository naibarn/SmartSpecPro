/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    llmProviders: {
      workerLocalModels: {
        useQuery: () => ({
          data: [
            {
              modelRef: "wllm_12345678",
              name: "Qwen Local",
              providerDisplayName: "Office Worker · ollama",
              workerStatus: "online",
              selectable: true,
            },
          ],
          isLoading: false,
          error: null,
        }),
      },
    },
  },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

import { WorkerLocalAiPanel } from "../WorkerLocalAiPanel";

describe("WorkerLocalAiPanel", () => {
  it("renders every visible Worker Local AI model", () => {
    render(<WorkerLocalAiPanel />);

    expect(screen.getByText("Worker Local AI")).toBeTruthy();
    expect(screen.getByText("Qwen Local")).toBeTruthy();
    expect(screen.getByText(/Office Worker · ollama/)).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();
  });
});
