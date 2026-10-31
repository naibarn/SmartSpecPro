/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("framer-motion", () => ({
  motion: { div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { getFixedT: () => (key: string) => key } }),
}));

vi.mock("sonner", () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      getRecoveryCapabilities: { useQuery: () => ({ data: { sms: { enabled: false } } }) },
    },
  },
}));

import ForgotPassword from "../ForgotPassword";

describe("ForgotPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not claim a reset email was sent when the application ingress returns 503", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "APPLICATION_HTTP_INGRESS_UNAVAILABLE" }),
    }));
    render(<ForgotPassword />);

    fireEvent.click(screen.getByRole("button", { name: /Primary Email/ }));
    fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Reset Code" }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Check your email" })).not.toBeInTheDocument();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it("shows the code step only after a successful tRPC mutation response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: { data: { json: { success: true } } } }),
    }));
    render(<ForgotPassword />);

    fireEvent.click(screen.getByRole("button", { name: /Primary Email/ }));
    fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Reset Code" }));

    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
  });
});
