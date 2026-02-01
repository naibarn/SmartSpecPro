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
import { clearTenantPageCache } from "@/hooks/useTenantPage";
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
  { key: "changelog", title: "Changelog", description: "Product updates" },
  { key: "careers", title: "Careers", description: "Job openings" },
  { key: "community", title: "Community", description: "Community hub" },
  { key: "support", title: "Support", description: "Support center" },
  { key: "status", title: "Status", description: "System status" },
  { key: "security", title: "Security", description: "Security information" },
  { key: "docs-intro", title: "Docs: Introduction", description: "Documentation introduction" },
  { key: "docs-quickstart", title: "Docs: Quick Start", description: "Getting started guide" },
  { key: "docs-concepts", title: "Docs: Concepts", description: "Core concepts" },
  { key: "docs-auth", title: "Docs: Authentication", description: "Authentication guide" },
  { key: "docs-code-generation", title: "Docs: Code Generation", description: "Code generation guide" },
  { key: "docs-image-generation", title: "Docs: Image Generation", description: "Image generation guide" },
  { key: "docs-video-generation", title: "Docs: Video Generation", description: "Video generation guide" },
  { key: "docs-audio", title: "Docs: Audio & Speech", description: "Audio generation guide" },
  { key: "docs-security-best-practices", title: "Docs: Security", description: "Security best practices" },
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
    fetchPages();
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
      } else {
        // API failed (no tenant, etc.) — still show defaults
        setCurrentPage(createDefaultPage(selectedPageKey));
      }
    } catch (error) {
      console.error('Failed to fetch pages:', error);
      // Still show defaults on error so the page is usable
      setCurrentPage(createDefaultPage(selectedPageKey));
    }
  };

  const getDefaultContent = (pageKey: string): string => {
    const name = tenant?.name || "Our Platform";
    const contentMap: Record<string, string> = {
      home: `<section class="hero">
  <h1>Welcome to ${name}</h1>
  <p>Build amazing things with our powerful AI tools. Generate images, videos, and more with cutting-edge models.</p>
  <a href="/signup">Get Started Free</a>
</section>

<section class="features">
  <h2>Why Choose ${name}?</h2>
  <div class="feature-grid">
    <div class="feature">
      <h3>AI-Powered Generation</h3>
      <p>Access the latest AI models for image, video, and audio generation.</p>
    </div>
    <div class="feature">
      <h3>Enterprise Security</h3>
      <p>Bank-grade encryption and comprehensive audit logs for your peace of mind.</p>
    </div>
    <div class="feature">
      <h3>Easy Integration</h3>
      <p>Simple API and SDK to integrate AI capabilities into your workflow.</p>
    </div>
  </div>
</section>

<section class="cta">
  <h2>Ready to Get Started?</h2>
  <p>Join thousands of creators using ${name} to bring their ideas to life.</p>
  <a href="/signup">Create Free Account</a>
</section>`,

      about: `<section class="about-hero">
  <h1>About ${name}</h1>
  <p>We're on a mission to make AI-powered creative tools accessible to everyone.</p>
</section>

<section class="mission">
  <h2>Our Mission</h2>
  <p>We believe creativity should have no limits. Our platform provides state-of-the-art AI tools that empower creators, designers, and businesses to produce stunning content effortlessly.</p>
</section>

<section class="values">
  <h2>Our Values</h2>
  <div class="values-grid">
    <div><h3>Innovation</h3><p>We stay at the forefront of AI technology.</p></div>
    <div><h3>Accessibility</h3><p>Powerful tools for everyone, not just experts.</p></div>
    <div><h3>Quality</h3><p>We never compromise on output quality.</p></div>
  </div>
</section>`,

      features: `<section class="features-hero">
  <h1>Features</h1>
  <p>Everything you need to create stunning AI-generated content.</p>
</section>

<section class="feature-list">
  <div class="feature-item">
    <h3>Image Generation</h3>
    <p>Create photorealistic images, illustrations, and artwork from text descriptions using models like FLUX, Nano Banana, and more.</p>
  </div>
  <div class="feature-item">
    <h3>Video Generation</h3>
    <p>Generate high-quality videos with models like Wan 2.6, Kling, Runway, and Veo 3.1.</p>
  </div>
  <div class="feature-item">
    <h3>Music Generation</h3>
    <p>Create original music tracks with Suno AI in any genre or style.</p>
  </div>
  <div class="feature-item">
    <h3>Multi-Tenant Platform</h3>
    <p>White-label solution with custom branding, themes, and domain support.</p>
  </div>
</section>`,

      pricing: `<section class="pricing-hero">
  <h1>Pricing</h1>
  <p>Flexible plans for every creator. Start free and scale as you grow.</p>
</section>

<section class="pricing-info">
  <p>Visit our <a href="/pricing">pricing page</a> for current plans and credit packages.</p>
  <p>All plans include access to our full model library, API access, and dedicated support.</p>
</section>`,

      contact: `<section class="contact-hero">
  <h1>Contact Us</h1>
  <p>Have questions? We'd love to hear from you.</p>
</section>

<section class="contact-info">
  <div><h3>Email</h3><p>support@${tenant?.primaryDomain || "example.com"}</p></div>
  <div><h3>Response Time</h3><p>We typically respond within 24 hours.</p></div>
</section>

<section class="contact-form-info">
  <p>Visit our <a href="/contact">contact page</a> to send us a message directly.</p>
</section>`,

      changelog: `<section class="doc-content">
  <h1>Changelog</h1>
  <p>Latest updates and improvements to ${name}.</p>
  <h3>January 2026</h3>
  <ul>
    <li>Documentation sub-pages</li>
    <li>Theme presets for domain admins</li>
    <li>Content editor improvements</li>
  </ul>
</section>`,

      careers: `<section class="doc-content">
  <h1>Careers at ${name}</h1>
  <p>Join our team and help build the future of AI-powered creative tools.</p>
  <h3>Open Positions</h3>
  <ul>
    <li>Senior Full-Stack Engineer</li>
    <li>ML/AI Engineer</li>
    <li>Product Designer</li>
  </ul>
  <p>Contact us at <a href="/contact">our contact page</a> to apply.</p>
</section>`,

      community: `<section class="doc-content">
  <h1>${name} Community</h1>
  <p>Join creators and developers using ${name}. Share your work, get feedback, and learn from others.</p>
  <h3>Get Involved</h3>
  <ul>
    <li>Browse the <a href="/gallery">public gallery</a></li>
    <li>Share your AI-generated creations</li>
    <li>Learn prompt engineering tips</li>
  </ul>
</section>`,

      support: `<section class="doc-content">
  <h1>Support</h1>
  <p>Need help? We're here for you.</p>
  <h3>Resources</h3>
  <ul>
    <li><a href="/docs">Documentation</a> — Comprehensive guides</li>
    <li><a href="/contact">Contact Support</a> — Response within 24 hours</li>
    <li><a href="/pricing">FAQ</a> — Common questions</li>
  </ul>
</section>`,

      status: `<section class="doc-content">
  <h1>System Status</h1>
  <p>All systems are currently <strong>operational</strong>.</p>
  <h3>Services</h3>
  <ul>
    <li>Web Application — Operational</li>
    <li>API — Operational</li>
    <li>Image Generation — Operational</li>
    <li>Video Generation — Operational</li>
    <li>Audio Generation — Operational</li>
  </ul>
</section>`,

      security: `<section class="doc-content">
  <h1>Security</h1>
  <p>${name} takes security seriously. All data is encrypted in transit and at rest.</p>
  <h3>Key Features</h3>
  <ul>
    <li>TLS 1.3 encryption for all connections</li>
    <li>AES-256 encryption at rest</li>
    <li>Multi-Factor Authentication</li>
    <li>Role-based access control</li>
    <li>Comprehensive audit logs</li>
  </ul>
  <p>See our <a href="/docs/security/best-practices">Security Best Practices</a> for more details.</p>
</section>`,

      "docs-intro": `<section class="doc-content">
  <h1>Introduction to ${name}</h1>
  <p>${name} is a powerful AI platform that helps you create amazing content. Generate images, videos, audio, and code with cutting-edge AI models.</p>
  <h3>What You Can Do</h3>
  <ul>
    <li><strong>Generate Code</strong> — Transform natural language into production-ready code.</li>
    <li><strong>Create Images</strong> — Generate photorealistic images and artwork from text.</li>
    <li><strong>Produce Videos</strong> — Create high-quality video content with AI models.</li>
    <li><strong>Synthesize Audio</strong> — Generate speech, music, and sound effects.</li>
  </ul>
</section>`,

      "docs-quickstart": `<section class="doc-content">
  <h1>Quick Start Guide</h1>
  <p>Get started with ${name} in just a few steps.</p>
  <h3>Step 1: Create an Account</h3>
  <p>Sign up at the registration page to get free credits.</p>
  <h3>Step 2: Get Your API Key</h3>
  <p>Go to Settings → API Keys in your dashboard.</p>
  <h3>Step 3: Start Creating</h3>
  <p>Use the dashboard or API to generate your first content.</p>
</section>`,

      "docs-concepts": `<section class="doc-content">
  <h1>Core Concepts</h1>
  <h3>Credits</h3>
  <p>Credits are consumed when using AI models. Different models have different credit costs.</p>
  <h3>Models</h3>
  <p>Access a variety of AI models for code, image, video, and audio generation.</p>
  <h3>Prompts</h3>
  <p>Write clear, descriptive prompts to get the best results from AI models.</p>
  <h3>Workflows</h3>
  <p>Chain multiple AI operations together for complex content pipelines.</p>
</section>`,

      "docs-auth": `<section class="doc-content">
  <h1>Authentication</h1>
  <h3>API Keys</h3>
  <p>Generate API keys from your dashboard for programmatic access. Keep them secret.</p>
  <h3>OAuth</h3>
  <p>Sign in with Google, GitHub, or other OAuth providers.</p>
  <h3>Multi-Factor Authentication</h3>
  <p>Enable MFA for additional account security.</p>
</section>`,

      "docs-code-generation": `<section class="doc-content">
  <h1>Code Generation</h1>
  <p>Generate production-ready code from natural language descriptions.</p>
  <h3>Supported Languages</h3>
  <ul>
    <li>TypeScript / JavaScript</li>
    <li>Python</li>
    <li>Go, Rust, and more</li>
  </ul>
  <h3>Best Practices</h3>
  <p>Be specific about requirements, specify the framework, and review generated code before deploying.</p>
</section>`,

      "docs-image-generation": `<section class="doc-content">
  <h1>Image Generation</h1>
  <p>Create stunning images from text descriptions using state-of-the-art AI models.</p>
  <h3>Available Models</h3>
  <ul>
    <li><strong>FLUX</strong> — High-quality photorealistic and artistic images</li>
    <li><strong>Stable Diffusion</strong> — Versatile generation with fine control</li>
  </ul>
  <h3>Tips</h3>
  <p>Be descriptive, include style details, and use negative prompts to refine results.</p>
</section>`,

      "docs-video-generation": `<section class="doc-content">
  <h1>Video Generation</h1>
  <p>Generate high-quality videos with AI-powered models.</p>
  <h3>Available Models</h3>
  <ul>
    <li><strong>Wan 2.6</strong> — Text-to-video and image-to-video</li>
    <li><strong>Kling</strong> — High-fidelity video creation</li>
    <li><strong>Runway</strong> — Creative video with style control</li>
  </ul>
</section>`,

      "docs-audio": `<section class="doc-content">
  <h1>Audio & Speech</h1>
  <p>Generate speech, music, and sound effects with AI.</p>
  <h3>Text-to-Speech</h3>
  <p>Convert text to natural-sounding speech in multiple languages.</p>
  <h3>Music Generation</h3>
  <p>Create original music with Suno AI in any genre or style.</p>
</section>`,

      "docs-security-best-practices": `<section class="doc-content">
  <h1>Security Best Practices</h1>
  <h3>API Key Security</h3>
  <ul>
    <li>Never hardcode keys in source code</li>
    <li>Use environment variables</li>
    <li>Rotate keys periodically</li>
  </ul>
  <h3>Account Security</h3>
  <ul>
    <li>Enable MFA</li>
    <li>Use strong passwords</li>
    <li>Review login history</li>
  </ul>
  <h3>Data Protection</h3>
  <p>All data encrypted in transit and at rest. Content accessible only by your account.</p>
</section>`,
    };
    return contentMap[pageKey] || "";
  };

  const getDefaultSections = (pageKey: string): PageSection[] => {
    const name = tenant?.name || "Our Platform";
    if (pageKey === "home") {
      return [
        {
          id: "hero-1",
          type: "hero",
          title: "Welcome to " + name,
          subtitle: "Build amazing things with our powerful AI tools",
          content: "Generate images, videos, and music with cutting-edge AI models.",
        },
        {
          id: "features-1",
          type: "features",
          title: "Why Choose Us",
          subtitle: "Everything you need to succeed",
          items: [
            { title: "AI-Powered Generation", description: "Access the latest AI models for image, video, and audio generation.", icon: "sparkles" },
            { title: "Enterprise Security", description: "Bank-grade encryption and comprehensive audit logs.", icon: "shield" },
            { title: "Easy Integration", description: "Simple API and SDK to integrate AI into your workflow.", icon: "zap" },
          ],
        },
        {
          id: "cta-1",
          type: "cta",
          title: "Ready to Get Started?",
          subtitle: "Join thousands of creators using " + name,
          content: "",
          buttons: [{ text: "Create Free Account", link: "/signup" }],
        },
      ];
    }
    return [];
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
      content: getDefaultContent(pageKey),
      sections: getDefaultSections(pageKey),
      metadata: {
        description: defaultInfo.description,
        keywords: [],
      },
      isPublished: true,
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
        body: JSON.stringify(currentPage),
      });

      if (response.ok) {
        toast.success('Page saved successfully');
        clearTenantPageCache(currentPage.pageKey);
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
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/dashboard')}
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

      <div className="px-4 sm:px-6 lg:px-8 py-8">
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
