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
import { LibraryFilePicker } from "@/components/library/LibraryFilePicker";
import {
  buildSmartAiHubAutoContentManifest,
  buildSmartAiHubContentMediaPrompts,
  getSmartAiHubAutoContentPresetPacks,
  getSmartAiHubDefaultAutoKeywords,
  renderSmartAiHubAutoContentSummary,
  parseSmartAiHubAutoKeywords,
} from "../../../shared/smartaihubAutoContent";
import type { SmartAiHubContentManifest } from "../../../shared/smartaihubContentManifest";
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
  Upload,
  Sparkles,
  ExternalLink,
  Image,
  Video,
} from "lucide-react";
import { DashboardCard } from "@/components/dashboard";
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
  const autoContentPresetPacks = getSmartAiHubAutoContentPresetPacks();
  const initialPageKey = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("pageKey") || "home"
    : "home";

  const [selectedPageKey, setSelectedPageKey] = useState<string>(initialPageKey);
  const [pages, setPages] = useState<Record<string, TenantPage>>({});
  const [currentPage, setCurrentPage] = useState<TenantPage | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isImportingManifest, setIsImportingManifest] = useState(false);
  const [isGeneratingAutoManifest, setIsGeneratingAutoManifest] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [showImportHtmlPreview, setShowImportHtmlPreview] = useState(false);
  const [manifestJson, setManifestJson] = useState("");
  const [generatedAutoManifest, setGeneratedAutoManifest] = useState<SmartAiHubContentManifest | null>(null);
  const [autoKeywordsText, setAutoKeywordsText] = useState(getSmartAiHubDefaultAutoKeywords().join("\n"));
  const [autoTopicCount, setAutoTopicCount] = useState(3);
  const [autoContentMode, setAutoContentMode] = useState<"standard" | "news" | "mixed" | "auto">("auto");
  const [autoFreshnessDays, setAutoFreshnessDays] = useState(3);
  const [autoManifestSummary, setAutoManifestSummary] = useState("");
  const [previewGlobalReferenceImages, setPreviewGlobalReferenceImages] = useState<string[]>([]);

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
  <p class="eyebrow">Skill Marketplace + Virtual Workflow Swarms</p>
  <h1>Ship Skills into Outcomes.</h1>
  <p>${name} connects a skill marketplace, virtual workflows, and swarm execution so teams can produce chat answers, presentations, and videos from one platform.</p>
  <div class="hero-actions">
    <a href="/marketplace">Explore Marketplace</a>
    <a href="/signup">Start Free</a>
  </div>
</section>

<section class="features">
  <h2>Three layers that turn a prompt into a repeatable system.</h2>
  <div class="feature-grid">
    <div class="feature">
      <h3>Skill Marketplace</h3>
      <p>Discover, publish, and version reusable skills from a shared catalog.</p>
    </div>
    <div class="feature">
      <h3>Virtual Workflow Builder</h3>
      <p>Compose triggers, approvals, routing, and context into a repeatable process.</p>
    </div>
    <div class="feature">
      <h3>Swarm Execution</h3>
      <p>Run specialist skills in parallel and merge them into a final deliverable.</p>
    </div>
  </div>
</section>

<section class="features">
  <h2>Same workflow, multiple outputs.</h2>
  <div class="feature-grid">
    <div class="feature">
      <h3>Chat</h3>
      <p>Use skill-aware chat to keep answers grounded in live context.</p>
    </div>
    <div class="feature">
      <h3>Presentation</h3>
      <p>Convert swarm output into slide-ready narrative and reusable blocks.</p>
    </div>
    <div class="feature">
      <h3>Video</h3>
      <p>Turn the same workflow into scripts, scenes, and production cues.</p>
    </div>
  </div>
</section>

