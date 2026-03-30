/**
 * Documentation Sub-Page
 * Dynamic component for all doc pages using route param :slug
 * Uses useTenantPage('docs-{slug}') for tenant-specific content
 */

import DOMPurify from 'dompurify';
import { motion } from 'framer-motion';
import { Link, useRoute } from 'wouter';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Seo } from '@/components/Seo';
import { useTenantPage } from '@/hooks/useTenantPage';
import { useTenantSeoSnapshot } from '@/hooks/useTenantSeoSnapshot';
import { isVideoMediaUrl } from '@/lib/media';
import {
  Book,
  ChevronRight,
  ArrowLeft,
  Rocket,
  Lightbulb,
  Key,
  Code2,
  Image,
  Video,
  AudioLines,
  Shield,
  Zap,
  Workflow,
  Search,
  MessageSquare,
} from 'lucide-react';

const sidebarSections = [
  {
    title: 'Fundamentals',
    items: [
      { slug: 'intro', title: 'Introduction', icon: Book },
      { slug: 'quickstart', title: 'Quick Start', icon: Rocket },
      { slug: 'concepts', title: 'Core Concepts', icon: Lightbulb },
      { slug: 'auth', title: 'Authentication', icon: Key },
    ],
  },
  {
    title: 'AI Features',
    items: [
      { slug: 'code-generation', title: 'Code Generation', icon: Code2 },
      { slug: 'image-generation', title: 'Image Generation', icon: Image },
      { slug: 'video-generation', title: 'Video Generation', icon: Video },
      { slug: 'audio', title: 'Audio & Speech', icon: AudioLines },
    ],
  },
  {
    title: 'Security',
    items: [
      { slug: 'security/best-practices', title: 'Best Practices', icon: Shield },
    ],
  },
  {
    title: 'FAQ',
    items: [
      { slug: 'faq/marketplace', title: 'Marketplace FAQ', icon: MessageSquare },
      { slug: 'faq/workflows', title: 'Workflow FAQ', icon: MessageSquare },
      { slug: 'faq/outputs', title: 'Output FAQ', icon: MessageSquare },
    ],
  },
  {
    title: 'Media Workflows',
    items: [
      { slug: 'chat-outputs', title: 'Chat Outputs', icon: MessageSquare },
      { slug: 'image/prompt-engineering', title: 'Image Prompt Engineering', icon: Image },
      { slug: 'image/workflow-pipeline', title: 'Image Workflow Pipeline', icon: Image },
      { slug: 'video/prompt-engineering', title: 'Video Prompt Engineering', icon: Video },
      { slug: 'video/production-pipeline', title: 'Video Production Pipeline', icon: Video },
    ],
  },
  {
    title: 'Publishing & SEO',
    items: [
      { slug: 'marketplace-discovery', title: 'Marketplace Discovery', icon: Book },
      { slug: 'workflow-builder', title: 'Workflow Builder', icon: Workflow },
      { slug: 'swarm-execution', title: 'Swarm Execution', icon: Zap },
      { slug: 'seo/ai-search-optimization', title: 'AI Search Optimization', icon: Search },
      { slug: 'content/factory', title: 'Content Factory', icon: Rocket },
      { slug: 'content-publishing', title: 'Content Publishing', icon: Rocket },
      { slug: 'skill-lifecycle', title: 'Skill Lifecycle', icon: Book },
      { slug: 'brand-consistency', title: 'Brand Consistency', icon: Shield },
      { slug: 'knowledge-automation', title: 'Knowledge Automation', icon: Lightbulb },
      { slug: 'support-automation', title: 'Support Automation', icon: Zap },
    ],
  },
];

