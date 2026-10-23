/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  disconnect: vi.fn(),
  invalidate: vi.fn(),
  useUtils: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    userGithubConnections: {
      get: { useQuery: mocks.get },
      disconnect: { useMutation: mocks.disconnect },
    },
    useUtils: mocks.useUtils,
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MiniAppGitHubConnectionPanel } from "../MiniAppGitHubConnectionPanel";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockReturnValue({ data: { configured: false, githubLogin: null } });
  mocks.useUtils.mockReturnValue({ userGithubConnections: { get: { invalidate: mocks.invalidate } } });
  mocks.disconnect.mockImplementation(() => ({ mutate: mocks.disconnect, isPending: false }));
});

describe("MiniAppGitHubConnectionPanel", () => {
  it("offers GitHub OAuth without asking the user to paste a token", () => {
    render(<MiniAppGitHubConnectionPanel />);
    expect(screen.getByRole("button", { name: "เชื่อมต่อด้วย GitHub" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/token/i)).toBeNull();
  });

  it("explains that preview testing does not require GitHub", () => {
    render(<MiniAppGitHubConnectionPanel />);
    expect(screen.getByText(/preview ยังทดสอบได้/)).toBeInTheDocument();
  });
});
