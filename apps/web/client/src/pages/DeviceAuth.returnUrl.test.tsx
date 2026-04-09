/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DeviceAuth from "./DeviceAuth";

const {
  mockUseLocation,
  mockUseSearch,
} = vi.hoisted(() => ({
  mockUseLocation: vi.fn(),
  mockUseSearch: vi.fn(),
}));

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as Response;
}

vi.mock("wouter", () => ({
  useLocation: mockUseLocation,
  useSearch: mockUseSearch,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
  }),
}));

describe("DeviceAuth returnUrl handoff", () => {
  let setLocation: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setLocation = vi.fn();
    mockUseLocation.mockReturnValue(["/auth/device", setLocation]);
    mockUseSearch.mockReturnValue("?user_code=ABCD1234");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeResponse(200, {
          status: "pending",
          user_code: "ABCD-1234",
          scopes: ["llm:chat"],
          expires_in: 900,
        }),
      ),
    );
  });

  it("sends desktop users to login with a safe returnUrl back to device authorization", async () => {
    render(<DeviceAuth />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign in & Authorize" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign in & Authorize" }));

    expect(setLocation).toHaveBeenCalledWith(
      "/login?returnUrl=%2Fauth%2Fdevice%3Fuser_code%3DABCD1234",
    );
  });
});
