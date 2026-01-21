/**
 * Tenant Context - Provides tenant information and theme throughout the app
 */

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface TenantTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  headingFont: string;
  layout: "modern" | "classic" | "minimal" | "creative";
  headerStyle: "transparent" | "solid" | "blur";
  footerStyle: "minimal" | "detailed" | "hidden";
  buttonStyle: "rounded" | "square" | "pill";
  cardStyle: "elevated" | "flat" | "outlined";
  customCss?: string;
}

export interface TenantSeo {
  defaultTitle: string;
  defaultDescription: string;
  defaultKeywords: string[];
  ogImage?: string;
  twitterCard: "summary" | "summary_large_image" | "app" | "player";
  aiContext?: string;
  aiKeyFacts?: string[];
  geoTargeting?: {
    country?: string;
    region?: string;
    city?: string;
    language?: string;
  };
}

export interface Tenant {
  id: number;
  slug: string;
  name: string;
  primaryDomain: string;
  logoUrl?: string;
  faviconUrl?: string;
  theme: TenantTheme;
  seo: TenantSeo;
  settings: Record<string, any>;
  contactInfo?: {
    email?: string;
    phone?: string;
    address?: string;
    socialLinks?: Record<string, string>;
  };
}

interface TenantContextValue {
  tenant: Tenant | null;
  theme: TenantTheme;
  isLoading: boolean;
  refreshTenant: () => Promise<void>;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTenant = async () => {
    try {
      const response = await fetch("/api/tenant/current", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setTenant(data.tenant);

        // Apply theme to document
        applyTheme(data.tenant.theme);

        // Update favicon if available
        if (data.tenant.faviconUrl) {
          updateFavicon(data.tenant.faviconUrl);
        }

        // Update page title
        document.title = data.tenant.seo.defaultTitle || data.tenant.name;
      }
    } catch (error) {
      console.error("Failed to fetch tenant:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTenant();
  }, []);

  const defaultTheme: TenantTheme = {
    primaryColor: "#6366f1",
    secondaryColor: "#8b5cf6",
    accentColor: "#ec4899",
    backgroundColor: "#ffffff",
    textColor: "#1f2937",
    fontFamily: "Inter, system-ui, sans-serif",
    headingFont: "Inter, system-ui, sans-serif",
    layout: "modern",
    headerStyle: "blur",
    footerStyle: "detailed",
    buttonStyle: "rounded",
    cardStyle: "elevated",
  };

  return (
    <TenantContext.Provider
      value={{
        tenant,
        theme: tenant?.theme || defaultTheme,
        isLoading,
        refreshTenant: fetchTenant,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used within TenantProvider");
  }
  return context;
}

/**
 * Apply theme to document CSS variables
 */
function applyTheme(theme: TenantTheme) {
  const root = document.documentElement;

  root.style.setProperty("--color-primary", theme.primaryColor);
  root.style.setProperty("--color-secondary", theme.secondaryColor);
  root.style.setProperty("--color-accent", theme.accentColor);
  root.style.setProperty("--color-background", theme.backgroundColor);
  root.style.setProperty("--color-text", theme.textColor);
  root.style.setProperty("--font-family", theme.fontFamily);
  root.style.setProperty("--font-heading", theme.headingFont);

  // Apply custom CSS if provided
  if (theme.customCss) {
    let styleEl = document.getElementById("tenant-custom-css");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "tenant-custom-css";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = theme.customCss;
  }
}

/**
 * Update favicon dynamically
 */
function updateFavicon(url: string) {
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
}
