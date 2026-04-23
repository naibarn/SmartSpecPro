import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("wouter", () => ({
  useLocation: () => ["/skills", vi.fn()],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 1, role: "user" },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

const browseAllSkillsUseQuery = vi.fn();
const useUtilsMock = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    skills: {
      browseAllSkills: {
        useQuery: (...args: unknown[]) => browseAllSkillsUseQuery(...args),
      },
      toggleSkillVisibility: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      toggleAutoTrigger: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      deleteOwn: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      getUserVisibleSkills: {
        invalidate: vi.fn(),
      },
    },
    groups: {
      list: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
    },
    useUtils: () => useUtilsMock(),
  },
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, layout: _layout, transition: _transition, initial: _initial, animate: _animate, exit: _exit, ...props }: {
      children: React.ReactNode;
      layout?: unknown;
      transition?: unknown;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

vi.mock("@/components/dashboard", () => ({
  DashboardCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/skills/SkillStudioDialog", () => ({
  SkillStudioDialog: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children: React.ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: { children: React.ReactNode }) => <span {...props}>{children}</span>,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: (props: Record<string, unknown>) => <button {...props} />,
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

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import SkillBrowser from "../SkillBrowser";

describe("SkillBrowser", () => {
  it("shows native bundle badge for native bundle skills", () => {
    browseAllSkillsUseQuery.mockReturnValue({
      data: {
        skills: [
          {
            id: 1,
            name: "Native Image Skill",
            description: "Native bundle ready",
            icon: "sparkles",
            category: "image_generation",
            visible: true,
            isOwner: true,
            ownerName: null,
            nativeBundleReady: true,
            nativeBundleFiles: ["SKILL.md", "skill.lock.json"],
          },
        ],
        total: 1,
      },
      isLoading: false,
    });
    useUtilsMock.mockReturnValue({
      skills: {
        browseAllSkills: { invalidate: vi.fn() },
        getUserVisibleSkills: { invalidate: vi.fn() },
      },
    });

    const html = renderToStaticMarkup(<SkillBrowser />);

    expect(html).toContain("Native");
    expect(html).toContain("SKILL.md");
  });
});
