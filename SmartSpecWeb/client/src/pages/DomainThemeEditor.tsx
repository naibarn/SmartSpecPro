/**
 * Domain Theme Editor
 * Allows domain admins to customize their domain's theme
 */

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ChevronLeft,
  Palette,
  RefreshCw,
  Save,
  Eye,
  RotateCcw,
} from "lucide-react";

interface ThemeConfig {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  headingFont?: string;
  layout?: "modern" | "classic" | "minimal" | "creative";
  headerStyle?: "transparent" | "solid" | "blur";
  footerStyle?: "minimal" | "detailed" | "hidden";
  buttonStyle?: "rounded" | "square" | "pill";
  cardStyle?: "elevated" | "flat" | "outlined";
}

export default function DomainThemeEditor() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const [theme, setTheme] = useState<ThemeConfig>({
    primaryColor: "#9333ea",
    secondaryColor: "#ec4899",
    accentColor: "#06b6d4",
    backgroundColor: "#ffffff",
    textColor: "#1f2937",
    fontFamily: "Inter, sans-serif",
    headingFont: "Inter, sans-serif",
    layout: "modern",
    headerStyle: "blur",
    footerStyle: "minimal",
    buttonStyle: "rounded",
    cardStyle: "elevated",
  });

  const [originalTheme, setOriginalTheme] = useState<ThemeConfig>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch current theme
  useEffect(() => {
    fetchCurrentTheme();
  }, []);

  const fetchCurrentTheme = async () => {
    try {
      const response = await fetch("/api/tenant/current", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        const fetchedTheme = data.tenant.theme || {};
        setTheme({ ...theme, ...fetchedTheme });
        setOriginalTheme({ ...theme, ...fetchedTheme });
      }
    } catch (error) {
      console.error("Failed to fetch theme:", error);
      toast.error("Failed to load theme");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/tenant/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ themeConfig: theme }),
      });

      if (response.ok) {
        toast.success("Theme updated successfully!");
        setOriginalTheme(theme);
        // Reload page to apply new theme
        setTimeout(() => window.location.reload(), 1000);
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to update theme");
      }
    } catch (error) {
      console.error("Failed to save theme:", error);
      toast.error("Failed to save theme");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setTheme(originalTheme);
    toast.info("Theme reset to saved version");
  };

  const handlePreview = () => {
    // Apply theme temporarily to preview
    const root = document.documentElement;
    root.style.setProperty("--color-primary", theme.primaryColor || "");
    root.style.setProperty("--color-secondary", theme.secondaryColor || "");
    root.style.setProperty("--color-accent", theme.accentColor || "");
    toast.success("Preview applied (temporary)");
  };

  // Redirect if not domain admin or admin
  useEffect(() => {
    if (!authLoading && (!user || (user.role !== "domain_admin" && user.role !== "admin"))) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  if (authLoading || isLoading || !user || (user.role !== "domain_admin" && user.role !== "admin")) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/domain-admin')}
                className="text-gray-600"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Palette className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Theme Editor</h1>
                  <p className="text-sm text-gray-500">Customize your domain's appearance</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
              <Button variant="outline" onClick={handlePreview}>
                <Eye className="w-4 h-4 mr-2" />
                Preview
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Settings Panel */}
          <div className="space-y-6">
            {/* Colors */}
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Colors</h2>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="primaryColor"
                      type="color"
                      value={theme.primaryColor}
                      onChange={(e) => setTheme({ ...theme, primaryColor: e.target.value })}
                      className="w-20 h-10"
                    />
                    <Input
                      type="text"
                      value={theme.primaryColor}
                      onChange={(e) => setTheme({ ...theme, primaryColor: e.target.value })}
                      placeholder="#9333ea"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="secondaryColor">Secondary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="secondaryColor"
                      type="color"
                      value={theme.secondaryColor}
                      onChange={(e) => setTheme({ ...theme, secondaryColor: e.target.value })}
                      className="w-20 h-10"
                    />
                    <Input
                      type="text"
                      value={theme.secondaryColor}
                      onChange={(e) => setTheme({ ...theme, secondaryColor: e.target.value })}
                      placeholder="#ec4899"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="accentColor">Accent Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="accentColor"
                      type="color"
                      value={theme.accentColor}
                      onChange={(e) => setTheme({ ...theme, accentColor: e.target.value })}
                      className="w-20 h-10"
                    />
                    <Input
                      type="text"
                      value={theme.accentColor}
                      onChange={(e) => setTheme({ ...theme, accentColor: e.target.value })}
                      placeholder="#06b6d4"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="backgroundColor">Background Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="backgroundColor"
                      type="color"
                      value={theme.backgroundColor}
                      onChange={(e) => setTheme({ ...theme, backgroundColor: e.target.value })}
                      className="w-20 h-10"
                    />
                    <Input
                      type="text"
                      value={theme.backgroundColor}
                      onChange={(e) => setTheme({ ...theme, backgroundColor: e.target.value })}
                      placeholder="#ffffff"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="textColor">Text Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="textColor"
                      type="color"
                      value={theme.textColor}
                      onChange={(e) => setTheme({ ...theme, textColor: e.target.value })}
                      className="w-20 h-10"
                    />
                    <Input
                      type="text"
                      value={theme.textColor}
                      onChange={(e) => setTheme({ ...theme, textColor: e.target.value })}
                      placeholder="#1f2937"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Typography */}
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Typography</h2>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="fontFamily">Body Font</Label>
                  <Input
                    id="fontFamily"
                    value={theme.fontFamily}
                    onChange={(e) => setTheme({ ...theme, fontFamily: e.target.value })}
                    placeholder="Inter, sans-serif"
                  />
                </div>

                <div>
                  <Label htmlFor="headingFont">Heading Font</Label>
                  <Input
                    id="headingFont"
                    value={theme.headingFont}
                    onChange={(e) => setTheme({ ...theme, headingFont: e.target.value })}
                    placeholder="Inter, sans-serif"
                  />
                </div>
              </div>
            </div>

            {/* Styles */}
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Styles</h2>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="layout">Layout</Label>
                  <select
                    id="layout"
                    value={theme.layout}
                    onChange={(e) => setTheme({ ...theme, layout: e.target.value as any })}
                    className="w-full border rounded-lg p-2"
                  >
                    <option value="modern">Modern</option>
                    <option value="classic">Classic</option>
                    <option value="minimal">Minimal</option>
                    <option value="creative">Creative</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="headerStyle">Header Style</Label>
                  <select
                    id="headerStyle"
                    value={theme.headerStyle}
                    onChange={(e) => setTheme({ ...theme, headerStyle: e.target.value as any })}
                    className="w-full border rounded-lg p-2"
                  >
                    <option value="transparent">Transparent</option>
                    <option value="solid">Solid</option>
                    <option value="blur">Blur</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="buttonStyle">Button Style</Label>
                  <select
                    id="buttonStyle"
                    value={theme.buttonStyle}
                    onChange={(e) => setTheme({ ...theme, buttonStyle: e.target.value as any })}
                    className="w-full border rounded-lg p-2"
                  >
                    <option value="rounded">Rounded</option>
                    <option value="square">Square</option>
                    <option value="pill">Pill</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="cardStyle">Card Style</Label>
                  <select
                    id="cardStyle"
                    value={theme.cardStyle}
                    onChange={(e) => setTheme({ ...theme, cardStyle: e.target.value as any })}
                    className="w-full border rounded-lg p-2"
                  >
                    <option value="elevated">Elevated</option>
                    <option value="flat">Flat</option>
                    <option value="outlined">Outlined</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Preview Panel */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border sticky top-24">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 space-y-4"
                style={{
                  backgroundColor: theme.backgroundColor,
                  color: theme.textColor,
                  fontFamily: theme.fontFamily,
                }}
              >
                <h1
                  className="text-3xl font-bold"
                  style={{
                    color: theme.primaryColor,
                    fontFamily: theme.headingFont,
                  }}
                >
                  Heading Example
                </h1>
                <p style={{ color: theme.textColor }}>
                  This is a preview of your theme. Your actual site will look like this after saving.
                </p>
                <div className="flex gap-2">
                  <button
                    style={{
                      backgroundColor: theme.primaryColor,
                      color: "#ffffff",
                      borderRadius: theme.buttonStyle === "pill" ? "9999px" : theme.buttonStyle === "square" ? "0" : "0.5rem",
                    }}
                    className="px-4 py-2 font-medium"
                  >
                    Primary Button
                  </button>
                  <button
                    style={{
                      backgroundColor: theme.secondaryColor,
                      color: "#ffffff",
                      borderRadius: theme.buttonStyle === "pill" ? "9999px" : theme.buttonStyle === "square" ? "0" : "0.5rem",
                    }}
                    className="px-4 py-2 font-medium"
                  >
                    Secondary Button
                  </button>
                </div>
                <div
                  className="p-4 mt-4"
                  style={{
                    backgroundColor: theme.cardStyle === "flat" ? theme.backgroundColor : "#f9fafb",
                    border: theme.cardStyle === "outlined" ? `2px solid ${theme.primaryColor}` : "none",
                    boxShadow: theme.cardStyle === "elevated" ? "0 4px 6px rgba(0, 0, 0, 0.1)" : "none",
                    borderRadius: "0.5rem",
                  }}
                >
                  <h3
                    className="font-semibold mb-2"
                    style={{
                      color: theme.primaryColor,
                      fontFamily: theme.headingFont,
                    }}
                  >
                    Card Example
                  </h3>
                  <p className="text-sm" style={{ color: theme.textColor }}>
                    This is how cards will appear with your selected style.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