const defaultContent: Record<string, { title: string; body: string }> = {
  'getting-started': {
    title: 'Getting Started',
    body: `<h2>Start with one skill</h2>
<p>SmartAIHub helps teams turn reusable skills into production-ready workflows. Start by publishing a skill, connecting it to a virtual workflow, and choosing an output surface like chat, presentation, or video.</p>
<h3>Recommended path</h3>
<ol>
<li>Browse the <a href="/marketplace">Marketplace</a> and pick a skill to reuse.</li>
<li>Compose a workflow that adds context, routing, and approval gates.</li>
<li>Run the workflow as a swarm and review the output.</li>
</ol>`,
  },
  api: {
    title: 'API Reference',
    body: `<h2>SmartAIHub API</h2>
<p>Use the API to list skills, launch workflows, and collect output artifacts for chat, presentation, and video delivery.</p>
<h3>Core endpoints</h3>
<ul>
<li><code>GET /api/skills</code> — List marketplace skills</li>
<li><code>POST /api/workflows/run</code> — Execute a workflow or swarm</li>
<li><code>GET /api/runs/:id</code> — Check execution status</li>
</ul>
<p>For implementation details, see the <a href="/docs/api/rest">REST API</a> and SDK guides.</p>`,
  },
  tutorials: {
    title: 'Tutorials',
    body: `<h2>Workflow Tutorials</h2>
<p>These tutorials show how to combine skills into repeatable enterprise flows.</p>
<h3>Suggested tutorials</h3>
<ul>
<li>Build a multi-step content brief from a single prompt</li>
<li>Turn a workflow result into a slide deck</li>
<li>Generate a video script from swarm output</li>
</ul>`,
  },
  videos: {
    title: 'Video Guides',
    body: `<h2>Video Guides</h2>
<p>Watch how SmartAIHub moves from prompt to packaged output across the platform.</p>
<h3>What you will see</h3>
<ul>
<li>Skill discovery and publishing</li>
<li>Virtual workflow design</li>
<li>Swarm execution and review</li>
<li>Publishing results to chat, presentation, and video</li>
</ul>`,
  },
  'api/rest': {
    title: 'REST API',
    body: `<h2>REST API Overview</h2>
<p>The REST API is the simplest way to automate marketplace discovery and workflow execution.</p>
<h3>Typical flow</h3>
<ol>
<li>Authenticate with your API key</li>
<li>Select a skill or workflow template</li>
<li>Submit the payload and wait for a run ID</li>
<li>Poll or subscribe for completion updates</li>
</ol>`,
  },
  'sdk/python': {
    title: 'Python SDK',
    body: `<h2>Python SDK</h2>
<p>Use the Python SDK to integrate SmartAIHub skills into backend services, notebooks, and automation jobs.</p>
<pre><code>from smartaihub import Client

client = Client(api_key="YOUR_API_KEY")
run = client.workflows.run(skill="brief-generator", input={"topic": "launch plan"})</code></pre>`,
  },
  'sdk/javascript': {
    title: 'JavaScript SDK',
    body: `<h2>JavaScript SDK</h2>
<p>The JavaScript SDK is ideal for web apps and serverless workflows that need to trigger skill runs directly.</p>
<pre><code>import { Client } from "@smartaihub/sdk";

const client = new Client({ apiKey: process.env.SMARTAIHUB_API_KEY });
const run = await client.workflows.run({ skill: "presentation-builder" });</code></pre>`,
  },
  webhooks: {
    title: 'Webhooks',
    body: `<h2>Webhooks</h2>
<p>Webhooks notify your system when a workflow or swarm finishes, making it easy to chain outputs into downstream systems.</p>
<ul>
<li><strong>run.completed</strong> — Fired when execution succeeds</li>
<li><strong>run.failed</strong> — Fired when execution fails</li>
<li><strong>artifact.ready</strong> — Fired when an output asset is ready</li>
</ul>`,
  },
  'security/api-keys': {
    title: 'API Keys',
    body: `<h2>API Keys</h2>
<p>Create API keys from your account settings and scope them to the minimum access needed for each environment.</p>
<ul>
<li>Use separate keys for dev, staging, and production</li>
<li>Rotate keys on a schedule</li>
<li>Store keys in a secret manager</li>
</ul>`,
  },
  'security/mfa': {
    title: 'MFA Setup',
    body: `<h2>MFA Setup</h2>
<p>Multi-factor authentication is recommended for all workspace owners, operators, and approvers.</p>
<ol>
<li>Open account security settings</li>
<li>Scan the QR code with your authenticator app</li>
<li>Save recovery codes in a secure place</li>
</ol>`,
  },
  'security/audit': {
    title: 'Audit Logs',
    body: `<h2>Audit Logs</h2>
<p>Audit logs record who published skills, who ran workflows, and which outputs were produced.</p>
<ul>
<li>Track changes to published skills</li>
<li>Review execution history by tenant</li>
<li>Export logs for compliance reviews</li>
</ul>`,
  },
  intro: {
    title: 'Introduction',
    body: `<h2>Welcome to SmartAIHub</h2>
<p>SmartAIHub is a skill marketplace with virtual workflow orchestration and swarm execution. Teams use it to package expertise once and reuse it across chat, presentation, and video outputs.</p>
<h3>What you can build</h3>
<ul>
<li><strong>Skill Marketplace</strong> — Publish reusable capabilities for your team.</li>
<li><strong>Virtual Workflows</strong> — Chain skills into governed execution paths.</li>
<li><strong>Swarm Runs</strong> — Coordinate multiple skills to complete a job.</li>
<li><strong>Output Layers</strong> — Deliver results as chat, slides, or video assets.</li>
</ul>
<h3>Getting help</h3>
<p>If you need assistance, visit our <a href="/contact">contact page</a> or browse the rest of the documentation.</p>`,
  },
  quickstart: {
    title: 'Quick Start',
    body: `<h2>Get Started in Minutes</h2>
<p>Follow these steps to publish and run your first SmartAIHub workflow.</p>
<h3>Step 1: Create an account</h3>
<p>Sign up at <a href="/signup">the registration page</a> and choose a workspace name.</p>
<h3>Step 2: Pick a skill</h3>
<p>Open the <a href="/marketplace">Marketplace</a> and choose a skill to reuse or fork.</p>
<h3>Step 3: Build a workflow</h3>
<p>Chain the skill into a virtual workflow with approvals and routing rules.</p>
<h3>Step 4: Run a swarm</h3>
<p>Execute the workflow and review the output in chat, presentation, or video.</p>`,
  },
  concepts: {
    title: 'Core Concepts',
    body: `<h2>Core Concepts</h2>
<h3>Skills</h3>
<p>Skills are reusable units of capability, such as writing, planning, translating, or producing media.</p>
<h3>Workflows</h3>
<p>Workflows connect skills into repeatable business processes with context, approval, and routing.</p>
<h3>Swarms</h3>
<p>Swarms coordinate multiple runs so the system can produce stronger and more complete outputs.</p>
<h3>Outputs</h3>
<p>The same run can resolve into different outputs like chat responses, presentation decks, or video assets.</p>
<h3>Tenants</h3>
<p>Each tenant has its own branding, pages, permissions, and marketplace configuration.</p>`,
  },
  auth: {
    title: 'Authentication',
    body: `<h2>Authentication</h2>
<h3>API Keys</h3>
<p>API keys provide programmatic access to the platform. Generate keys from your dashboard under <strong>Settings → API Keys</strong>.</p>
<ul>
<li>Keep your API keys secret</li>
<li>Use environment variables or secret managers</li>
<li>Rotate keys regularly for security</li>
</ul>
<h3>OAuth Integration</h3>
<p>We support OAuth 2.0 for third-party authentication and sign-in.</p>
<h3>Session Management</h3>
<p>Web sessions are managed via secure HTTP-only cookies.</p>
<h3>Multi-Factor Authentication</h3>
<p>Enable MFA in your account settings for an additional layer of security.</p>`,
  },
  'code-generation': {
    title: 'Code Generation',
    body: `<h2>Code Generation</h2>
<p>Generate production-ready code from natural language descriptions.</p>
<h3>Supported Languages</h3>
<ul>
<li>TypeScript / JavaScript</li>
<li>Python</li>
<li>Go</li>
<li>Rust</li>
<li>And many more</li>
</ul>
<h3>How It Works</h3>
<p>Describe what you want to build, specify the language and framework, and the AI generates complete, functional code with proper error handling, types, and documentation.</p>
<h3>Best Practices</h3>
<ul>
<li>Be specific about requirements and edge cases</li>
<li>Specify the framework and version</li>
<li>Review and test generated code before deploying</li>
<li>Use iterative refinement for complex outputs</li>
</ul>`,
  },
  'image-generation': {
    title: 'Image Generation',
    body: `<h2>Image Generation</h2>
<p>Create stunning images from text descriptions using state-of-the-art AI models.</p>
<h3>Available Models</h3>
<ul>
<li><strong>FLUX</strong> — High-quality photorealistic and artistic image generation</li>
<li><strong>Stable Diffusion</strong> — Versatile image generation with fine control</li>
<li><strong>Custom Models</strong> — Specialized models for specific use cases</li>
</ul>
<h3>Prompt Tips</h3>
<ul>
<li>Be descriptive — include details about style, lighting, composition</li>
<li>Use reference terms like "photorealistic," "illustration," "oil painting"</li>
<li>Specify aspect ratios and resolution when needed</li>
<li>Use negative prompts to exclude unwanted elements</li>
</ul>`,
  },
  'video-generation': {
    title: 'Video Generation',
    body: `<h2>Video Generation</h2>
<p>Generate high-quality videos with AI-powered models.</p>
<h3>Available Models</h3>
<ul>
<li><strong>Wan 2.6</strong> — Text-to-video and image-to-video generation</li>
<li><strong>Kling</strong> — High-fidelity video creation</li>
<li><strong>Runway</strong> — Creative video generation with style control</li>
</ul>
<h3>Use Cases</h3>
<ul>
<li>Marketing and promotional videos</li>
<li>Social media content</li>
<li>Product demonstrations</li>
<li>Creative storytelling</li>
</ul>
<h3>Tips</h3>
<p>Start with shorter videos (3-5 seconds) to iterate on your prompts before generating longer content. Use image-to-video for more consistent results.</p>`,
  },
  audio: {
    title: 'Audio & Speech',
    body: `<h2>Audio & Speech</h2>
<p>Generate speech, music, and sound effects with AI.</p>
<h3>Text-to-Speech</h3>
<p>Convert text to natural-sounding speech in multiple languages and voices. Customize tone, speed, and emphasis.</p>
<h3>Music Generation</h3>
<p>Create original music tracks with AI. Specify genre, mood, instruments, and duration to generate custom compositions.</p>
<h3>Available Models</h3>
<ul>
<li><strong>Suno AI</strong> — Full song generation with vocals and instruments</li>
<li><strong>TTS Models</strong> — High-quality text-to-speech conversion</li>
</ul>
<h3>Best Practices</h3>
<ul>
<li>Provide clear genre and mood descriptions</li>
<li>Specify duration constraints</li>
<li>Use reference tracks for style guidance</li>
</ul>`,
  },
  'security/best-practices': {
    title: 'Security Best Practices',
    body: `<h2>Security Best Practices</h2>
<p>Follow these guidelines to keep your account, skills, and workflows secure.</p>
<h3>API Key Security</h3>
<ul>
<li>Never hardcode API keys in source code</li>
<li>Use environment variables or secret managers</li>
<li>Rotate keys periodically</li>
<li>Use separate keys for development and production</li>
</ul>
<h3>Account Security</h3>
<ul>
<li>Enable Multi-Factor Authentication (MFA)</li>
<li>Use strong, unique passwords</li>
<li>Review login history regularly</li>
<li>Revoke access for unused integrations</li>
</ul>
<h3>Audit Logs</h3>
<p>Monitor all skill publishing and workflow execution events in the audit log for complete visibility.</p>`,
  },
  'faq/marketplace': {
    title: 'Marketplace FAQ',
    body: `<h2>Marketplace FAQ</h2>
<p>Answers about finding, publishing, and governing reusable skills in SmartAIHub.</p>
<h3>How do I choose the right skill?</h3>
<p>Start with the outcome you need, then filter by intent, output format, and ownership.</p>
<h3>Can I publish privately first?</h3>
<p>Yes. Validate a skill internally before promoting it to the public marketplace.</p>`,
  },
  'faq/workflows': {
    title: 'Workflow Builder FAQ',
    body: `<h2>Workflow Builder FAQ</h2>
<p>Learn how virtual workflows connect skills, approvals, and routing into repeatable enterprise processes.</p>
<h3>What is a virtual workflow?</h3>
<p>A virtual workflow orchestrates skills, context, approvals, and output packaging.</p>
<h3>Can workflows trigger swarms?</h3>
<p>Yes. A workflow can launch multiple specialist skills in parallel and merge the output.</p>`,
  },
  'faq/outputs': {
    title: 'Output Packaging FAQ',
    body: `<h2>Output Packaging FAQ</h2>
<p>See how SmartAIHub turns one workflow into chat answers, presentations, and video assets.</p>
<h3>Can one run create multiple formats?</h3>
<p>Yes. The same run can produce chat, slide, and video-ready outputs.</p>
<h3>How do I package a deck?</h3>
<p>Organize the result into sections, bullets, and speaker notes before exporting.</p>`,
  },
  'chat-outputs': {
    title: 'Chat Outputs',
    body: `<h2>Chat Outputs</h2>
<p>Chat outputs are the quickest way to expose SmartAIHub runs to end users and operators.</p>
<h3>What belongs here</h3>
<ul>
<li>Answer summaries</li>
<li>Step-by-step recommendations</li>
<li>Escalation notes and next actions</li>
</ul>
<p>Use this page when you want a workflow to end in a conversational result that can also feed presentation or video assets.</p>`,
  },
  'image/prompt-engineering': {
    title: 'Image Prompt Engineering',
    body: `<h2>Image Prompt Engineering</h2>
<p>Prompt structure for enterprise-ready AI image generation and brand-safe visual output.</p>
<h3>Prompt pattern</h3>
<p>Subject + style + composition + lighting + brand constraints + quality target.</p>`,
  },
  'image/workflow-pipeline': {
    title: 'Image Workflow Pipeline',
    body: `<h2>Image Workflow Pipeline</h2>
<p>Turn a brief into batches of approved image assets with review, versioning, and export steps.</p>
<h3>Pipeline</h3>
<p>Brief, prompt set, batch generation, review, and publish.</p>`,
  },
  'video/prompt-engineering': {
    title: 'Video Prompt Engineering',
    body: `<h2>Video Prompt Engineering</h2>
<p>Design prompts that turn workflow output into a script, scenes, and production notes.</p>
<h3>Prompt focus</h3>
<p>Audience, tone, pacing, and scene boundaries.</p>`,
  },
  'video/production-pipeline': {
    title: 'Video Production Pipeline',
    body: `<h2>Video Production Pipeline</h2>
<p>Move from workflow output to a production-ready video plan using scripts, scenes, and cues.</p>
<h3>Pipeline stages</h3>
<p>Convert the run output into a script, split it into scenes, attach cues, and produce the final video.</p>`,
  },
  'seo/ai-search-optimization': {
    title: 'AI Search Optimization',
    body: `<h2>AI Search Optimization</h2>
<p>Structure each page for one intent cluster, strong metadata, and clear entity signals.</p>
<h3>Key rules</h3>
<ul>
<li>One intent per page</li>
<li>Use exact search phrases</li>
<li>Link related docs, blog, and FAQ pages</li>
</ul>`,
  },
  'content/factory': {
    title: 'Content Factory',
    body: `<h2>Content Factory</h2>
<p>Use skill-generated manifests to create docs, FAQ, and blog pages at scale.</p>
<h3>How it works</h3>
<ol>
<li>A skill writes the manifest JSON</li>
<li>The manifest is imported into the tenant</li>
<li>Pages are published with matching SEO metadata</li>
</ol>`,
  },
};

