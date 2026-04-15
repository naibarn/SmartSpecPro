/**
 * @vitest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spies = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  mutateMock: vi.fn(),
  refetchMock: vi.fn(),
}));

const queryState = vi.hoisted(() => ({
  refetch: spies.refetchMock,
  data: {
    githubRepository: "",
    githubRepositorySource: "none" as const,
    githubWorkflow: "desktop-release.yml",
    githubWorkflowSource: "db" as const,
    githubRef: "main",
    githubRefSource: "db" as const,
    webUrl: "https://smartaihub.app",
    webUrlSource: "db" as const,
    githubTokenConfigured: false,
    githubTokenSource: "none" as const,
  },
  isLoading: false,
  error: null,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    systemSettings: {
      getDesktopReleaseSettings: {
        useQuery: () => queryState,
      },
      updateDesktopReleaseSettings: {
        useMutation: () => ({
          mutate: spies.mutateMock,
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: spies.toastErrorMock,
    success: spies.toastSuccessMock,
  },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: vi.fn(),
    i18n: {
      language: "en",
      resolvedLanguage: "en",
      changeLanguage: vi.fn(),
    },
  }),
}));

import { DesktopReleaseConfigPanel } from "../DesktopReleaseConfigPanel";

describe("DesktopReleaseConfigPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts collapsed and expands on demand before saving", async () => {
    const user = userEvent.setup();

    render(<DesktopReleaseConfigPanel enabled />);

    expect(
      screen.queryByLabelText(
        "dashboard:desktopReleases.admin.config.repository"
      )
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "common.showMore",
      })
    );

    expect(
      await screen.findByLabelText(
        "dashboard:desktopReleases.admin.config.repository"
      )
    ).toBeInTheDocument();

    expect(
      screen.queryByText(
        "dashboard:desktopReleases.admin.config.guide.step1.title"
      )
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "dashboard:desktopReleases.admin.config.guide.expand",
      })
    );

    expect(
      await screen.findByText(
        "dashboard:desktopReleases.admin.config.guide.step1.title"
      )
    ).toBeInTheDocument();

    const saveButton = screen.getByRole("button", {
      name: "dashboard:desktopReleases.admin.config.save",
    });

    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    expect(spies.mutateMock).not.toHaveBeenCalled();
    expect(spies.toastErrorMock).toHaveBeenCalledWith(
      "dashboard:desktopReleases.admin.config.missingRequired"
    );
  });
});
