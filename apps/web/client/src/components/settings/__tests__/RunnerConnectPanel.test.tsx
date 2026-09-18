/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RunnerConnectPanel } from "../RunnerConnectPanel";

describe("RunnerConnectPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      runnerId: "runner-local-1",
      displayName: "Mac Runner",
      profile: "local_device",
      nodeKind: "local_device",
      controlPath: "/api/runners/runner-local-1/control",
      accessToken: "runner-token-only-in-setup-response",
      expiresInSeconds: 900,
      privateKeyRequiredLocally: true,
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }))));
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    });
  });

  it("enrolls a local Runner through the authenticated browser setup endpoint", async () => {
    render(<RunnerConnectPanel />);

    fireEvent.change(screen.getByLabelText("ชื่อ Runner"), {
      target: { value: "Mac Runner" },
    });
    fireEvent.change(screen.getByLabelText("Device ID"), {
      target: { value: "macbook-pro-01" },
    });
    fireEvent.change(screen.getByLabelText("Machine fingerprint"), {
      target: { value: "fingerprint-1" },
    });
    fireEvent.change(screen.getByLabelText("Device public key (PEM)"), {
      target: { value: "-----BEGIN PUBLIC KEY-----\\nkey\\n-----END PUBLIC KEY-----" },
    });

    fireEvent.click(screen.getByRole("button", { name: "สร้างข้อมูลเชื่อมต่อ Runner" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/runners/setup", expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          displayName: "Mac Runner",
          runnerId: undefined,
          deviceId: "macbook-pro-01",
          machineFingerprint: "fingerprint-1",
          publicKey: "-----BEGIN PUBLIC KEY-----\\nkey\\n-----END PUBLIC KEY-----",
        }),
      }));
    });
    expect(await screen.findByText(/สร้าง Runner runner-local-1 สำเร็จ/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/SAH_RUNNER_PROFILE=local_device/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/SAH_RUNNER_DEVICE_PRIVATE_KEY=<keep-the-private-key-on-the-runner-host>/)).toBeInTheDocument();
  });

  it("does not expose or submit a private key", async () => {
    render(<RunnerConnectPanel />);

    expect(screen.queryByLabelText(/private key/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/SAH_RUNNER_DEVICE_PRIVATE_KEY=/)).not.toBeInTheDocument();
  });
});