function parseHtmlContent(html: string) {
  const getTextBetween = (tag: string, src: string) => {
    const m = src.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
    return m?.[1]?.replace(/<[^>]*>/g, '').trim() || null;
  };

  // Try to extract title from first h1 or h2
  const title = getTextBetween('h1', html) || getTextBetween('h2', html);

  return { title, body: html };
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function DocPageInner({ slug }: { slug: string }) {
  // Convert slug to pageKey: "intro" -> "docs-intro", "security/best-practices" -> "docs-security-best-practices"
  const pageKey = `docs-${slug.replace(/\//g, '-')}`;
  const { page: tenantPage } = useTenantPage(pageKey);
  const { relatedLinks } = useTenantSeoSnapshot(`/docs/${slug}`);

  // Determine content: tenant content > default
  const tenantContent = tenantPage?.content
    ? parseHtmlContent(tenantPage.content)
    : null;

  const fallback = defaultContent[slug];
  const pageTitle = tenantContent?.title || tenantPage?.title || fallback?.title || 'Documentation';
  const pageBody = tenantContent?.body || fallback?.body || '<p>Content coming soon.</p>';
  const pageDescription = tenantPage?.metadata?.description || stripHtml(pageBody).slice(0, 180);
  const heroMediaUrl = tenantPage?.metadata?.customMeta?.heroMediaUrl;
  const heroMediaType = tenantPage?.metadata?.customMeta?.heroMediaType;

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={`${pageTitle} | SmartAIHub Docs`}
        description={pageDescription}
        keywords={tenantPage?.metadata?.keywords || [pageTitle, "SmartAIHub docs", "skill marketplace", "workflow", "swarm execution"]}
        image={heroMediaUrl && !isVideoMediaUrl(heroMediaUrl) ? heroMediaUrl : tenantPage?.metadata?.ogImage}
        canonicalPath={`/docs/${slug}`}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: pageTitle,
          description: pageDescription,
          url: `/docs/${slug}`,
        }}
      />
      <Navbar />

      {/* Hero */}
      <section className="relative pt-28 pb-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 via-transparent to-transparent" />
        <div className="absolute top-20 left-1/4 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute top-32 right-1/3 w-64 h-64 bg-teal-500/8 rounded-full blur-3xl" />

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl"
          >
            <Link href="/docs" className="inline-flex items-center gap-1 text-sm text-primary hover:underline no-underline mb-4">
              <ArrowLeft className="w-4 h-4" />
              Back to Documentation
            </Link>
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                <Book className="w-3 h-3" />
                Docs
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold mt-4">
              {pageTitle}
            </h1>
          </motion.div>
        </div>
      </section>

      {/* Main content with sidebar */}
      <section className="pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-[260px_1fr] gap-8">
            {/* Sidebar */}
            <motion.aside
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="hidden lg:block"
            >
              <div className="sticky top-24 space-y-6">
                {sidebarSections.map((section) => (
                  <div key={section.title}>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      {section.title}
                    </h4>
                    <ul className="space-y-1">
                      {section.items.map((item) => {
                        const isActive = item.slug === slug;
                        return (
                          <li key={item.slug}>
                            <Link
                              href={`/docs/${item.slug}`}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm no-underline transition-all ${
                                isActive
                                  ? 'bg-primary/10 text-primary font-medium'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                              }`}
                            >
                              <item.icon className="w-4 h-4" />
                              {item.title}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </motion.aside>

            {/* Content */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="min-w-0"
            >
              {/* Mobile nav */}
              <div className="lg:hidden mb-6 flex flex-wrap gap-2">
                {sidebarSections.flatMap((s) => s.items).map((item) => (
                  <Link
                    key={item.slug}
                    href={`/docs/${item.slug}`}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium no-underline transition-colors ${
                      item.slug === slug
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {item.title}
                  </Link>
                ))}
              </div>

              <div className="glass-card rounded-2xl p-6 sm:p-8 lg:p-10">
              {heroMediaUrl && (
                <div className="mb-6 overflow-hidden rounded-2xl border border-border/60 bg-background">
                  {heroMediaType === "video" || isVideoMediaUrl(heroMediaUrl) ? (
                    <video src={heroMediaUrl} controls className="w-full max-h-[420px] object-cover" />
                  ) : (
                    <img src={heroMediaUrl} alt={pageTitle} className="w-full max-h-[420px] object-cover" />
                  )}
                </div>
              )}
              <div
                className="prose prose-lg max-w-none
                    prose-headings:font-bold prose-headings:tracking-tight
                    prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4
                    prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3
                    prose-p:text-muted-foreground prose-p:leading-relaxed
                    prose-li:text-muted-foreground
                    prose-strong:text-foreground
                    prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                    prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
                    prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border/50 prose-pre:rounded-xl
                    prose-ul:space-y-1 prose-ol:space-y-1"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(pageBody, { ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','a','ul','ol','li','strong','em','b','i','code','pre','blockquote','img','br','hr','span','div','table','thead','tbody','tr','th','td'], ALLOWED_ATTR: ['href','src','alt','class','target','rel','id'] }) }}
                />
              </div>

              {relatedLinks.length > 0 && (
                <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50/60 p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600 mb-2">Related links</p>
                  <h2 className="text-xl font-bold text-foreground mb-3">Explore the next intent cluster</h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {relatedLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="group flex items-center justify-between rounded-xl border border-white/70 bg-white px-4 py-3 no-underline hover:border-blue-200 hover:bg-blue-50 transition-colors"
                      >
                        <span className="text-sm font-medium text-foreground group-hover:text-primary">{link.label}</span>
                        <ChevronRight className="w-4 h-4 text-primary" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="mt-8 flex justify-between">
                {(() => {
                  const allItems = sidebarSections.flatMap((s) => s.items);
                  const currentIndex = allItems.findIndex((i) => i.slug === slug);
                  const prev = currentIndex > 0 ? allItems[currentIndex - 1] : null;
                  const next = currentIndex < allItems.length - 1 ? allItems[currentIndex + 1] : null;

                  return (
                    <>
                      {prev ? (
                        <Link href={`/docs/${prev.slug}`} className="glass-card rounded-xl px-5 py-3 flex items-center gap-2 text-sm no-underline hover:shadow-lg transition-shadow">
                          <ArrowLeft className="w-4 h-4" />
                          {prev.title}
                        </Link>
                      ) : (
                        <div />
                      )}
                      {next ? (
                        <Link href={`/docs/${next.slug}`} className="glass-card rounded-xl px-5 py-3 flex items-center gap-2 text-sm no-underline hover:shadow-lg transition-shadow">
                          {next.title}
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      ) : (
                        <div />
                      )}
                    </>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

export default function DocPage() {
  const [, params] = useRoute('/docs/:slug+');
  const slug = params?.["slug+"] || 'intro';

  // key={slug} forces re-mount when navigating between doc pages
  return <DocPageInner key={slug} slug={slug} />;
}
