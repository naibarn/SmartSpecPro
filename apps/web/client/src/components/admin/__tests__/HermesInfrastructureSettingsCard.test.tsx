/**
 * @vitest-environment jsdom
 *
 * Feature 135 (Hermes Grok media worker) — the "Hermes Media Worker
 * (Feature 135)" admin card. Covers:
 *  - all 15 `hermes_*` / `web_process_hermes_worker_enabled` keys are
 *    surfaced (5 kill switches, fee credits, min version, 6 limits, shared
 *    worker id, dev-only toggle)
 *  - absent/empty settings rows render the documented default, not blank
 *  - writes go through `systemSettings.updateSetting` (the generic mutation
 *    — never a bespoke Hermes-only endpoint; that path carries the settings
 *    cache-invalidation, the dev-drainer start/stop side effect, and
 *    `validateHermesLimitCoherence`, all of which raw SQL bypasses)
 *  - a server-side limit-coherence rejection surfaces as a visible error
 *    (toast + inline), not a silent no-op
 *
 * Mounts the CARD directly rather than `InfrastructureSettingsPanel`: that
 * panel is ~3.5k lines with 22 query/mutation hooks and mounting it in jsdom
 * hangs the file (exit 124, not an assertion failure). Same extraction
 * technique already used for `HermesFleetBadge` vs `AdminMonitoring`.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateSettingMutate, applySafePresetMutate, toastErrorMock } = vi.hoisted(() => ({
  updateSettingMutate: vi.fn(),
  applySafePresetMutate: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en", resolvedLanguage: "en" },
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: toastErrorMock,
    warning: vi.fn(),
  },
}));

vi.mock("@/components/help/HelpButton", () => ({
  HelpButton: ({ page, topic, label }: { page: string; topic: string; label: string }) => (
    <button type="button" data-page={page} data-topic={topic}>{label}</button>
  ),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    systemSettings: {
      applyHermesSafePreset: {
        useMutation: (opts: any) => ({
          isPending: false,
          mutate: (variables: unknown) => {
            applySafePresetMutate(variables);
            opts?.onSuccess?.({ success: true }, variables);
          },
        }),
      },
      updateSetting: {
        useMutation: (opts: any) => ({
          isPending: false,
          mutate: (variables: unknown, mutateOpts?: any) => {
            updateSettingMutate(variables);
            const result = (updateSettingMutate as any).mock.results.at(-1)?.value;
            if (result && "error" in result) {
              mutateOpts?.onError?.(result.error, variables);
              opts?.onError?.(result.error, variables);
            } else {
              mutateOpts?.onSuccess?.(result, variables);
              opts?.onSuccess?.(result, variables);
            }
          },
        }),
      },
    },
  },
}));

import HermesInfrastructureSettingsCard, {
  type HermesInfrastructureSettingRow,
} from "../HermesInfrastructureSettingsCard";

function renderCard(infrastructureSettings: HermesInfrastructureSettingRow[] = []) {
  render(<HermesInfrastructureSettingsCard infrastructureSettings={infrastructureSettings} />);
  return userEvent.setup();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("HermesInfrastructureSettingsCard — Hermes Media Worker (Feature 135)", () => {
  it("links the admin setup guide from the card header", () => {
    renderCard();

    expect(screen.getByRole("button", { name: "Setup Help" })).toHaveAttribute(
      "data-topic",
      "grok-via-hermes-admin",
    );
    expect(screen.getByRole("button", { name: "Setup Help" })).toHaveAttribute(
      "data-page",
      "/admin/settings",
    );
  });

  it("renders one primary switch and keeps expert settings collapsed by default", async () => {
    const user = renderCard();

    expect(screen.getByRole("switch", { name: "Enable Grok via Hermes" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    const advancedDisclosure = screen.getByText("Advanced operator settings").closest("details");
    expect(advancedDisclosure).not.toHaveAttribute("open");
    await user.click(screen.getByText("Advanced operator settings"));
    expect(advancedDisclosure).toHaveAttribute("open");

    const expectedOffToggles = [
      "Toggle Shared pool enabled",
      "Toggle Server personal enabled",
      "Toggle Private worker enabled",
      "Toggle Video generation enabled",
      "Toggle Web process Hermes worker (dev-only)",
    ];
    for (const name of expectedOffToggles) {
      expect(screen.getByRole("switch", { name })).toHaveAttribute("aria-checked", "false");
    }
  });

  it("renders the 8 number/text fields with documented defaults (not blank) when settings are absent", async () => {
    const user = renderCard();
    await user.click(screen.getByText("Advanced operator settings"));

    expect(screen.getByLabelText(/shared pool fee/i)).toHaveValue(0);
    expect(screen.getByLabelText(/minimum hermes worker version/i)).toHaveValue("");
    expect(screen.getByLabelText(/max running per connection/i)).toHaveValue(1);
    expect(screen.getByLabelText(/max concurrent per shared worker/i)).toHaveValue(2);
    expect(screen.getByLabelText(/max queued per user/i)).toHaveValue(8);
    expect(screen.getByLabelText(/max queued per tenant shared pool/i)).toHaveValue(20);
    expect(screen.getByLabelText(/submit window per user/i)).toHaveValue(10);
    expect(screen.getByLabelText(/submit window per tenant/i)).toHaveValue(60);

    // Read-only shared worker id shows an explicit "not paired" fallback, not blank.
    expect(screen.getByTestId("hermes-shared-worker-id")).toHaveTextContent(/not paired yet/i);
  });

  it("hydrates from existing infrastructure settings rows instead of defaults", async () => {
    renderCard([
      { key: "hermes_worker_enabled", value: "true" },
      { key: "hermes_max_queued_per_user", value: "12" },
      { key: "hermes_shared_worker_id", value: "worker-abc-123" },
    ]);

    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Enable Grok via Hermes" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    });
    expect(screen.getByLabelText(/max queued per user/i)).toHaveValue(12);
    expect(screen.getByTestId("hermes-shared-worker-id")).toHaveTextContent("worker-abc-123");
  });

  it("applies the safe preset with one mutation from the primary switch", async () => {
    const user = renderCard();

    await user.click(screen.getByRole("switch", { name: "Enable Grok via Hermes" }));

    expect(applySafePresetMutate).toHaveBeenCalledWith({ enabled: true });
  });

  it("saving a limit field calls updateSetting with the field's key and current value", async () => {
    updateSettingMutate.mockReturnValue({ ok: true });
    const user = renderCard();
    await user.click(screen.getByText("Advanced operator settings"));

    const input = screen.getByLabelText(/max queued per user/i);
    await user.clear(input);
    await user.type(input, "3");
    await user.click(screen.getByTestId("hermes-max-queued-per-user-save"));

    expect(updateSettingMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "infrastructure",
        key: "hermes_max_queued_per_user",
        value: "3",
      }),
    );
  });

  it("surfaces a server-side limit-coherence rejection as a visible error (toast + inline), not a silent no-op", async () => {
    updateSettingMutate.mockReturnValue({
      error: { message: "hermes_max_queued_per_user cannot be lower than the max admission batch size (4)" },
    });
    const user = renderCard();
    await user.click(screen.getByText("Advanced operator settings"));

    const input = screen.getByLabelText(/max queued per user/i);
    await user.clear(input);
    await user.type(input, "1");
    await user.click(screen.getByTestId("hermes-max-queued-per-user-save"));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        expect.stringContaining("cannot be lower than the max admission batch size"),
      );
    });
    expect(screen.getByTestId("hermes-max-queued-per-user-error")).toHaveTextContent(
      /cannot be lower than the max admission batch size/i,
    );
  });
});
