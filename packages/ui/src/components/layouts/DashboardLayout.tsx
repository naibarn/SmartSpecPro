import { Avatar, AvatarFallback } from "../ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { Button } from "../ui/button";
import { useIsMobile } from "../../hooks/useMobile";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { useAuth } from "../../contexts/AuthContext";
import {
  LogOut,
  Sparkles,
  TrendingUp,
  MessageSquare,
  Clock,
  CreditCard,
  Settings,
  Factory,
  Terminal,
  Container,
  Building2,
  Server,
  Activity,
  Users,
  Package,
  Brain,
  Layers,
  Wand2,
  GitBranch,
  Cloud,
  Images,
  UserCog,
  FileText,
  Palette,
  PenLine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState, type ReactNode } from "react";

// Icon lookup map for menu items from @smartspec/shared
const iconMap: Record<string, LucideIcon> = {
  TrendingUp,
  MessageSquare,
  Sparkles,
  Clock,
  CreditCard,
  Settings,
  Factory,
  Terminal,
  Container,
  Building2,
  Server,
  Activity,
  Users,
  Package,
  Brain,
  Layers,
  Wand2,
  GitBranch,
  Cloud,
  Images,
  UserCog,
  FileText,
  Palette,
  PenLine,
};

export interface DashboardMenuItem {
  id: string;
  label: string;
  labelTh?: string;
  icon: string;
  path: string;
  group?: string;
  external?: boolean;
}

export interface DashboardLayoutProps {
  children: ReactNode;
  /** Menu items to display (use getVisibleMenuItems from @smartspec/shared) */
  menuItems: DashboardMenuItem[];
  /** Current path/location */
  currentPath: string;
  /** Navigate to a path */
  onNavigate: (path: string) => void;
  /** Called when user is not authenticated and clicks sign in */
  onSignIn?: () => void;
  /** Whether auth/data is still loading */
  isLoading?: boolean;
  /** App name shown in sidebar header */
  appName?: string;
  /** Logo URL (optional) */
  logoUrl?: string;
}

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export function DashboardLayout({
  children,
  menuItems,
  currentPath,
  onNavigate,
  onSignIn,
  isLoading,
  appName = "SmartAIHub",
  logoUrl,
}: DashboardLayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (authLoading || isLoading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Sign in to continue
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Access to this dashboard requires authentication. Continue to
              launch the login flow.
            </p>
          </div>
          <Button
            onClick={onSignIn}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent
        setSidebarWidth={setSidebarWidth}
        menuItems={menuItems}
        currentPath={currentPath}
        onNavigate={onNavigate}
        appName={appName}
        logoUrl={logoUrl}
      >
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: ReactNode;
  setSidebarWidth: (width: number) => void;
  menuItems: DashboardMenuItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  appName: string;
  logoUrl?: string;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
  menuItems,
  currentPath,
  onNavigate,
  appName,
  logoUrl,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Group menu items
  const mainItems = menuItems.filter(
    (i) => !i.group || i.group === "main"
  );
  const adminItems = menuItems.filter((i) => i.group === "admin");
  const domainAdminItems = menuItems.filter(
    (i) => i.group === "domain-admin"
  );

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft =
        sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  const renderMenuItems = (items: DashboardMenuItem[]) =>
    items.map((item) => {
      const isActive = currentPath === item.path;
      const Icon = iconMap[item.icon] || Sparkles;
      return (
        <SidebarMenuItem key={item.id}>
          <SidebarMenuButton
            isActive={isActive}
            onClick={() => {
              if (item.external) {
                window.open(item.path, "_blank");
              } else {
                onNavigate(item.path);
              }
            }}
            tooltip={item.label}
            className="h-10 transition-all font-normal"
          >
            <Icon
              className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
            />
            <span>{item.label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });

  const Logo = () =>
    logoUrl ? (
      <img
        src={logoUrl}
        alt={appName}
        className="h-7 w-7 object-contain rounded"
      />
    ) : (
      <div className="h-7 w-7 rounded bg-gradient-to-br from-violet-500 via-coral-400 to-teal-400 flex items-center justify-center">
        <Sparkles className="h-4 w-4 text-white" />
      </div>
    );

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <Logo />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold tracking-tight truncate">
                    {appName}
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {renderMenuItems(mainItems)}
            </SidebarMenu>

            {adminItems.length > 0 && (
              <>
                <div className="px-4 py-2 mt-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Admin
                  </span>
                </div>
                <SidebarMenu className="px-2 py-1">
                  {renderMenuItems(adminItems)}
                </SidebarMenu>
              </>
            )}

            {domainAdminItems.length > 0 && (
              <>
                <div className="px-4 py-2 mt-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Domain Admin
                  </span>
                </div>
                <SidebarMenu className="px-2 py-1">
                  {renderMenuItems(domainAdminItems)}
                </SidebarMenu>
              </>
            )}
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <Logo />
                <span className="font-semibold tracking-tight text-foreground">
                  {appName}
                </span>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
