/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import VerifyEmailChange from "./VerifyEmailChange";

const mutateAsync = vi.fn().mockResolvedValue({ email: "new@example.com" });

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      confirmEmailChange: {
        useMutation: () => ({ mutateAsync }),
      },
    },
  },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, values?: { email?: string }) =>
      values?.email ? `${key}:${values.email}` : key,
  }),
}));

describe("VerifyEmailChange", () => {
  it("confirms the URL token and tells the user the account was preserved", async () => {
    window.history.replaceState(
      {},
      "",
      "/verify-email-change?token=opaque-token-value-1234567890"
    );
    render(<VerifyEmailChange />);

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        token: "opaque-token-value-1234567890",
      })
    );
    expect(
      await screen.findByText(/profile\.emailChangeSuccess:new@example\.com/)
    ).toBeTruthy();
  });
});
