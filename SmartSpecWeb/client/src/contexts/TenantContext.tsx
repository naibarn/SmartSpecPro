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
 * Convert hex color to oklch for better color manipulation
 */
function hexToOklch(hex: string): string {
  // Remove # if present
  hex = hex.replace('#', '');

  // Parse RGB values
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  // Simple conversion - approximate oklch values
  // For more accurate results, a proper color library would be needed
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const lightness = Math.pow(l, 0.43);

  // Estimate chroma and hue
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = (max - min) * 0.4;

  let hue = 0;
  if (max !== min) {
    if (max === r) hue = ((g - b) / (max - min)) * 60;
    else if (max === g) hue = (2 + (b - r) / (max - min)) * 60;
    else hue = (4 + (r - g) / (max - min)) * 60;
    if (hue < 0) hue += 360;
  }

  return `oklch(${lightness.toFixed(2)} ${chroma.toFixed(2)} ${hue.toFixed(0)})`;
}

/**
 * Apply theme to document CSS variables
 */
function applyTheme(theme: TenantTheme) {
  const root = document.documentElement;

  // Convert hex colors to oklch format for shadcn/ui compatibility
  const primaryOklch = hexToOklch(theme.primaryColor);
  const secondaryOklch = hexToOklch(theme.secondaryColor);
  const accentOklch = hexToOklch(theme.accentColor);
  const bgOklch = hexToOklch(theme.backgroundColor);
  const textOklch = hexToOklch(theme.textColor);

  // Set the base CSS variables that shadcn/ui uses
  root.style.setProperty("--primary", primaryOklch);
  root.style.setProperty("--primary-foreground", "oklch(0.98 0.01 285)");
  root.style.setProperty("--secondary", secondaryOklch);
  root.style.setProperty("--secondary-foreground", textOklch);
  root.style.setProperty("--accent", accentOklch);
  root.style.setProperty("--accent-foreground", textOklch);
  root.style.setProperty("--background", bgOklch);
  root.style.setProperty("--foreground", textOklch);
  root.style.setProperty("--ring", primaryOklch);

  // Also set color- prefixed variables for direct use
  root.style.setProperty("--color-primary", primaryOklch);
  root.style.setProperty("--color-secondary", secondaryOklch);
  root.style.setProperty("--color-accent", accentOklch);
  root.style.setProperty("--color-background", bgOklch);
  root.style.setProperty("--color-text", textOklch);
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
