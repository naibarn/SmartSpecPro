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
import { useTenantPage } from '@/hooks/useTenantPage';
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
];

const defaultContent: Record<string, { title: string; body: string }> = {
  intro: {
    title: 'Introduction',
    body: `<h2>Welcome to SmartAIHub</h2>
<p>SmartAIHub is an AI-powered platform that helps you build production-ready applications faster. Whether you're generating code, creating images, producing videos, or synthesizing audio, our platform provides the tools you need.</p>
<h3>What You Can Do</h3>
<ul>
<li><strong>Generate Code</strong> — Transform natural language descriptions into production-ready code across multiple languages and frameworks.</li>
<li><strong>Create Images</strong> — Generate photorealistic images, illustrations, and artwork from text prompts.</li>
<li><strong>Produce Videos</strong> — Create high-quality video content with AI-powered generation models.</li>
<li><strong>Synthesize Audio</strong> — Generate speech, music, and sound effects with text-to-audio models.</li>
</ul>
<h3>Getting Help</h3>
<p>If you need assistance, visit our <a href="/contact">contact page</a> or check the other documentation pages for detailed guides.</p>`,
  },
  quickstart: {
    title: 'Quick Start',
    body: `<h2>Get Started in Minutes</h2>
<p>Follow these steps to start using the platform:</p>
<h3>Step 1: Create an Account</h3>
<p>Sign up at <a href="/signup">the registration page</a>. You'll get free credits to try out the platform.</p>
<h3>Step 2: Get Your API Key</h3>
<p>Navigate to <strong>Settings → API Keys</strong> in your dashboard to generate an API key.</p>
<h3>Step 3: Make Your First Request</h3>
<pre><code>curl -X POST https://api.example.com/v1/generate \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "Hello world", "model": "default"}'</code></pre>
<h3>Step 4: Explore the Dashboard</h3>
<p>Use the dashboard to manage credits, view history, and access all AI tools through a visual interface.</p>`,
  },
  concepts: {
    title: 'Core Concepts',
    body: `<h2>Core Concepts</h2>
<h3>Credits</h3>
<p>Credits are the currency used to access AI models. Different models consume different amounts of credits based on complexity and output quality.</p>
<h3>Models</h3>
<p>We provide access to a variety of AI models for different tasks — code generation, image creation, video production, and audio synthesis. Each model has its own strengths and pricing.</p>
<h3>Prompts</h3>
<p>Prompts are the instructions you give to AI models. Writing effective prompts is key to getting high-quality outputs. Be specific, provide context, and iterate on your results.</p>
<h3>Workflows</h3>
<p>Combine multiple AI operations into automated workflows. Chain models together for complex content creation pipelines.</p>
<h3>Multi-Tenant Architecture</h3>
<p>The platform supports multiple tenants with custom branding, domains, and configurations. Each tenant operates independently with its own users, settings, and content.</p>`,
  },
  auth: {
    title: 'Authentication',
    body: `<h2>Authentication</h2>
<h3>API Keys</h3>
<p>API keys provide programmatic access to the platform. Generate keys from your dashboard under <strong>Settings → API Keys</strong>.</p>
<ul>
<li>Keep your API keys secret — never expose them in client-side code</li>
<li>Use environment variables to store keys</li>
<li>Rotate keys regularly for security</li>
</ul>
<h3>OAuth Integration</h3>
<p>We support OAuth 2.0 for third-party authentication. Connect with Google, GitHub, or other providers for seamless login.</p>
<h3>Session Management</h3>
<p>Web sessions are managed via secure HTTP-only cookies. Sessions expire after a configurable period of inactivity.</p>
<h3>Multi-Factor Authentication</h3>
<p>Enable MFA in your account settings for an additional layer of security. We support TOTP-based authenticator apps.</p>`,
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
<p>Follow these guidelines to keep your account and data secure.</p>
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
<h3>Data Protection</h3>
<ul>
<li>All data is encrypted in transit (TLS 1.3) and at rest</li>
<li>Generated content is stored securely and accessible only by your account</li>
<li>We don't use your content to train models without explicit consent</li>
</ul>
<h3>Audit Logs</h3>
<p>Monitor all API activity through the audit log in your dashboard. Track who accessed what and when for complete visibility.</p>`,
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

function DocPageInner({ slug }: { slug: string }) {
  // Convert slug to pageKey: "intro" -> "docs-intro", "security/best-practices" -> "docs-security-best-practices"
  const pageKey = `docs-${slug.replace(/\//g, '-')}`;
  const { page: tenantPage, isLoading } = useTenantPage(pageKey);

  // Determine content: tenant content > default
  const tenantContent = tenantPage?.content
    ? parseHtmlContent(tenantPage.content)
    : null;

  const fallback = defaultContent[slug];
  const pageTitle = tenantContent?.title || tenantPage?.title || fallback?.title || 'Documentation';
  const pageBody = tenantContent?.body || fallback?.body || '<p>Content coming soon.</p>';

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-28 pb-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-violet-500/5 via-transparent to-transparent" />
        <div className="absolute top-20 left-1/4 w-72 h-72 bg-violet-500/10 rounded-full blur-3xl" />
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
