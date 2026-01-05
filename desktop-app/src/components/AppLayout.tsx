import { useState, ReactNode } from "react";
import { Sidebar, defaultNavigationItems } from "./Sidebar";
import type { NavigationItem } from "./Sidebar";

export type ViewType = "chat" | "workflows" | "factory" | "skills" | "auth-generator" | "generation" | "gallery" | "sdk" | "memory" | "history" | "admin" | "settings";

interface AppLayoutProps {
  children: ReactNode;
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  headerContent?: ReactNode;
  runningWorkflows?: number;
}

export function AppLayout({
  children,
  activeView,
  onViewChange,
  headerContent,
  runningWorkflows = 0,
}: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Add badges to navigation items
  const navigationItems: NavigationItem[] = defaultNavigationItems.map((item) => {
    if (item.id === "workflows" && runningWorkflows > 0) {
      return { ...item, badge: runningWorkflows };
    }
    return item;
  });

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <Sidebar
        items={navigationItems}
        activeItem={activeView}
        onItemClick={(id) => onViewChange(id as ViewType)}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        {headerContent && (
          <header className="h-14 flex items-center px-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            {headerContent}
          </header>
        )}

        {/* Content Area */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

// View title mapping
export const viewTitles: Record<ViewType, string> = {
  chat: "Chat",
  workflows: "Workflows",
  factory: "SaaS Factory",
  skills: "Skills",
  "auth-generator": "Auth Generator",
  generation: "AI Generation",
  gallery: "Community Gallery",
  sdk: "SDK Integration",
  memory: "Memory",
  history: "History",
  admin: "Admin Dashboard",
  settings: "Settings",
};

// View descriptions
export const viewDescriptions: Record<ViewType, string> = {
  chat: "Chat with AI assistant",
  workflows: "Manage and run workflows",
  factory: "Control Plane session + gates + orchestrator",
  skills: "Configure Kilo Code skills",
  "auth-generator": "Generate authentication systems",
  generation: "Generate images, videos, and audio with AI",
  gallery: "Browse and share AI-generated content",
  sdk: "Get SDK code for your projects",
  memory: "View semantic and episodic memory",
  history: "Execution history",
  admin: "Manage users, content, and system health",
  settings: "Application settings",
};
