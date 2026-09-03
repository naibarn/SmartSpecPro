/**
 * @vitest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const refetch = vi.fn();
const updateMutate = vi.fn();
const approveMutate = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en", resolvedLanguage: "en" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/dashboard", () => ({
  DashboardCard: ({ title, description, leading, children }: any) => (
    <section><h2>{title}</h2><p>{description}</p>{leading}{children}</section>
  ),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/label", () => ({ Label: ({ children, ...props }: any) => <label {...props}>{children}</label> }));
vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange, ...props }: any) => (
    <button role="switch" aria-checked={checked} onClick={() => onCheckedChange(!checked)} {...props} />
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <section>{children}</section>,
  SelectTrigger: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <section>{children}</section>,
  SelectItem: ({ children, value }: any) => <button data-value={value}>{children}</button>,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    systemSettings: {
      getVerticalDramaEnhancedRuntimeSettings: {
        useQuery: () => ({
          data: {
            settings: { enabled: false, authoringModelId: "gpt-vision", approvedManifestHash: "", approvedSdkVersion: "", approvedAdapterVersion: "" },
            runtime: { bridgeAvailable: true, manifestHashApproved: false, manifestHash: "hash", sdkVersion: "0.22.0", adapterVersion: "1.0.0" },
            authoringModels: [{ id: "gpt-vision", provider: "openai", supportsVision: true, supportsStructuredOutputs: true, enabled: true }],
          },
          isLoading: false,
          refetch,
        }),
      },
      updateVerticalDramaEnhancedRuntimeSettings: { useMutation: () => ({ mutate: updateMutate, isPending: false }) },
      approveVerticalDramaEnhancedRuntime: { useMutation: () => ({ mutate: approveMutate, isPending: false }) },
    },
  },
}));

import VerticalDramaEnhancedRuntimeSettingsPanel from "../VerticalDramaEnhancedRuntimeSettingsPanel";

describe("VerticalDramaEnhancedRuntimeSettingsPanel", () => {
  it("exposes UI-only runtime controls and allows first approval after a healthy probe", () => {
    render(<VerticalDramaEnhancedRuntimeSettingsPanel />);

    expect(screen.getByText(/UI\/database-managed configuration/i)).toBeInTheDocument();
    expect(screen.getByText(/OpenAI Agents SDK bridge/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve current runtime/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /approve current runtime/i }));
    expect(approveMutate).toHaveBeenCalledTimes(1);
  });
});
