import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("wouter", () => ({
  useLocation: () => ["/chat/settings", vi.fn()],
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlag: () => true,
}));

vi.mock("@/features/local-ai/state/localAiSettingsStore", () => ({
  resolveLocalAiSyncedPreferences: () => ({ enabled: true }),
}));

vi.mock("@smartspec/shared/localAiConversationSettings", () => ({
  mergeClientConversationSkillSettings: (_: unknown, settings: unknown) => settings,
  readClientConversationSkillSettings: () => ({
    autoDetect: true,
    detectionMode: "auto",
    localAiConversation: null,
  }),
}));

const getUserVisibleSkillsUseQuery = vi.fn();
const useUtilsMock = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    skills: {
      getUserVisibleSkills: {
        useQuery: (...args: unknown[]) => getUserVisibleSkillsUseQuery(...args),
      },
    },
    chat: {
      getSkillPreferences: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
      getConversation: {
        useQuery: () => ({
          data: {
            skillSettings: {},
          },
        }),
      },
      updateConversation: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
      batchUpdateSkillPreferences: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
    },
    users: {
      getPreferences: {
        useQuery: () => ({ data: { localAi: null } }),
      },
    },
    localAi: {
      getPolicyAndCatalog: {
        useQuery: () => ({ data: { policy: { featureEnabled: true, forceCloudOnly: false } } }),
      },
    },
    useUtils: () => useUtilsMock(),
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children: React.ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: (props: Record<string, unknown>) => <button {...props} />,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: { children: React.ReactNode }) => <span {...props}>{children}</span>,
}));

vi.mock("@/components/dashboard", () => ({
  DashboardCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => <span />,
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { SkillSettings } from "../SkillSettings";

describe("SkillSettings", () => {
  it("shows native bundle badge for native skills", () => {
    getUserVisibleSkillsUseQuery.mockReturnValue({
      data: {
        skills: [
          {
            id: 11,
            name: "Native Summarizer",
            description: "Native bundle ready",
            icon: "sparkles",
            category: "summarization",
            availableModels: [],
            defaultModel: null,
            enabledByDefault: true,
            creditMultiplier: 1,
            priority: 80,
            nativeBundleReady: true,
            nativeBundleFiles: ["SKILL.md", "scripts/run.sh"],
          },
        ],
      },
      isLoading: false,
    });
    useUtilsMock.mockReturnValue({
      chat: {
        getConversation: { invalidate: vi.fn() },
        getSkillPreferences: { invalidate: vi.fn() },
      },
    });

    const html = renderToStaticMarkup(<SkillSettings conversationId={123} />);

    expect(html).toContain("Native");
    expect(html).toContain("scripts/run.sh");
  });
});
