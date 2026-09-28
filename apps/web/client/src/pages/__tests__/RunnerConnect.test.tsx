/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en", resolvedLanguage: "en" },
  }),
}));

vi.mock("@/components/help/HelpButton", () => ({
  HelpButton: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 7, email: "owner@example.com", name: "Owner" },
  }),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    isLoading: false,
    tenant: {
      id: 101,
      name: "Acme Workspace",
      primaryDomain: "acme.example.com",
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import RunnerConnect from "../RunnerConnect";

const pendingSession = {
  status: "pending",
  userCode: "RUNNER01",
  expiresAt: "2026-09-19T01:00:00.000Z",
  createdAt: "2026-09-19T00:50:00.000Z",
  request: {
    displayName: "Local Runner",
    deviceId: "runner-device-1",
  },
  runner: null,
  errorMessage: null,
};

describe("RunnerConnect", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/runners/connect?code=RUNNER01");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/runners/connect/status")) {
          return Promise.resolve(
            new Response(JSON.stringify({ session: pendingSession }), {
              status: 200,
            })
          );
        }
        if (url === "/api/runners/connect/approve") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                session: {
                  ...pendingSession,
                  status: "approved",
                  runner: {
                    id: "runner-1",
                    displayName: "Local Runner",
                    profile: "local_device",
                    nodeKind: "local_device",
                    deviceId: "runner-device-1",
                  },
                },
              }),
              { status: 200 }
            )
          );
        }
        return Promise.resolve(new Response("{}", { status: 404 }));
      })
    );
  });

  it("shows only safe runner details and never renders key material or credentials", async () => {
    render(<RunnerConnect />);

    expect(await screen.findByText("Local Runner")).toBeInTheDocument();
    expect(screen.getByText("runner-device-1")).toBeInTheDocument();
    expect(
      screen.queryByText(/BEGIN (PUBLIC|PRIVATE) KEY/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/accessToken|refreshToken|SAH_RUNNER_/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("approves with only the URL code and no client-supplied workspace or key", async () => {
    render(<RunnerConnect />);

    fireEvent.click(
      await screen.findByRole("button", { name: /Allow this Runner/i })
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/runners/connect/approve",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ user_code: "RUNNER01" }),
        })
      );
    });
    expect(await screen.findByText("เชื่อมต่อสำเร็จ")).toBeInTheDocument();
  });
});
