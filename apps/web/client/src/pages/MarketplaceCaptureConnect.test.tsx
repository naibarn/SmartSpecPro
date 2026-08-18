/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const accessToken = "eyJ-test-secret-that-must-never-render";
const deliverCompanionTokenMock = vi.fn();
let mutationOptions: { onSuccess?: (data: { accessToken: string; expiresAt: string }) => void } | undefined;

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: 7, email: "owner@example.com" } }),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { name: "SmartAIHub" } }),
}));

vi.mock("@/lib/companionExtensionDelivery", () => ({
  deliverCompanionToken: (...args: unknown[]) => deliverCompanionTokenMock(...args),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    marketplaceCapture: {
      issueExtensionToken: {
        useMutation: (options: typeof mutationOptions) => {
          mutationOptions = options;
          return {
            data: {
              accessToken,
              expiresAt: "2026-08-25T03:59:10.493Z",
            },
            error: null,
            isPending: false,
            mutate: () => options?.onSuccess?.({
              accessToken,
              expiresAt: "2026-08-25T03:59:10.493Z",
            }),
          };
        },
      },
    },
  },
}));

import MarketplaceCaptureConnect from "./MarketplaceCaptureConnect";

describe("MarketplaceCaptureConnect", () => {
  beforeEach(() => {
    window.history.replaceState(
      {},
      "",
      "/marketplace-capture/connect?origin=chrome-extension%3A%2F%2Fcompanion-id&deviceId=mdev_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    Object.defineProperty(window, "chrome", {
      configurable: true,
      value: { runtime: { sendMessage: vi.fn() } },
    });
    mutationOptions = undefined;
    deliverCompanionTokenMock.mockReset();
    deliverCompanionTokenMock.mockResolvedValue({ ok: true, protocol: "canonical" });
  });

  it("delivers the token to Companion without rendering the credential", async () => {
    render(<MarketplaceCaptureConnect />);

    expect(screen.queryByRole("textbox", { name: /token/i })).toBeNull();
    expect(screen.queryByText(accessToken)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Connect SmartAIHub Companion" }));

    await waitFor(() => expect(screen.getByText("เชื่อมต่อ SmartAIHub Companion สำเร็จแล้ว กลับไปที่ side panel ได้เลย")).toBeTruthy());
    expect(deliverCompanionTokenMock).toHaveBeenCalledWith(
      expect.anything(),
      "companion-id",
      expect.objectContaining({ accessToken, deviceId: expect.stringMatching(/^mdev_/) }),
    );
    expect(document.body.textContent).not.toContain(accessToken);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("shows a safe retry message when delivery fails", async () => {
    deliverCompanionTokenMock.mockResolvedValue({ ok: false, protocol: "canonical", error: accessToken });
    render(<MarketplaceCaptureConnect />);

    fireEvent.click(screen.getByRole("button", { name: "Connect SmartAIHub Companion" }));

    await waitFor(() => expect(screen.getByText("เชื่อมต่อ SmartAIHub Companion ไม่สำเร็จ กรุณากด Connect ใหม่อีกครั้ง")).toBeTruthy());
    expect(document.body.textContent).not.toContain(accessToken);
  });
});
