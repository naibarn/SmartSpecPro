// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RunnerReleaseAdminPanel } from "../RunnerReleaseAdminPanel";

const releaseConfigState = vi.hoisted(() => ({
  data: {
    githubRepository: "",
    githubTokenConfigured: false,
  },
  isLoading: false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    systemSettings: {
      getDesktopReleaseSettings: {
        useQuery: () => releaseConfigState,
      },
    },
  },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        "dashboard:runnerReleases.admin.startBuild": "Start manual build",
        "dashboard:runnerReleases.admin.publishToCatalog": "Publish release to SmartAIHub catalog",
        "dashboard:runnerReleases.admin.description": "Manual build only. The server imports and verifies release assets into the SmartAIHub catalog.",
        "dashboard:runnerReleases.admin.configurationRequired": "Configure the GitHub repository and token above before starting a runner build.",
      };
      return labels[key] ?? key;
    },
  }),
}));

describe("RunnerReleaseAdminPanel", () => {
  it("exposes an explicit manual build and publish decision", () => {
    render(<RunnerReleaseAdminPanel />);
    expect(screen.getByRole("button", { name: /start manual build/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /publish release to smartaihub catalog/i })).toBeChecked();
    expect(screen.getByText(/manual build only/i)).toBeInTheDocument();
  });

  it("blocks the build until the GitHub release configuration is ready", async () => {
    const user = userEvent.setup();
    render(<RunnerReleaseAdminPanel />);

    await user.type(screen.getAllByPlaceholderText("0.2.0")[0], "0.2.0");

    expect(
      screen.getByRole("button", { name: /start manual build/i })
    ).toBeDisabled();
    expect(
      screen.getByText(/configure the github repository and token above/i)
    ).toBeInTheDocument();
  });
});
