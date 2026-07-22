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
  HelpButton: ({ page, topic, label }: { page: string; topic: string; label: string }) => (
    <button type="button" data-page={page} data-topic={topic}>{label}</button>
  ),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: 7,
      email: "owner@example.com",
      name: "Owner",
    },
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
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import WorkerAppConnect from "../WorkerAppConnect";
import { toast } from "sonner";

const pendingSession = {
  status: "pending",
  userCode: "ABCD1234",
  expiresAt: "2026-06-23T01:00:00.000Z",
  createdAt: "2026-06-23T00:50:00.000Z",
  worker: null,
  request: {
    displayName: "My render worker",
    runtimeType: "desktop_zeroclaw_managed",
    machineName: "DESKTOP-1",
    sharingMode: "per_user",
  },
  errorMessage: null,
};

describe("WorkerAppConnect", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/workers/connect?code=ABCD1234");
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/workers/connect/status")) {
        return Promise.resolve(new Response(JSON.stringify({ session: pendingSession }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      if (url === "/api/workers/connect/approve") {
        return Promise.resolve(new Response(JSON.stringify({
          session: {
            ...pendingSession,
            status: "approved",
            worker: {
              id: "wrk_1",
              displayName: "My render worker",
              runtimeType: "desktop_zeroclaw_managed",
              machineName: "DESKTOP-1",
            },
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      if (url === "/api/desktop-releases/worker-app/latest") {
        return Promise.resolve(new Response(JSON.stringify({
          release: {
            version: "0.1.5",
            fileName: "smart-ai-hub-worker-app-0.1.5-x64-setup.exe",
            fileSizeBytes: 10_485_760,
            updatedAt: "2026-06-23T00:00:00.000Z",
            downloadUrl: "/api/desktop-releases/worker-app/download",
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      return Promise.resolve(new Response("{}", { status: 404 }));
    }));
  });

  it("links the Worker App guide from the connect page", async () => {
    render(<WorkerAppConnect />);

    await screen.findByText("My render worker");
    expect(screen.getByRole("button", { name: "Worker App Help" })).toHaveAttribute(
      "data-topic",
      "grok-via-hermes-worker-app",
    );
    expect(screen.getByRole("button", { name: "Worker App Help" })).toHaveAttribute(
      "data-page",
      "/workers/connect",
    );
  });

  it("shows browser approval without exposing worker tokens", async () => {
    render(<WorkerAppConnect />);

    expect(await screen.findByText("My render worker")).toBeInTheDocument();
    expect(screen.getByText("DESKTOP-1")).toBeInTheDocument();
    expect(screen.queryByText(/worker-registration-token/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/copy worker key/i)).not.toBeInTheDocument();
  });

  it("approves the worker session with the URL code and URL-resolved workspace", async () => {
    render(<WorkerAppConnect />);

    await screen.findByText("My render worker");
    expect(screen.getAllByText("Acme Workspace").length).toBeGreaterThan(0);
    expect(screen.getByText("acme.example.com")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Allow this Worker App/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/workers/connect/approve", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ user_code: "ABCD1234", tenantId: "101" }),
      }));
    });
    expect(await screen.findByText("เชื่อมต่อสำเร็จ")).toBeInTheDocument();
  });

  it("shows the latest worker app installer on the connect page", async () => {
    render(<WorkerAppConnect />);

    expect(await screen.findByText("smart-ai-hub-worker-app-0.1.5-x64-setup.exe")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Download Worker App/i })).toHaveAttribute(
      "href",
      "/api/desktop-releases/worker-app/download",
    );
  });

  it("shows nested API error messages when approval fails", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/workers/connect/status")) {
        return Promise.resolve(new Response(JSON.stringify({ session: pendingSession }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      if (url === "/api/workers/connect/approve") {
        return Promise.resolve(new Response(JSON.stringify({
          error: {
            code: "tenant_required",
            message: "Please select a workspace before approving this Worker App.",
            type: "invalid_request_error",
          },
        }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }));
      }
      if (url === "/api/desktop-releases/worker-app/latest") {
        return Promise.resolve(new Response(JSON.stringify({ release: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      return Promise.resolve(new Response("{}", { status: 404 }));
    }));

    render(<WorkerAppConnect />);

    fireEvent.click(await screen.findByRole("button", { name: /Allow this Worker App/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Please select a workspace before approving this Worker App.");
    });
  });
});
