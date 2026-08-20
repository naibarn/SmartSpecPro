/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        "connectedDevices.helpButton": "Help",
        "connectedDevices.helpTitle": "Connect clients",
        "connectedDevices.helpDescription": "Choose a client",
        "connectedDevices.helpEndpoint": "Canonical MCP endpoint",
        "connectedDevices.helpOpenGuide": "Open guide",
        "connectedDevices.helpPermissionsTitle": "How permissions work",
        "connectedDevices.helpPermissionsDescription": "Server checks access",
        "connectedDevices.helpPermissionStep1": "Review tenant",
        "connectedDevices.helpPermissionStep2": "Review scopes",
        "connectedDevices.helpPermissionStep3": "Reload tools",
        "connectedDevices.helpPermissionStep4": "Revoke later",
        "connectedDevices.helpPermissionScopeExamples": "Scope examples",
        "connectedDevices.helpHermesCliTitle": "Hermes Agent / CLI",
        "connectedDevices.helpHermesCliDescription": "Use terminal",
        "connectedDevices.helpVerifyTitle": "Verify",
        "connectedDevices.helpHermesVerify": "Verify Hermes",
        "connectedDevices.helpHermesOneTitle": "Hermes One",
        "connectedDevices.helpHermesOneDescription": "Use desktop",
        "connectedDevices.helpHermesOneStep1": "Connect",
        "connectedDevices.helpHermesOneStep2": "Choose OAuth",
        "connectedDevices.helpHermesOneStep3": "Sign in",
        "connectedDevices.helpHermesOneStep4": "Reload tools",
        "connectedDevices.helpExecutorNote": "Executor is separate",
        "connectedDevices.helpClaudeTitle": "Claude Code",
        "connectedDevices.helpClaudeDescription": "Use HTTP",
        "connectedDevices.helpClaudeDesktopNote": "Use Connectors",
        "connectedDevices.helpCodexTitle": "Codex CLI",
        "connectedDevices.helpCodexDescription": "Use remote MCP",
        "connectedDevices.helpCodexVerify": "Verify Codex",
        "connectedDevices.helpNoBrowserTitle": "No browser",
        "connectedDevices.helpNoBrowserDescription": "Use a CLI key",
        "connectedDevices.helpCopyCommands": "Copy commands",
        "connectedDevices.helpCopied": "Copied",
        "connectedDevices.helpAfterConnect": "Verify tools",
      };
      return labels[key] ?? key;
    },
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("lucide-react", () => {
  const Icon = () => <span />;
  return {
    CheckCircle2: Icon,
    Copy: Icon,
    ExternalLink: Icon,
    HelpCircle: Icon,
    ShieldCheck: Icon,
  };
});

import { McpClientHelpDialog } from "../McpClientHelpDialog";

describe("McpClientHelpDialog", () => {
  it("separates supported clients and shows executable OAuth commands", async () => {
    const user = userEvent.setup();
    render(
      <McpClientHelpDialog
        endpoint="https://smartaihub.app/v1/mcp"
        guideUrl="https://smartaihub.app/v1/docs"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(
      screen.getByRole("tab", { name: "Hermes Agent / CLI" })
    ).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Claude Code" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Codex" })).toBeTruthy();
    expect(
      screen.getByText(content =>
        content.includes(
          "hermes mcp add smartaihub --url https://smartaihub.app/v1/mcp --auth oauth"
        )
      )
    ).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Claude Code" }));
    expect(screen.getByRole("tabpanel").textContent).toContain(
      "claude mcp add --transport http smartaihub https://smartaihub.app/v1/mcp"
    );

    await user.click(screen.getByRole("tab", { name: "Codex" }));
    expect(screen.getByRole("tabpanel").textContent).toContain(
      "codex mcp add smartaihub --url https://smartaihub.app/v1/mcp"
    );
  });
});
