/**
 * Domain Admin Content Editor
 * Edit domain-specific page content
 */

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  ChevronLeft,
  Save,
  Plus,
  Trash2,
  Eye,
  Code,
  FileText,
  Globe,
  Layout,
  RefreshCw,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface PageSection {
  id: string;
  type: "hero" | "features" | "testimonials" | "cta" | "content" | "custom";
  title?: string;
  subtitle?: string;
  content?: string;
  image?: string;
  buttons?: Array<{ text: string; link: string; style?: string }>;
  items?: Array<any>;
}

interface TenantPage {
  id?: number;
  pageKey: string;
  title: string;
  slug: string;
  content?: string;
  sections?: PageSection[];
  metadata?: {
    description?: string;
    keywords?: string[];
  };
  isPublished: boolean;
  showInMenu: boolean;
  sortOrder: number;
}

const DEFAULT_PAGES: Array<{ key: string; title: string; description: string }> = [
  { key: "home", title: "Home Page", description: "Main landing page" },
  { key: "about", title: "About Us", description: "About the organization" },
  { key: "features", title: "Features", description: "Product/service features" },
  { key: "pricing", title: "Pricing", description: "Pricing information" },
  { key: "contact", title: "Contact", description: "Contact information" },
];

export default function DomainAdminContent() {
  const { user, isLoading: authLoading } = useAuth();
  const { tenant } = useTenant();
  const [, setLocation] = useLocation();

  const [selectedPageKey, setSelectedPageKey] = useState<string>("home");
  const [pages, setPages] = useState<Record<string, TenantPage>>({});
  const [currentPage, setCurrentPage] = useState<TenantPage | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // Redirect if not domain admin
  useEffect(() => {
    if (!authLoading && (!user || (user.role !== "domain_admin" && user.role !== "admin"))) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  // Load pages
  useEffect(() => {
    if (tenant?.id) {
      fetchPages();
    }
  }, [tenant]);

  const fetchPages = async () => {
    try {
      const response = await fetch('/api/tenant/pages', {
        credentials: 'include',
      });

      if (response.ok) {
        const pagesData = await response.json();
        setPages(pagesData || {});

        if (selectedPageKey && pagesData[selectedPageKey]) {
          setCurrentPage(pagesData[selectedPageKey]);
        } else {
          // Create default page
          setCurrentPage(createDefaultPage(selectedPageKey));
        }
      }
    } catch (error) {
      console.error('Failed to fetch pages:', error);
      toast.error('Failed to load pages');
    }
  };

  const createDefaultPage = (pageKey: string): TenantPage => {
    const defaultInfo = DEFAULT_PAGES.find(p => p.key === pageKey) || {
      key: pageKey,
      title: pageKey.charAt(0).toUpperCase() + pageKey.slice(1),
      description: "",
    };

    return {
      pageKey,
      title: defaultInfo.title,
      slug: pageKey,
      content: "",
      sections: pageKey === "home" ? [
        {
          id: "hero-1",
          type: "hero",
          title: "Welcome to " + (tenant?.name || "Our Platform"),
          subtitle: "Build amazing things with our powerful tools",
          content: "",
        },
        {
          id: "features-1",
          type: "features",
          title: "Features",
          subtitle: "Everything you need to succeed",
          items: [
            { title: "Feature 1", description: "Description 1", icon: "⚡" },
            { title: "Feature 2", description: "Description 2", icon: "🚀" },
            { title: "Feature 3", description: "Description 3", icon: "✨" },
          ],
        },
      ] : [],
      metadata: {
        description: defaultInfo.description,
        keywords: [],
      },
      isPublished: false,
      showInMenu: true,
      sortOrder: DEFAULT_PAGES.findIndex(p => p.key === pageKey),
    };
  };

  useEffect(() => {
    if (pages[selectedPageKey]) {
      setCurrentPage(pages[selectedPageKey]);
    } else {
      setCurrentPage(createDefaultPage(selectedPageKey));
    }
  }, [selectedPageKey, pages]);

  const handleSave = async () => {
    if (!currentPage) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/tenant/pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          json: currentPage,
        }),
      });

      if (response.ok) {
        toast.success('Page saved successfully');
        fetchPages();
      } else {
        throw new Error('Failed to save page');
      }
    } catch (error) {
      console.error('Failed to save page:', error);
      toast.error('Failed to save page');
    } finally {
      setIsSaving(false);
    }
  };

  const addSection = () => {
    if (!currentPage) return;

    const newSection: PageSection = {
      id: `section-${Date.now()}`,
      type: "content",
      title: "New Section",
      content: "",
    };

    setCurrentPage({
      ...currentPage,
      sections: [...(currentPage.sections || []), newSection],
    });
  };

  const updateSection = (index: number, updates: Partial<PageSection>) => {
    if (!currentPage || !currentPage.sections) return;

    const newSections = [...currentPage.sections];
    newSections[index] = { ...newSections[index], ...updates };

    setCurrentPage({
      ...currentPage,
      sections: newSections,
    });
  };

  const removeSection = (index: number) => {
    if (!currentPage || !currentPage.sections) return;

    setCurrentPage({
      ...currentPage,
      sections: currentPage.sections.filter((_, i) => i !== index),
    });
  };

  if (authLoading || !user || (user.role !== "domain_admin" && user.role !== "admin")) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/domain-admin')}
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="w-6 h-6 text-purple-500" />
                  Content Editor
                </h1>
                <p className="text-sm text-gray-600">
                  Domain: {tenant?.name || user.registeredDomain}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewMode(!previewMode)}
              >
                {previewMode ? <Code className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {previewMode ? "Edit" : "Preview"}
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isSaving ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar - Page Selector */}
          <div className="col-span-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pages</CardTitle>
                <CardDescription>Select a page to edit</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {DEFAULT_PAGES.map((page) => (
                  <button
                    key={page.key}
                    onClick={() => setSelectedPageKey(page.key)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                      selectedPageKey === page.key
                        ? "bg-purple-100 text-purple-900 font-medium"
                        : "hover:bg-gray-100 text-gray-700"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Layout className="w-4 h-4" />
                      <div>
                        <div className="font-medium">{page.title}</div>
                        <div className="text-xs text-gray-500">{page.description}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Main Content Editor */}
          <div className="col-span-9">
            {currentPage && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{currentPage.title}</CardTitle>
                      <CardDescription>Edit page content and settings</CardDescription>
                    </div>
                    <div className="flex items-center gap-4">
                      <Label className="flex items-center gap-2">
                        <Switch
                          checked={currentPage.isPublished}
                          onCheckedChange={(checked) =>
                            setCurrentPage({ ...currentPage, isPublished: checked })
                          }
                        />
                        <span className="text-sm">Published</span>
                      </Label>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="content">
                    <TabsList>
                      <TabsTrigger value="content">Content</TabsTrigger>
                      <TabsTrigger value="sections">Sections</TabsTrigger>
                      <TabsTrigger value="settings">Settings</TabsTrigger>
                    </TabsList>

                    <TabsContent value="content" className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="page-title">Page Title</Label>
                        <Input
                          id="page-title"
                          value={currentPage.title}
                          onChange={(e) =>
                            setCurrentPage({ ...currentPage, title: e.target.value })
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="page-content">Page Content (HTML/Markdown)</Label>
                        <Textarea
                          id="page-content"
                          value={currentPage.content || ""}
                          onChange={(e) =>
                            setCurrentPage({ ...currentPage, content: e.target.value })
                          }
                          rows={15}
                          className="font-mono text-sm"
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="sections" className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold">Page Sections</h3>
                        <Button onClick={addSection} size="sm">
                          <Plus className="w-4 h-4 mr-2" />
                          Add Section
                        </Button>
                      </div>

                      {currentPage.sections && currentPage.sections.length > 0 ? (
                        <div className="space-y-4">
                          {currentPage.sections.map((section, index) => (
                            <Card key={section.id}>
                              <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                  <Select
                                    value={section.type}
                                    onValueChange={(value) =>
                                      updateSection(index, { type: value as any })
                                    }
                                  >
                                    <SelectTrigger className="w-48">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="hero">Hero</SelectItem>
                                      <SelectItem value="features">Features</SelectItem>
                                      <SelectItem value="testimonials">Testimonials</SelectItem>
                                      <SelectItem value="cta">Call to Action</SelectItem>
                                      <SelectItem value="content">Content</SelectItem>
                                      <SelectItem value="custom">Custom</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeSection(index)}
                                  >
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                  </Button>
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                <Input
                                  placeholder="Section Title"
                                  value={section.title || ""}
                                  onChange={(e) =>
                                    updateSection(index, { title: e.target.value })
                                  }
                                />
                                <Input
                                  placeholder="Subtitle"
                                  value={section.subtitle || ""}
                                  onChange={(e) =>
                                    updateSection(index, { subtitle: e.target.value })
                                  }
                                />
                                <Textarea
                                  placeholder="Content"
                                  value={section.content || ""}
                                  onChange={(e) =>
                                    updateSection(index, { content: e.target.value })
                                  }
                                  rows={4}
                                />
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12 text-gray-500">
                          <Layout className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>No sections yet. Click "Add Section" to get started.</p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="settings" className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="meta-description">Meta Description</Label>
                        <Textarea
                          id="meta-description"
                          value={currentPage.metadata?.description || ""}
                          onChange={(e) =>
                            setCurrentPage({
                              ...currentPage,
                              metadata: {
                                ...currentPage.metadata,
                                description: e.target.value,
                              },
                            })
                          }
                          rows={3}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="slug">Page Slug</Label>
                        <Input
                          id="slug"
                          value={currentPage.slug}
                          onChange={(e) =>
                            setCurrentPage({ ...currentPage, slug: e.target.value })
                          }
                        />
                      </div>

                      <div className="flex items-center gap-4">
                        <Label className="flex items-center gap-2">
                          <Switch
                            checked={currentPage.showInMenu}
                            onCheckedChange={(checked) =>
                              setCurrentPage({ ...currentPage, showInMenu: checked })
                            }
                          />
                          <span>Show in Menu</span>
                        </Label>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="sort-order">Sort Order</Label>
                        <Input
                          id="sort-order"
                          type="number"
                          value={currentPage.sortOrder}
                          onChange={(e) =>
                            setCurrentPage({
                              ...currentPage,
                              sortOrder: parseInt(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
