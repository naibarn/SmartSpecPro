/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const discoveryMock = vi.fn();

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    workpack: {
      discovery: { useQuery: (...args: unknown[]) => discoveryMock(...args) },
    },
  },
}));

import WorkpackDiscovery from "../WorkpackDiscovery";

describe("WorkpackDiscovery", () => {
  beforeEach(() => {
    discoveryMock.mockReturnValue({
      data: {
        starters: [
          {
            workpackId: "wp_1",
            title: "Starter Pack",
            domainPack: "support_ops",
            lifecycleState: "ready",
          },
        ],
        benchmarks: [
          {
            id: "bench_1",
            title: "Benchmark Pack",
            publicationScope: "tenant_local",
            trustTags: ["verified"],
          },
        ],
      },
      isLoading: false,
    });
  });

  it("renders starter packs and benchmark lineage", () => {
    render(<WorkpackDiscovery />);

    expect(screen.getByText("Starter Workpacks")).toBeInTheDocument();
    expect(screen.getByText("Starter Pack")).toBeInTheDocument();
    expect(screen.getByText("Benchmark Pack")).toBeInTheDocument();
  });
});