<section class="cta">
  <h2>Build once. Reuse everywhere.</h2>
  <p>Package capabilities as skills, connect them into workflows, and launch swarms that deliver the exact format you need.</p>
  <a href="/marketplace">Browse Marketplace</a>
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
          title: "Ship Skills into Outcomes.",
          subtitle: "Skill Marketplace + Virtual Workflow Swarms",
          content: `${name} connects a skill marketplace, virtual workflows, and swarm execution so teams can produce chat answers, presentations, and videos from one platform.`,
          buttons: [
            { text: "Explore Marketplace", link: "/marketplace" },
            { text: "Start Free", link: "/signup", style: "outline" },
          ],
        },
        {
          id: "features-1",
          type: "features",
          title: "Three layers that turn a prompt into a repeatable system.",
          subtitle: "From discovery to orchestration to execution",
          items: [
            { title: "Skill Marketplace", description: "Discover, publish, and version reusable skills from a shared catalog.", icon: "store" },
            { title: "Virtual Workflow Builder", description: "Compose triggers, approvals, routing, and context into a repeatable process.", icon: "workflow" },
            { title: "Swarm Execution", description: "Run specialist skills in parallel and merge them into a final deliverable.", icon: "bot" },
          ],
        },
        {
          id: "surfaces-1",
          type: "features",
          title: "Same workflow, multiple outputs.",
          subtitle: "Chat, presentation, and video are all first-class delivery surfaces",
          items: [
            { title: "Chat", description: "Use skill-aware chat to keep answers grounded in live context.", icon: "message-square-text" },
            { title: "Presentation", description: "Convert swarm output into slide-ready narrative and reusable blocks.", icon: "presentation" },
            { title: "Video", description: "Turn the same workflow into scripts, scenes, and production cues.", icon: "video" },
          ],
        },
        {
          id: "cta-1",
          type: "cta",
          title: "Build once. Reuse everywhere.",
          subtitle: "Package capabilities as skills, connect them into workflows, and launch swarms.",
          content: "",
          buttons: [
            { text: "Browse Marketplace", link: "/marketplace" },
            { text: "Start Free", link: "/signup", style: "outline" },
          ],
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

  const handleImportManifest = async () => {
    if (!manifestJson.trim()) {
      toast.error("Paste a JSON manifest first");
      return;
    }

    setIsImportingManifest(true);
    try {
      const manifest = JSON.parse(manifestJson);
      setGeneratedAutoManifest(manifest);
      setShowImportHtmlPreview(true);
      const response = await fetch("/api/tenant/content-manifest/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(manifest),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to import manifest");
      }

      toast.success("Content manifest imported");
      fetchPages();
    } catch (error) {
      console.error("Failed to import manifest:", error);
      toast.error(error instanceof Error ? error.message : "Failed to import manifest");
    } finally {
      setIsImportingManifest(false);
    }
  };

  const handleGenerateAutoManifest = async (shouldImport: boolean) => {
    const keywords = parseSmartAiHubAutoKeywords(autoKeywordsText.split(/[\n,;]+/g));
    if (keywords.length === 0) {
      toast.error("Add at least one keyword");
      return;
    }

    setIsGeneratingAutoManifest(true);
    try {
      const manifest = buildSmartAiHubAutoContentManifest(keywords, tenant?.primaryDomain || "smartaihub.app", {
        topicCount: autoTopicCount,
        mode: autoContentMode,
        freshnessDays: autoFreshnessDays,
      });
      const manifestText = JSON.stringify(manifest, null, 2);
      setGeneratedAutoManifest(manifest);
      setManifestJson(manifestText);
      setAutoManifestSummary(renderSmartAiHubAutoContentSummary(manifest));
      setShowImportHtmlPreview(true);
      toast.success(`Generated ${manifest.docs?.length || 0} docs and ${manifest.blog?.length || 0} blog posts`);

      if (shouldImport) {
        setIsImportingManifest(true);
        try {
          const response = await fetch("/api/tenant/content-manifest/import", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
            body: manifestText,
          });

          const data = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(data?.error || "Failed to import manifest");
          }

          toast.success("Auto content imported");
          fetchPages();
        } finally {
          setIsImportingManifest(false);
        }
      }
    } catch (error) {
      console.error("Failed to generate auto manifest:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate auto manifest");
    } finally {
      setIsGeneratingAutoManifest(false);
    }
  };

  const handlePreviewHtml = async () => {
    if (generatedAutoManifest) {
      setShowImportHtmlPreview(true);
      return;
    }

    if (manifestJson.trim()) {
      try {
        const parsed = JSON.parse(manifestJson) as SmartAiHubContentManifest;
        setGeneratedAutoManifest(parsed);
        setShowImportHtmlPreview(true);
        return;
      } catch {
        toast.error("The JSON preview is invalid. Generate a new preview or fix the manifest.");
        return;
      }
    }

    await handleGenerateAutoManifest(false);
    setShowImportHtmlPreview(true);
  };

  const applyAutoKeywordPreset = (
    pack: {
      keywords: string[];
      defaultMode?: "standard" | "news" | "mixed" | "auto";
      defaultTopicCount?: number;
      defaultFreshnessDays?: number;
    },
    mode: "replace" | "append",
  ) => {
    const mergedKeywords =
      mode === "append"
        ? parseSmartAiHubAutoKeywords([...autoKeywordsText.split(/[\n,;]+/g), ...pack.keywords])
        : parseSmartAiHubAutoKeywords(pack.keywords);

    setAutoKeywordsText(mergedKeywords.join("\n"));
    if (mode === "replace") {
      setAutoContentMode(pack.defaultMode || "auto");
      setAutoTopicCount(pack.defaultTopicCount || 3);
      setAutoFreshnessDays(pack.defaultFreshnessDays || 3);
    }
    setAutoManifestSummary("");
    setGeneratedAutoManifest(null);
    setShowImportHtmlPreview(false);
    toast.success(mode === "append" ? "Preset appended" : "Preset loaded");
  };

  const autoSelectionSummary = generatedAutoManifest?.generation
    ? `Topics ${generatedAutoManifest.generation.topicCount} • ${generatedAutoManifest.generation.mode} • ${generatedAutoManifest.docs?.[0]?.generation?.skillLabel || generatedAutoManifest.docs?.[0]?.generation?.skillId || "General Article Writer"}`
    : `Topics ${autoTopicCount} • ${autoContentMode}`;

  const updateGlobalPreviewReferenceImage = (slotIndex: number, url: string) => {
    setPreviewGlobalReferenceImages((prev) => {
      const next = [...prev];
      next[slotIndex] = url;
      return next.map((value) => value.trim()).filter(Boolean);
    });
  };

  const clearGlobalPreviewReferenceImages = () => {
    setPreviewGlobalReferenceImages([]);
  };

  const inferAutoContentCluster = (value: string) => {
    const lower = value.toLowerCase();
    if (/(marketplace|skill|publish|discover|reuse)/.test(lower)) return "marketplace";
    if (/(workflow|swarm|orchestr|pipeline|automation)/.test(lower)) return "workflow";
    if (/(seo|search|crawl|index|keyword|intent)/.test(lower)) return "seo";
    if (/(image|visual|illustration|graphic|design)/.test(lower)) return "image";
    if (/(video|presentation|deck|slide|script|scene)/.test(lower)) return "video";
    if (/(security|mfa|audit|key|governance|access)/.test(lower)) return "security";
    if (/(support|ticket|triage|helpdesk|inbox)/.test(lower)) return "support";
    if (/(publish|content|blog|doc|documentation|library)/.test(lower)) return "publishing";
    if (/(faq|question|answer|how to|what is)/.test(lower)) return "faq";
    return "general";
  };

  const buildMediaStudioLink = (
    mediaType: "image" | "video",
    title: string,
    description: string,
    keywords: string[],
    referenceUrls: string[] = previewGlobalReferenceImages,
    attachTarget?: string,
  ) => {
    const cluster = inferAutoContentCluster(`${title} ${description} ${keywords.join(" ")}`);
    const prompts = buildSmartAiHubContentMediaPrompts(title, description, keywords, cluster as any);
    const params = new URLSearchParams();
    params.set("type", mediaType);
    params.set("prompt", mediaType === "image" ? prompts.imagePrompt : prompts.videoPrompt);
    if (attachTarget) {
      params.set("attachTarget", attachTarget);
    }
    referenceUrls.filter(Boolean).forEach((url) => params.append("referenceImages", url));
    return `/media-studio?${params.toString()}`;
  };

  const buildManifestPreviewHtml = (title: string, content: string, description: string) => {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(135deg, #f8fbff, #eef7ff 55%, #f8feff);
      color: #10223a;
    }
    .shell {
      max-width: 860px;
      margin: 0 auto;
      padding: 32px 24px 48px;
    }
    .hero {
      background: rgba(255,255,255,0.86);
      border: 1px solid rgba(96,165,250,0.22);
      border-radius: 28px;
      box-shadow: 0 22px 60px rgba(15,23,42,0.08);
      padding: 28px;
      backdrop-filter: blur(12px);
    }
    .eyebrow {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .12em;
      color: #0284c7;
      font-weight: 700;
      margin: 0 0 12px;
    }
    h1 { margin: 0 0 14px; font-size: 38px; line-height: 1.06; }
    p { line-height: 1.75; color: #334155; font-size: 16px; }
    .content { margin-top: 20px; }
    .content h2, .content h3 { color: #0f172a; margin-top: 22px; }
    .content a { color: #0284c7; }
    .content img { max-width: 100%; border-radius: 18px; }
    .preview-card {
      margin-top: 18px;
      border-radius: 22px;
      border: 1px solid rgba(148,163,184,0.2);
      overflow: hidden;
      background: #fff;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 16px;
      font-size: 12px;
      color: #475569;
    }
    .pill {
      padding: 6px 10px;
      border-radius: 999px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
    }
  </style>
</head>
<body>
  <div class="shell">
    <article class="hero">
      <div class="eyebrow">SmartAIHub Preview</div>
      <h1>${title}</h1>
      <p>${description}</p>
      <div class="content">${content}</div>
    </article>
  </div>
</body>
</html>`;
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
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
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
                  <FileText className="w-6 h-6 text-cyan-500" />
                  Content Editor
                </h1>
                <p className="text-sm text-gray-600">
                  Domain: {tenant?.name || (user as any)?.registeredDomain}
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
                className="bg-blue-600 hover:bg-blue-700"
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
            <DashboardCard title="Pages" description="Select a page to edit" titleClassName="text-lg">
              <div className="space-y-2">
                {DEFAULT_PAGES.map((page) => (
                  <button
                    key={page.key}
                    onClick={() => setSelectedPageKey(page.key)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                      selectedPageKey === page.key
                        ? "bg-blue-100 text-blue-900 font-medium"
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
              </div>
            </DashboardCard>
          </div>

          {/* Main Content Editor */}
          <div className="col-span-9">
            {currentPage && (
              <DashboardCard>
                <div className="px-5 pt-5 sm:px-6 sm:pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{currentPage.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-500">Edit page content and settings</p>
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
                </div>
                <div className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
                  <Tabs defaultValue="content">
                    <TabsList>
                      <TabsTrigger value="content">Content</TabsTrigger>
                      <TabsTrigger value="sections">Sections</TabsTrigger>
                      <TabsTrigger value="settings">Settings</TabsTrigger>
                      <TabsTrigger value="import">Import</TabsTrigger>
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
                            <DashboardCard key={section.id} bodyClassName="space-y-3">
                              <div className="px-5 pt-5 sm:px-6 sm:pt-6">
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
                              </div>
                              <div className="space-y-3 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
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
                              </div>
                            </DashboardCard>
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

                    <TabsContent value="import" className="space-y-4">
                      <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <h3 className="font-semibold text-gray-900">Auto Content Launcher</h3>
                            <p className="text-sm text-gray-600">
                              Paste keyword clusters, generate docs/FAQ/blog pages, and import them into the tenant in one step.
                            </p>
                          </div>
                          {autoManifestSummary && (
                            <p className="text-sm font-medium text-cyan-700">{autoManifestSummary}</p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <Label>Preset Packs</Label>
                            <p className="text-xs text-gray-500">
                              เลือกชุด keyword ตาม intent แล้วกดสร้างต่อได้ทันที
                            </p>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {autoContentPresetPacks.map((pack) => (
                              <DashboardCard key={pack.id} className="border-cyan-100 bg-white/80 shadow-sm">
                                <div className="px-5 pt-5 sm:px-6 sm:pt-6">
                                  <h3 className="text-base font-semibold text-gray-900">{pack.label}</h3>
                                  <p className="mt-1 text-sm leading-6 text-slate-500">{pack.description}</p>
                                  <div className="flex flex-wrap gap-2 pt-2">
                                    <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-[11px] font-medium text-cyan-700">
                                      mode: {pack.defaultMode || "auto"}
                                    </span>
                                    <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-[11px] font-medium text-cyan-700">
                                      topics: {pack.defaultTopicCount || 3}
                                    </span>
                                    {typeof pack.defaultFreshnessDays === "number" && (
                                      <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-[11px] font-medium text-cyan-700">
                                        freshness: {pack.defaultFreshnessDays}d
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-3 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
                                  <div className="flex flex-wrap gap-2">
                                    {pack.keywords.slice(0, 3).map((keyword) => (
                                      <span
                                        key={keyword}
                                        className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-[11px] font-medium text-cyan-700"
                                      >
                                        {keyword}
                                      </span>
                                    ))}
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => applyAutoKeywordPreset(pack, "replace")}
                                    >
                                      Load Pack
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="text-cyan-700 hover:text-cyan-800 hover:bg-cyan-50"
                                      onClick={() => applyAutoKeywordPreset(pack, "append")}
                                    >
                                      Append
                                    </Button>
                                  </div>
                                </div>
                              </DashboardCard>
                            ))}
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor="auto-topic-count">Number of Topics</Label>
                            <Input
                              id="auto-topic-count"
                              type="number"
                              min={1}
                              max={20}
                              value={autoTopicCount}
                              onChange={(e) => setAutoTopicCount(Math.max(1, parseInt(e.target.value, 10) || 3))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="auto-mode">Generation Mode</Label>
                            <Select value={autoContentMode} onValueChange={(value) => setAutoContentMode(value as typeof autoContentMode)}>
                              <SelectTrigger id="auto-mode">
                                <SelectValue placeholder="Select mode" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">Auto detect</SelectItem>
                                <SelectItem value="standard">Standard</SelectItem>
                                <SelectItem value="mixed">Mixed</SelectItem>
                                <SelectItem value="news">News / Current</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="auto-freshness-days">Freshness Window</Label>
                            <Input
                              id="auto-freshness-days"
                              type="number"
                              min={0}
                              max={3650}
                              value={autoFreshnessDays}
                              onChange={(e) => setAutoFreshnessDays(Math.max(0, parseInt(e.target.value, 10) || 3))}
                            />
                          </div>
                        </div>

                        <div className="rounded-lg border border-cyan-100 bg-white/70 px-3 py-2 text-sm text-cyan-900">
                          {autoSelectionSummary}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="auto-keywords">Keyword Clusters</Label>
                          <Textarea
                            id="auto-keywords"
                            value={autoKeywordsText}
                            onChange={(e) => setAutoKeywordsText(e.target.value)}
                            rows={8}
                            className="font-mono text-sm"
                            placeholder={`skill marketplace discovery\nAI search optimization\nFAQ SEO strategy\nimage prompt engineering`}
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleGenerateAutoManifest(false)}
                            disabled={isGeneratingAutoManifest || isImportingManifest}
                          >
                            {isGeneratingAutoManifest ? (
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Sparkles className="w-4 h-4 mr-2" />
                            )}
                            Generate Preview
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handlePreviewHtml}
                            disabled={isGeneratingAutoManifest || isImportingManifest}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            HTML Preview
                          </Button>
                          <Button
                            type="button"
                            onClick={() => handleGenerateAutoManifest(true)}
                            disabled={isGeneratingAutoManifest || isImportingManifest}
                            className="bg-cyan-600 hover:bg-cyan-700"
                          >
                            {isImportingManifest ? (
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Upload className="w-4 h-4 mr-2" />
                            )}
                            Generate & Import
                          </Button>
                        </div>

                        {showImportHtmlPreview && generatedAutoManifest && (
                          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div>
                                <h4 className="font-semibold text-gray-900">HTML Preview</h4>
                                <p className="text-sm text-gray-500">
                                  ดูหน้าที่จะถูกสร้างก่อน import จริง แล้วเปิดไปดู live page หรือ Media Studio ต่อได้
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setShowImportHtmlPreview(false)}
                              >
                                Hide Preview
                              </Button>
                            </div>

                            {(() => {
                              const docs = (generatedAutoManifest.docs || []).filter((doc) => !doc.slug.startsWith("faq/"));
                              const faqDocs = (generatedAutoManifest.docs || []).filter((doc) => doc.slug.startsWith("faq/"));
                              const blogPosts = generatedAutoManifest.blog || [];

                              const renderPreviewCard = (
                                kind: "docs" | "faq" | "blog",
                                item: {
                                  title: string;
                                  description?: string;
                                  content?: string;
                                  excerpt?: string;
                                  slug: string;
                                  keywords?: string[];
                                  mediaPrompts?: { imagePrompt?: string; videoPrompt?: string };
                                },
                              ) => {
                              const href = kind === "blog" ? `/blog/${item.slug}` : `/docs/${item.slug}`;
                              const bodyHtml = item.content || `<section><h1>${item.title}</h1><p>${item.description || item.excerpt || ""}</p></section>`;
                              const mediaDescription = item.description || item.excerpt || "";
                              const mediaKeywords = item.keywords || [];
                              const selectedReferences = previewGlobalReferenceImages;
                              const attachTarget = kind === "blog"
                                ? `blog:${item.slug}`
                                : `page:docs-${item.slug.replace(/\//g, "-")}`;
                              const imageLink = buildMediaStudioLink("image", item.title, mediaDescription, mediaKeywords, selectedReferences, attachTarget);
                              const videoLink = buildMediaStudioLink("video", item.title, mediaDescription, mediaKeywords, selectedReferences, attachTarget);
                              const primaryStudioLink = item.mediaPrompts?.imagePrompt ? imageLink : videoLink;
                                const openPreviewAndStudio = () => {
                                  window.open(href, "_blank", "noopener,noreferrer");
                                  window.open(primaryStudioLink, "_blank", "noopener,noreferrer");
                                };

                              return (
                                <DashboardCard key={`${kind}-${item.slug}`} className="border-slate-200">
                                  <div className="px-5 pt-5 sm:px-6 sm:pt-6">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
                                        <p className="mt-1 text-sm leading-6 text-slate-500">{href}</p>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
                                        >
                                          <ExternalLink className="w-4 h-4 mr-2" />
                                          Open Page
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="border-cyan-200 text-cyan-700 hover:bg-cyan-50"
                                          onClick={openPreviewAndStudio}
                                        >
                                          <Sparkles className="w-4 h-4 mr-2" />
                                          Preview + Studio
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => window.open(imageLink, "_blank", "noopener,noreferrer")}
                                        >
                                          <Image className="w-4 h-4 mr-2" />
                                          Image Studio
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => window.open(videoLink, "_blank", "noopener,noreferrer")}
                                        >
                                          <Video className="w-4 h-4 mr-2" />
                                          Video Studio
                                        </Button>
                                      </div>
                                      <p className="text-xs text-gray-500">
                                        Open Media Studio to generate the image/video prompt and attach reference assets from Library.
                                      </p>
                                    </div>
                                  </div>
                                  <div className="space-y-3 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
                                    <div className="rounded-xl border bg-gradient-to-br from-slate-50 via-sky-50 to-cyan-50 p-2">
                                      <iframe
                                        title={`${item.title} preview`}
                                        srcDoc={buildManifestPreviewHtml(item.title, bodyHtml, mediaDescription)}
                                        className="h-[360px] w-full rounded-lg border-0 bg-white"
                                        sandbox=""
                                      />
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {item.mediaPrompts?.imagePrompt && (
                                        <span className="rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
                                          Image prompt ready
                                        </span>
                                      )}
                                      {item.mediaPrompts?.videoPrompt && (
                                        <span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                                          Video prompt ready
                                        </span>
                                      )}
                                      {mediaKeywords.slice(0, 5).map((keyword) => (
                                        <span
                                          key={keyword}
                                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600"
                                        >
                                          {keyword}
                                        </span>
                                      ))}
                                    </div>
                                    {item.mediaPrompts?.imagePrompt && (
                                      <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-3 text-sm text-gray-700">
                                        <p className="mb-1 font-semibold text-cyan-800">Image prompt</p>
                                        <p className="whitespace-pre-wrap">{item.mediaPrompts.imagePrompt}</p>
                                      </div>
                                    )}
                                    {item.mediaPrompts?.videoPrompt && (
                                      <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3 text-sm text-gray-700">
                                        <p className="mb-1 font-semibold text-sky-800">Video prompt</p>
                                        <p className="whitespace-pre-wrap">{item.mediaPrompts.videoPrompt}</p>
                                      </div>
                                    )}
                                  </div>
                                </DashboardCard>
                              );
                              };

                              return (
                                <div className="space-y-4">
                                  <DashboardCard className="border-cyan-100 bg-cyan-50/50">
                                    <div className="px-5 pt-5 sm:px-6 sm:pt-6">
                                      <h3 className="text-base font-semibold text-gray-900">Imported Pages</h3>
                                      <p className="mt-1 text-sm leading-6 text-slate-500">
                                        Quick links to open the generated pages after import.
                                      </p>
                                    </div>
                                    <div className="space-y-4 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
                                      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-3">
                                        <div className="flex items-center justify-between gap-3 flex-wrap">
                                          <div>
                                            <p className="text-sm font-semibold text-slate-900">Reference Images for All Pages</p>
                                            <p className="text-xs text-slate-500">เลือกครั้งเดียวแล้วใช้ร่วมกับทุกหน้า preview และส่งเข้า Media Studio ได้ทันที</p>
                                          </div>
                                          {previewGlobalReferenceImages.length > 0 && (
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              onClick={clearGlobalPreviewReferenceImages}
                                            >
                                              Clear All
                                            </Button>
                                          )}
                                        </div>
                                        <div className="grid gap-2 md:grid-cols-3">
                                          {Array.from({ length: 3 }).map((_, index) => (
                                            <div key={`global-ref-${index}`} className="space-y-1.5">
                                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                                Slot {index + 1}
                                              </div>
                                              <LibraryFilePicker
                                                value={previewGlobalReferenceImages[index] || ""}
                                                onValueChange={(url) => updateGlobalPreviewReferenceImage(index, url)}
                                                allowedExtensions={["png", "jpg", "jpeg", "webp", "gif"]}
                                              />
                                            </div>
                                          ))}
                                        </div>
                                        {previewGlobalReferenceImages.length > 0 && (
                                          <div className="flex flex-wrap gap-2">
                                            {previewGlobalReferenceImages.map((url) => (
                                              <span
                                                key={url}
                                                className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs text-cyan-700"
                                              >
                                                {url.split("/").pop() || url}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>

                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          onClick={() => {
                                            [...docs, ...faqDocs].forEach((item) => window.open(`/docs/${item.slug}`, "_blank", "noopener,noreferrer"));
                                            blogPosts.forEach((item) => window.open(`/blog/${item.slug}`, "_blank", "noopener,noreferrer"));
                                          }}
                                        >
                                          <ExternalLink className="w-4 h-4 mr-2" />
                                          Open All Imported Pages
                                        </Button>
                                      </div>
                                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                        {[...docs, ...faqDocs].map((item) => (
                                          <Button
                                            key={`${item.slug}-link`}
                                            type="button"
                                            variant="outline"
                                            className="h-auto justify-start whitespace-normal text-left"
                                            onClick={() => window.open(`/docs/${item.slug}`, "_blank", "noopener,noreferrer")}
                                          >
                                            <ExternalLink className="w-4 h-4 mr-2 shrink-0" />
                                            <span className="flex min-w-0 flex-col items-start">
                                              <span className="truncate font-medium">{item.title}</span>
                                              <span className="text-xs text-gray-500">{`/docs/${item.slug}`}</span>
                                            </span>
                                          </Button>
                                        ))}
                                        {blogPosts.map((item) => (
                                          <Button
                                            key={`${item.slug}-blog-link`}
                                            type="button"
                                            variant="outline"
                                            className="h-auto justify-start whitespace-normal text-left"
                                            onClick={() => window.open(`/blog/${item.slug}`, "_blank", "noopener,noreferrer")}
                                          >
                                            <ExternalLink className="w-4 h-4 mr-2 shrink-0" />
                                            <span className="flex min-w-0 flex-col items-start">
                                              <span className="truncate font-medium">{item.title}</span>
                                              <span className="text-xs text-gray-500">{`/blog/${item.slug}`}</span>
                                            </span>
                                          </Button>
                                        ))}
                                      </div>
                                    </div>
                                  </DashboardCard>

                                  <Tabs defaultValue="docs" className="space-y-3">
                                    <TabsList className="bg-slate-100">
                                      <TabsTrigger value="docs">Docs ({docs.length})</TabsTrigger>
                                      <TabsTrigger value="faq">FAQ ({faqDocs.length})</TabsTrigger>
                                      <TabsTrigger value="blog">Blog ({blogPosts.length})</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="docs" className="space-y-4">
                                      {docs.slice(0, 3).map((item) => renderPreviewCard("docs", item))}
                                    </TabsContent>
                                    <TabsContent value="faq" className="space-y-4">
                                      {faqDocs.slice(0, 3).map((item) => renderPreviewCard("faq", item))}
                                    </TabsContent>
                                    <TabsContent value="blog" className="space-y-4">
                                      {blogPosts.slice(0, 3).map((item) => renderPreviewCard("blog", item))}
                                    </TabsContent>
                                  </Tabs>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="content-manifest">Content Manifest JSON</Label>
                        <Textarea
                          id="content-manifest"
                          value={manifestJson}
                          onChange={(e) => setManifestJson(e.target.value)}
                          rows={18}
                          className="font-mono text-sm"
                          placeholder={`{
  "tenantDomain": "${tenant?.primaryDomain || "smartaihub.app"}",
  "pages": [
    {
      "pageKey": "faq-marketplace",
      "path": "/docs/faq/marketplace",
      "slug": "faq/marketplace",
      "title": "Marketplace FAQ",
      "description": "Answers to common marketplace questions",
      "keywords": ["skill marketplace", "faq", "smartaihub"],
      "aiContext": "Use this page to answer common questions about marketplace discovery and publishing.",
      "keyFacts": ["The marketplace supports reusable skills.", "Skills can be versioned and reused across workflows."],
      "content": "<section><h1>Marketplace FAQ</h1></section>"
    }
  ]
}`}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-sm text-gray-500">
                          Import docs, blog, FAQ, and future public pages from a skill-generated manifest.
                        </p>
                        <div className="flex items-center gap-3">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setAutoKeywordsText(getSmartAiHubDefaultAutoKeywords().join("\n"));
                              setAutoManifestSummary("");
                              setGeneratedAutoManifest(null);
                              setShowImportHtmlPreview(false);
                            }}
                            disabled={isGeneratingAutoManifest || isImportingManifest}
                          >
                            Reset Keywords
                          </Button>
                          <Button onClick={handleImportManifest} disabled={isImportingManifest} className="bg-cyan-600 hover:bg-cyan-700">
                          {isImportingManifest ? (
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4 mr-2" />
                          )}
                          Import Manifest
                        </Button>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </DashboardCard>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
