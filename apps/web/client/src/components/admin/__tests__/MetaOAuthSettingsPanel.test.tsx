/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MetaOAuthSettingsPanel } from "../MetaOAuthSettingsPanel";

const readyValue = {
  metaAppId: "123456789012345",
  metaRedirectUri: "https://smartaihub.app/auth/callback/meta",
  metaGraphApiVersion: "v25.0",
};

describe("MetaOAuthSettingsPanel", () => {
  it("shows the complete English setup path and exact runtime URLs", () => {
    render(
      <MetaOAuthSettingsPanel
        locale="en"
        value={readyValue}
        appSecretConfigured
        webhookVerifyTokenConfigured
        webhookCallbackUrl="https://smartaihub.app/api/webhooks/meta"
        onChange={vi.fn()}
        onTest={vi.fn()}
        isTesting={false}
      />,
    );

    expect(screen.getByRole("heading", { name: "Meta / Facebook Pages" })).toBeInTheDocument();
    expect(screen.getByText("Complete setup guide")).toBeInTheDocument();
    expect(screen.getByText("Configure Facebook Login")).toBeInTheDocument();
    expect(screen.getByText("Save, enable, test, and connect")).toBeInTheDocument();
    expect(screen.getByText("https://smartaihub.app/api/webhooks/meta")).toBeInTheDocument();
    expect(screen.getByText(/pages_manage_engagement/)).toBeInTheDocument();
  });

  it("switches all instructional copy to Thai when the parent locale changes", () => {
    const { rerender } = render(
      <MetaOAuthSettingsPanel
        locale="en"
        value={readyValue}
        appSecretConfigured
        webhookVerifyTokenConfigured
        webhookCallbackUrl="https://smartaihub.app/api/webhooks/meta"
        onChange={vi.fn()}
        onTest={vi.fn()}
        isTesting={false}
      />,
    );

    rerender(
      <MetaOAuthSettingsPanel
        locale="th"
        value={readyValue}
        appSecretConfigured
        webhookVerifyTokenConfigured
        webhookCallbackUrl="https://smartaihub.app/api/webhooks/meta"
        onChange={vi.fn()}
        onTest={vi.fn()}
        isTesting={false}
      />,
    );

    expect(screen.getByText("คู่มือตั้งค่าแบบครบขั้นตอน")).toBeInTheDocument();
    expect(screen.getByText("ตั้งค่า Facebook Login")).toBeInTheDocument();
    expect(screen.getByText("บันทึก เปิดใช้ ทดสอบ และเชื่อมต่อ")).toBeInTheDocument();
    expect(screen.queryByText("Complete setup guide")).not.toBeInTheDocument();
  });
});
