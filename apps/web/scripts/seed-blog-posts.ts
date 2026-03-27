import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import { tenants, blogPosts, seoMetadata } from "../drizzle/schema";
import { extraBlogBlueprints } from "./smartaihub-content-blueprints";
import { buildSmartAiHubRelatedLinks } from "../shared/smartaihubDiscovery";
import { pingSmartAiHubSearchEngines } from "../server/services/sitemapPing";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec123@localhost:5432/smartspec";
const sql = postgres(DATABASE_URL);

type BlogSeed = {
  slug: string;
  title: string;
  excerpt: string;
  metaDescription: string;
  metaKeywords: string;
  content: string;
  coverImage: string;
  author: string;
  authorAvatar: string;
  category: string;
  tags: string[];
  readTime: string;
  isPublished: boolean;
  isFeatured: boolean;
};

const posts: BlogSeed[] = [
  {
    slug: "site-index-internal-linking",
    title: "Site Index Internal Linking for AI Search",
    excerpt: "See how a public site index helps SmartAIHub distribute authority across docs, blog posts, and FAQ pages.",
    metaDescription: "Learn how SmartAIHub uses a site index and internal linking to distribute authority across docs, blog posts, and FAQ pages.",
    metaKeywords: "site index, internal linking, AI search, SmartAIHub resources, sitemap strategy, crawl optimization",
    content: `<h2>Why a site index matters</h2>
<p>A strong site index helps users and search engines move through related content faster. For SmartAIHub, that means linking the marketplace, docs, blog, and FAQ pages as one connected system.</p>

<h3>What to include</h3>
<ul>
  <li>Core pages that define the product</li>
  <li>Docs clusters for each major intent</li>
  <li>Blog posts for long-tail discovery</li>
  <li>FAQ pages that answer common questions directly</li>
</ul>

<p>The result is better crawl coverage, stronger internal relevance, and more chances to match AI search queries.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "SEO",
    tags: ["site index", "internal linking", "crawl optimization"],
    readTime: "4 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "faq-seo-long-tail-strategy",
    title: "FAQ SEO Strategy: Capture Long-Tail Queries at Scale",
    excerpt: "Build FAQ pages that own specific questions and improve AI answer visibility across the site.",
    metaDescription: "Build SmartAIHub FAQ pages that target long-tail queries and improve AI answer visibility across the site.",
    metaKeywords: "FAQ SEO, long-tail queries, SmartAIHub FAQ, AI answer optimization, question pages, search intent",
    content: `<h2>FAQ pages are search magnets</h2>
<p>When each FAQ page answers one topic cluster, SmartAIHub can win more long-tail searches without making every page feel repetitive.</p>

<h3>FAQ page checklist</h3>
<ul>
  <li>Use exact question phrasing in the heading</li>
  <li>Answer in clear, concise language first</li>
  <li>Add supporting examples and related links</li>
</ul>

<p>Pair the FAQ with a docs page and a blog post to create a small cluster that reinforces the same intent from different angles.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "SEO",
    tags: ["faq seo", "long-tail keywords", "search intent"],
    readTime: "4 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "enterprise-image-prompt-engineering",
    title: "Enterprise Image Prompt Engineering: Brand-Safe Visuals at Scale",
    excerpt: "Learn how to produce brand-safe AI images with reusable prompts, rules, and workflow steps.",
    metaDescription: "Learn how SmartAIHub produces brand-safe AI images with reusable prompts, rules, and workflow steps.",
    metaKeywords: "enterprise image prompt engineering, AI image generation, SmartAIHub images, brand-safe prompts, visual workflow",
    content: `<h2>Prompts should carry brand rules</h2>
<p>SmartAIHub can turn image generation into a repeatable process by packaging style guidance, format instructions, and approval rules into a reusable workflow.</p>

<h3>Prompt recipe</h3>
<ul>
  <li>Subject and composition</li>
  <li>Style, lighting, and camera language</li>
  <li>Brand-safe constraints and exclusions</li>
</ul>

<p>This makes image generation more consistent across blog art, docs illustrations, and marketplace assets.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "Tutorial",
    tags: ["image prompt engineering", "brand-safe visuals", "generation"],
    readTime: "5 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "video-production-pipeline-for-public-content",
    title: "Video Production Pipeline for Public Content Teams",
    excerpt: "Turn workflow output into scripts, scenes, and publishable video assets for marketing and docs.",
    metaDescription: "Turn SmartAIHub workflow output into scripts, scenes, and publishable video assets for marketing and docs.",
    metaKeywords: "video production pipeline, public content video, SmartAIHub video, script to scene, content team workflow",
    content: `<h2>From workflow result to video asset</h2>
<p>SmartAIHub can convert one output into a production-ready video brief by packaging the script, scene list, voiceover notes, and asset checklist in one place.</p>

<h3>Pipeline stages</h3>
<ol>
  <li>Extract the core message from the workflow</li>
  <li>Split it into scenes and narration beats</li>
  <li>Attach production notes and visual references</li>
</ol>

<p>That gives content teams a repeatable way to scale videos alongside docs and blog content.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "Tutorial",
    tags: ["video pipeline", "content team", "workflow output"],
    readTime: "5 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "enterprise-skill-marketplace",
    title: "Enterprise Skill Marketplace: How Teams Reuse AI Skills",
    excerpt: "Learn how SmartAIHub turns reusable capabilities into a governed marketplace for enterprise teams.",
    metaDescription: "Learn how SmartAIHub turns reusable capabilities into a governed skill marketplace for enterprise teams.",
    metaKeywords: "SmartAIHub skill marketplace, AI skills marketplace, enterprise AI reuse, publish reusable skills, skill governance",
    content: `<h2>Why a skill marketplace matters</h2>
<p>Enterprise teams move faster when expertise is packaged once and reused everywhere. SmartAIHub gives you a governed skill marketplace where teams can publish, version, discover, and reuse capabilities without rebuilding the same work over and over.</p>

<h3>What belongs in the marketplace</h3>
<ul>
  <li><strong>Domain skills</strong> for research, writing, analysis, and planning</li>
  <li><strong>Media skills</strong> for images, presentations, and video output</li>
  <li><strong>Operational skills</strong> for routing, approvals, and automation</li>
</ul>

<h3>Enterprise advantages</h3>
<ul>
  <li>Version control for published skills</li>
  <li>Ownership and approval metadata</li>
  <li>Reuse across chat, workflow, and output surfaces</li>
</ul>

<p>When you combine the marketplace with search-friendly metadata, SmartAIHub becomes easier to discover both for users and AI systems.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "News",
    tags: ["skill marketplace", "enterprise reuse", "governance"],
    readTime: "4 min read",
    isPublished: true,
    isFeatured: true,
  },
  {
    slug: "virtual-workflow-builder",
    title: "Virtual Workflow Builder: Turn Prompts into Repeatable Processes",
    excerpt: "See how virtual workflows transform one prompt into a governed process with routing, approvals, and reusable outputs.",
    metaDescription: "See how SmartAIHub virtual workflows transform one prompt into a governed process with routing, approvals, and reusable outputs.",
    metaKeywords: "virtual workflow builder, SmartAIHub workflows, AI workflow automation, prompt to process, workflow orchestration",
    content: `<h2>From prompt to process</h2>
<p>SmartAIHub virtual workflows connect a skill marketplace, context, and governance into a repeatable system. Instead of starting from scratch every time, teams can reuse a proven process and keep quality consistent.</p>

<h3>Workflow building blocks</h3>
<ul>
  <li>Triggers that start the right run</li>
  <li>Routing that sends work to the right skill</li>
  <li>Approvals that keep enterprise operations safe</li>
  <li>Outputs that can become chat, presentation, or video</li>
</ul>

<h3>Best use cases</h3>
<p>Content briefs, customer responses, internal research, launch plans, and any repeatable task that benefits from structure.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "Tutorial",
    tags: ["workflow", "automation", "orchestration"],
    readTime: "5 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "swarm-execution",
    title: "Swarm Execution: Run Multiple Skills in Parallel",
    excerpt: "Discover how swarm execution combines multiple specialist skills to create stronger outputs faster.",
    metaDescription: "Discover how SmartAIHub swarm execution combines multiple specialist skills to create stronger outputs faster.",
    metaKeywords: "swarm execution, parallel AI skills, SmartAIHub orchestration, multi-agent workflows, enterprise AI output",
    content: `<h2>Why swarms outperform single runs</h2>
<p>When several specialist skills work in parallel, the platform can compare perspectives, merge the strongest signals, and return a more complete outcome. That is the core value of swarm execution in SmartAIHub.</p>

<h3>What a swarm can do</h3>
<ul>
  <li>Research multiple angles at once</li>
  <li>Draft alternative outputs in parallel</li>
  <li>Merge the best result into a final deliverable</li>
</ul>

<h3>Practical result</h3>
<p>Teams get faster turnaround without sacrificing quality, especially when chat, slides, and video all need to be derived from the same source of truth.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "Guide",
    tags: ["swarm", "parallel processing", "multi-agent"],
    readTime: "4 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "chat-to-presentation-video",
    title: "From Chat to Presentation to Video: One Workflow, Three Outputs",
    excerpt: "Learn how one SmartAIHub workflow can power chat answers, presentation decks, and video production cues.",
    metaDescription: "Learn how one SmartAIHub workflow can power chat answers, presentation decks, and video production cues.",
    metaKeywords: "chat to presentation, presentation to video, SmartAIHub outputs, multi-format AI content, output delivery",
    content: `<h2>One source, many surfaces</h2>
<p>A SmartAIHub workflow can start with a question in chat, then branch into a presentation-ready narrative, and finally produce a video brief or production plan. That gives teams more leverage from every run.</p>

<h3>Output layers</h3>
<ul>
  <li><strong>Chat</strong> for interactive answers</li>
  <li><strong>Presentation</strong> for slides and executive updates</li>
  <li><strong>Video</strong> for scripts, scenes, and media production</li>
</ul>

<p>The same upstream context can feed multiple deliverables, which is exactly what makes the platform valuable for enterprise content operations.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "Tutorial",
    tags: ["chat", "presentation", "video"],
    readTime: "4 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "ai-governance-security",
    title: "AI Governance and Security for Enterprise Skill Platforms",
    excerpt: "Protect keys, control access, and keep an audit trail while scaling AI skills across the organization.",
    metaDescription: "Protect keys, control access, and keep an audit trail while scaling AI skills across the organization with SmartAIHub.",
    metaKeywords: "AI governance, enterprise security, SmartAIHub security, API key protection, audit logs, MFA",
    content: `<h2>Security is part of the product</h2>
<p>Enterprise AI adoption needs more than capability. It needs control. SmartAIHub is built to support API key hygiene, MFA, audit logs, role-based access, and tenant-aware governance.</p>

<h3>Recommended controls</h3>
<ul>
  <li>Keep secrets out of client-side code</li>
  <li>Rotate keys on a schedule</li>
  <li>Review audit logs regularly</li>
  <li>Use least-privilege access for each role</li>
</ul>

<p>The result is a platform that is easier to trust at scale, especially when teams are publishing and running reusable skills.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "Security",
    tags: ["security", "governance", "audit"],
    readTime: "4 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "ai-search-optimization-for-docs",
    title: "AI Search Optimization for Docs and Blog Pages",
    excerpt: "Use structured data, keyword clusters, and page-level intent mapping to improve discovery across the site.",
    metaDescription: "Use structured data, keyword clusters, and page-level intent mapping to improve SmartAIHub discovery across docs and blog pages.",
    metaKeywords: "AI search optimization, docs SEO, blog SEO, SmartAIHub keywords, structured data, AI discoverability",
    content: `<h2>Search engines and AI answer engines both need clarity</h2>
<p>SmartAIHub can win more searches when each page targets a different intent cluster. That means your docs should not all read like API reference pages, and your blog should not repeat the same keyword set everywhere.</p>

<h3>What to optimize</h3>
<ul>
  <li>One main topic per page</li>
  <li>Supporting keywords in headings and prose</li>
  <li>FAQ and HowTo schema where appropriate</li>
  <li>Real tenant data instead of placeholder text</li>
</ul>

<p>This approach helps traditional search engines and AI answer systems understand what SmartAIHub does, who it helps, and how each page fits into the overall platform.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "Guide",
    tags: ["seo", "ai search", "docs", "blog"],
    readTime: "5 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "prompt-packaging-for-teams",
    title: "Prompt Packaging for Teams: Reusable Templates that Scale",
    excerpt: "Build prompt packages that can be reused across teams, brands, and output formats without starting over.",
    metaDescription: "Build reusable prompt packages in SmartAIHub so teams can scale prompts across brands, workflows, and output formats.",
    metaKeywords: "prompt packaging, reusable prompts, SmartAIHub templates, team workflows, enterprise prompt library",
    content: `<h2>Prompts should be treated like products</h2>
<p>When teams package prompts into reusable skills, they gain consistency, discoverability, and better control over quality. SmartAIHub makes that process easier by pairing prompts with metadata, versioning, and workflow context.</p>

<h3>What to include</h3>
<ul>
  <li>Clear task definition</li>
  <li>Expected output format</li>
  <li>Context and constraints</li>
  <li>Examples and approval rules</li>
</ul>

<p>That turns one-off prompting into a scalable internal capability that can be shared across teams.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "Guide",
    tags: ["prompt engineering", "templates", "reuse"],
    readTime: "4 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "workflow-marketplace-operations",
    title: "Workflow Marketplace Operations: Publishing, Discovery, and Support",
    excerpt: "A practical look at how to manage publishing, discovery, support, and lifecycle operations in SmartAIHub.",
    metaDescription: "A practical look at how to manage publishing, discovery, support, and lifecycle operations in SmartAIHub.",
    metaKeywords: "workflow marketplace operations, SmartAIHub publishing, skill discovery, support workflows, lifecycle management",
    content: `<h2>Operations is where the platform becomes repeatable</h2>
<p>Publishing a skill is only the first step. Teams also need discoverability, version lifecycle management, support documentation, and clear ownership. SmartAIHub organizes those pieces so the marketplace can scale cleanly.</p>

<h3>Operational checklist</h3>
<ul>
  <li>Publish with the right tags and descriptions</li>
  <li>Document the workflow inputs and outputs</li>
  <li>Route support questions to the right owner</li>
  <li>Track updates in changelog and blog posts</li>
</ul>

<p>That creates a platform that is useful for operators, not just builders.</p>`,
    coverImage: "",
    author: "SmartAIHub Team",
    authorAvatar: "",
    category: "Product Update",
    tags: ["operations", "marketplace", "support"],
    readTime: "4 min read",
    isPublished: true,
    isFeatured: false,
  },
  ...extraBlogBlueprints,
];

async function seed() {
  const db = drizzle(sql);
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.primaryDomain, "smartaihub.app"))
    .limit(1);

  if (!tenant) {
    console.error("Tenant smartaihub.app not found!");
    await sql.end();
    process.exit(1);
  }

  const tenantId = tenant.id;

  async function upsertSeo(post: BlogSeed) {
    const path = `/blog/${post.slug}`;
    const relatedLinks = buildSmartAiHubRelatedLinks(path, post.title, post.metaKeywords.split(",").map((value) => value.trim()).filter(Boolean));
    const [existing] = await db
      .select()
      .from(seoMetadata)
      .where(and(eq(seoMetadata.tenantId, tenantId), eq(seoMetadata.path, path)))
      .limit(1);

    const seoPayload = {
      title: `${post.title} | SmartAIHub Blog`,
      description: post.metaDescription || post.excerpt,
      keywords: post.metaKeywords.split(",").map((value) => value.trim()).filter(Boolean),
      canonicalUrl: path,
      ogMetadata: {
        title: `${post.title} | SmartAIHub Blog`,
        description: post.metaDescription || post.excerpt,
        image: "/images/og-image.png",
        type: "article",
        url: path,
      },
      twitterMetadata: {
        card: "summary_large_image" as const,
        title: `${post.title} | SmartAIHub Blog`,
        description: post.metaDescription || post.excerpt,
        image: "/images/og-image.png",
      },
      aiContent: {
        context: post.metaDescription,
        keyFacts: [
          post.excerpt,
          post.tags.join(", "),
          "SmartAIHub blog post",
        ],
        entities: relatedLinks.map((link) => ({
          name: link.label,
          type: "WebPage",
          description: link.description,
          sameAs: [link.href],
        })),
      },
      qualitySignals: {
        citations: relatedLinks.map((link) => link.href),
      },
      structuredData: {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.metaDescription || post.excerpt,
        url: path,
      },
      isActive: true,
    };

    if (existing) {
      await db.update(seoMetadata).set({
        ...seoPayload,
        updatedAt: new Date(),
      }).where(eq(seoMetadata.id, existing.id));
      return "updated";
    }

    await db.insert(seoMetadata).values({
      tenantId,
      path,
      ...seoPayload,
    });
    return "created";
  }

  for (const post of posts) {
    const [existing] = await db
      .select()
      .from(blogPosts)
      .where(
        and(
          eq(blogPosts.tenantId, tenantId),
          eq(blogPosts.slug, post.slug),
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(blogPosts)
        .set({
          title: post.title,
          excerpt: post.excerpt,
          content: post.content,
          coverImage: post.coverImage,
          author: post.author,
          authorAvatar: post.authorAvatar,
          category: post.category,
          tags: post.tags,
          readTime: post.readTime,
          isPublished: post.isPublished,
          isFeatured: post.isFeatured,
          metaDescription: post.metaDescription,
          metaKeywords: post.metaKeywords,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(blogPosts.id, existing.id));
      console.log(`Updated: ${post.slug}`);
    } else {
      await db.insert(blogPosts).values({
        tenantId,
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        coverImage: post.coverImage,
        author: post.author,
        authorAvatar: post.authorAvatar,
        category: post.category,
        tags: post.tags,
        readTime: post.readTime,
        isPublished: post.isPublished,
        isFeatured: post.isFeatured,
        metaDescription: post.metaDescription,
        metaKeywords: post.metaKeywords,
        publishedAt: new Date(),
      });
      console.log(`Created: ${post.slug}`);
    }

    const seoResult = await upsertSeo(post);
    console.log(`SEO ${seoResult}: ${post.slug}`);
  }

  await pingSmartAiHubSearchEngines(tenant.primaryDomain || "smartaihub.app").catch(() => {});
  await sql.end();
  console.log("Done seeding blog posts.");
}

seed().catch((e) => { console.error(e); process.exit(1); });
