/**
 * Seed documentation pages for smartaihub.app tenant
 * Run: npx tsx scripts/seed-doc-pages.ts
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { tenants, tenantPages } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec123@localhost:5432/smartspec";

const docPages = [
  {
    pageKey: "docs-getting-started",
    title: "Docs: Getting Started",
    slug: "docs-getting-started",
    sortOrder: 10,
    content: `<section class="doc-content">
  <h1>Getting Started</h1>
  <p>Start with a skill, connect it to a virtual workflow, and run it as a swarm that produces chat, presentation, or video output.</p>
  <h3>First steps</h3>
  <ul>
    <li>Browse the Marketplace</li>
    <li>Publish or reuse a skill</li>
    <li>Run your first workflow</li>
  </ul>
</section>`,
  },
  {
    pageKey: "docs-api",
    title: "Docs: API Reference",
    slug: "docs-api",
    sortOrder: 11,
    content: `<section class="doc-content">
  <h1>API Reference</h1>
  <p>Use the SmartAIHub API to discover skills, start workflows, and track execution results.</p>
  <h3>Core areas</h3>
  <ul>
    <li>Marketplace and skill discovery</li>
    <li>Workflow execution and run status</li>
    <li>Output artifact retrieval</li>
  </ul>
</section>`,
  },
  {
    pageKey: "docs-tutorials",
    title: "Docs: Tutorials",
    slug: "docs-tutorials",
    sortOrder: 12,
    content: `<section class="doc-content">
  <h1>Tutorials</h1>
  <p>Learn how to package skills, build workflows, and deliver outputs that are ready for teams.</p>
  <ul>
    <li>Create a knowledge assistant</li>
    <li>Turn an answer into a presentation</li>
    <li>Generate a video brief from workflow output</li>
  </ul>
</section>`,
  },
  {
    pageKey: "docs-videos",
    title: "Docs: Video Guides",
    slug: "docs-videos",
    sortOrder: 13,
    content: `<section class="doc-content">
  <h1>Video Guides</h1>
  <p>Watch walkthroughs for the marketplace, workflow builder, swarm execution, and output delivery surfaces.</p>
</section>`,
  },
  {
    pageKey: "docs-intro",
    title: "Docs: Introduction",
    slug: "docs-intro",
    sortOrder: 14,
    content: `<section class="doc-content">
  <h1>Welcome to SmartAIHub</h1>
  <p>SmartAIHub is a skill marketplace with virtual workflows and swarm execution for enterprise teams.</p>
  <ul>
    <li><strong>Skills</strong> — Reusable capabilities you can publish and reuse</li>
    <li><strong>Workflows</strong> — Governed execution paths for repeatable outcomes</li>
    <li><strong>Swarms</strong> — Coordinated runs that merge the best results</li>
  </ul>
</section>`,
  },
  {
    pageKey: "docs-quickstart",
    title: "Docs: Quick Start",
    slug: "docs-quickstart",
    sortOrder: 15,
    content: `<section class="doc-content">
  <h1>Quick Start</h1>
  <ol>
    <li>Create an account</li>
    <li>Pick a skill from the Marketplace</li>
    <li>Connect the skill to a workflow</li>
    <li>Run the workflow and review the output</li>
  </ol>
</section>`,
  },
  {
    pageKey: "docs-concepts",
    title: "Docs: Core Concepts",
    slug: "docs-concepts",
    sortOrder: 16,
    content: `<section class="doc-content">
  <h1>Core Concepts</h1>
  <h3>Skills</h3>
  <p>Reusable capabilities that can be published, versioned, and discovered.</p>
  <h3>Workflows</h3>
  <p>Structured execution paths that combine skills, approvals, and routing.</p>
  <h3>Swarms</h3>
  <p>Multiple coordinated runs that produce a stronger final result.</p>
</section>`,
  },
  {
    pageKey: "docs-auth",
    title: "Docs: Authentication",
    slug: "docs-auth",
    sortOrder: 17,
    content: `<section class="doc-content">
  <h1>Authentication</h1>
  <p>Use API keys for programmatic access and MFA for operator accounts.</p>
  <ul>
    <li>Keep keys in secret managers</li>
    <li>Rotate keys on a schedule</li>
    <li>Separate keys by environment</li>
  </ul>
</section>`,
  },
  {
    pageKey: "docs-code-generation",
    title: "Docs: Code Generation",
    slug: "docs-code-generation",
    sortOrder: 18,
    content: `<section class="doc-content">
  <h1>Code Generation</h1>
  <p>Use skills to generate code for integrations, orchestration, and supporting services.</p>
</section>`,
  },
  {
    pageKey: "docs-image-generation",
    title: "Docs: Image Generation",
    slug: "docs-image-generation",
    sortOrder: 19,
    content: `<section class="doc-content">
  <h1>Image Generation</h1>
  <p>Create images when a workflow needs visual assets for chat, decks, or campaigns.</p>
</section>`,
  },
  {
    pageKey: "docs-video-generation",
    title: "Docs: Video Generation",
    slug: "docs-video-generation",
    sortOrder: 20,
    content: `<section class="doc-content">
  <h1>Video Generation</h1>
  <p>Convert workflow output into scripts, scenes, and production cues for video delivery.</p>
</section>`,
  },
  {
    pageKey: "docs-audio",
    title: "Docs: Audio & Speech",
    slug: "docs-audio",
    sortOrder: 21,
    content: `<section class="doc-content">
  <h1>Audio & Speech</h1>
  <p>Generate narration, voice prompts, and supporting audio when the workflow needs spoken output.</p>
</section>`,
  },
  {
    pageKey: "docs-security-best-practices",
    title: "Docs: Security Best Practices",
    slug: "docs-security-best-practices",
    sortOrder: 22,
    content: `<section class="doc-content">
  <h1>Security Best Practices</h1>
  <p>Protect keys, lock down access, and monitor audit logs for every tenant.</p>
  <ul>
    <li>Use separate keys for each environment</li>
    <li>Require MFA for privileged users</li>
    <li>Review audit logs regularly</li>
  </ul>
</section>`,
  },
  {
    pageKey: "docs-api-rest",
    title: "Docs: REST API",
    slug: "docs-api-rest",
    sortOrder: 23,
    content: `<section class="doc-content">
  <h1>REST API</h1>
  <p>The REST API lets you start runs, poll status, and retrieve output artifacts.</p>
</section>`,
  },
  {
    pageKey: "docs-sdk-python",
    title: "Docs: Python SDK",
    slug: "docs-sdk-python",
    sortOrder: 24,
    content: `<section class="doc-content">
  <h1>Python SDK</h1>
  <p>Integrate SmartAIHub into backend services, notebooks, and automation jobs.</p>
</section>`,
  },
  {
    pageKey: "docs-sdk-javascript",
    title: "Docs: JavaScript SDK",
    slug: "docs-sdk-javascript",
    sortOrder: 25,
    content: `<section class="doc-content">
  <h1>JavaScript SDK</h1>
  <p>Use the JavaScript SDK in web apps and serverless functions to launch workflows.</p>
</section>`,
  },
  {
    pageKey: "docs-webhooks",
    title: "Docs: Webhooks",
    slug: "docs-webhooks",
    sortOrder: 26,
    content: `<section class="doc-content">
  <h1>Webhooks</h1>
  <p>Receive execution updates and artifact notifications in real time.</p>
</section>`,
  },
  {
    pageKey: "docs-security-api-keys",
    title: "Docs: API Keys",
    slug: "docs-security-api-keys",
    sortOrder: 27,
    content: `<section class="doc-content">
  <h1>API Keys</h1>
  <p>Generate keys with the minimum access needed and rotate them regularly.</p>
</section>`,
  },
  {
    pageKey: "docs-security-mfa",
    title: "Docs: MFA Setup",
    slug: "docs-security-mfa",
    sortOrder: 28,
    content: `<section class="doc-content">
  <h1>MFA Setup</h1>
  <p>Enable multi-factor authentication for every account with elevated access.</p>
</section>`,
  },
  {
    pageKey: "docs-security-audit",
    title: "Docs: Audit Logs",
    slug: "docs-security-audit",
    sortOrder: 29,
    content: `<section class="doc-content">
  <h1>Audit Logs</h1>
  <p>Review who published skills, ran workflows, and accessed outputs.</p>
</section>`,
  },
];

const docPageMetadata: Record<string, { description: string; keywords: string[] }> = {
  "docs-getting-started": {
    description: "Get started with SmartAIHub by publishing a skill, composing a workflow, and running a swarm for chat, presentation, or video output.",
    keywords: ["SmartAIHub getting started", "skill marketplace onboarding", "workflow quickstart", "swarm execution basics", "chat output", "presentation output", "video output"],
  },
  "docs-api": {
    description: "Learn the SmartAIHub API for discovering skills, launching workflows, and tracking execution results across the enterprise platform.",
    keywords: ["SmartAIHub API", "skills API", "workflow API", "swarm API", "enterprise developer docs", "AI orchestration API"],
  },
  "docs-tutorials": {
    description: "Step-by-step tutorials for skill publishing, workflow composition, and converting swarm output into decks and videos.",
    keywords: ["SmartAIHub tutorials", "workflow tutorials", "skill publishing tutorial", "presentation generation tutorial", "video workflow tutorial"],
  },
  "docs-videos": {
    description: "Video guides that walk through the marketplace, workflow builder, swarm execution, and output delivery surfaces.",
    keywords: ["SmartAIHub video guides", "workflow demo", "marketplace walkthrough", "swarm execution video", "output delivery"],
  },
  "docs-intro": {
    description: "Introduction to SmartAIHub as a skill marketplace with virtual workflows and swarm execution for enterprise teams.",
    keywords: ["SmartAIHub introduction", "skill marketplace overview", "workflow orchestration", "swarm execution", "enterprise AI platform"],
  },
  "docs-quickstart": {
    description: "Quick start guide for creating an account, picking a skill, building a workflow, and running a swarm.",
    keywords: ["SmartAIHub quick start", "publish a skill", "create workflow", "run a swarm", "enterprise AI onboarding"],
  },
  "docs-concepts": {
    description: "Core concepts behind skills, workflows, swarms, outputs, and tenant architecture in SmartAIHub.",
    keywords: ["SmartAIHub concepts", "skills workflows swarms", "output surfaces", "tenant architecture", "enterprise orchestration"],
  },
  "docs-auth": {
    description: "Authentication guidance for API keys, MFA, and secure access across SmartAIHub enterprise workspaces.",
    keywords: ["SmartAIHub authentication", "API keys", "MFA setup", "enterprise security", "workspace access"],
  },
  "docs-code-generation": {
    description: "Use SmartAIHub to generate integration code, orchestration glue, and supporting services from natural language.",
    keywords: ["SmartAIHub code generation", "AI developer tools", "prompt to code", "integration automation", "workflow code"],
  },
  "docs-image-generation": {
    description: "Create images when a workflow needs visual assets for chat, slides, campaigns, or marketing output.",
    keywords: ["SmartAIHub image generation", "visual assets", "presentation graphics", "creative workflow", "AI design"],
  },
  "docs-video-generation": {
    description: "Turn workflow output into scripts, scenes, and production cues for AI-powered video delivery.",
    keywords: ["SmartAIHub video generation", "video scripts", "scene planning", "content production", "AI video workflow"],
  },
  "docs-audio": {
    description: "Generate narration, voice prompts, speech, and supporting audio when a workflow needs spoken output.",
    keywords: ["SmartAIHub audio", "text to speech", "voice workflow", "speech generation", "AI audio"],
  },
  "docs-security-best-practices": {
    description: "Security best practices for key management, MFA, audit logs, and enterprise governance in SmartAIHub.",
    keywords: ["SmartAIHub security", "API key management", "MFA", "audit logs", "enterprise governance"],
  },
  "docs-api-rest": {
    description: "REST API documentation for starting runs, polling status, and retrieving workflow output artifacts.",
    keywords: ["SmartAIHub REST API", "workflow execution API", "run status", "output artifacts", "enterprise automation"],
  },
  "docs-sdk-python": {
    description: "Python SDK guide for backend services, notebooks, and automation jobs that launch SmartAIHub workflows.",
    keywords: ["SmartAIHub Python SDK", "backend integration", "automation jobs", "workflow clients", "enterprise AI SDK"],
  },
  "docs-sdk-javascript": {
    description: "JavaScript SDK guide for web apps and serverless functions that need to launch SmartAIHub workflows.",
    keywords: ["SmartAIHub JavaScript SDK", "web integration", "serverless workflows", "frontend agents", "AI SDK"],
  },
  "docs-webhooks": {
    description: "Webhooks for run completion, failure, and artifact notifications in event-driven SmartAIHub workflows.",
    keywords: ["SmartAIHub webhooks", "run notifications", "artifact callbacks", "event-driven workflows", "enterprise integrations"],
  },
  "docs-security-api-keys": {
    description: "API key management guide for least-privilege access, rotation, and secure storage.",
    keywords: ["SmartAIHub API keys", "least privilege", "key rotation", "secret manager", "enterprise access"],
  },
  "docs-security-mfa": {
    description: "MFA setup guide for protecting elevated accounts and enterprise administration workflows.",
    keywords: ["SmartAIHub MFA", "multi-factor authentication", "admin security", "account protection", "enterprise security"],
  },
  "docs-security-audit": {
    description: "Audit log guide for reviewing who published skills, ran workflows, and accessed outputs.",
    keywords: ["SmartAIHub audit logs", "workflow auditing", "skill publishing logs", "enterprise compliance", "security review"],
  },
};

async function seed() {
  const sql = postgres(DATABASE_URL);
  const db = drizzle(sql);

  try {
    // Find the smartaihub.app tenant
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

    console.log(`Found tenant: ${tenant.name} (ID: ${tenant.id})`);

    for (const page of docPages) {
      // Check if page exists
      const [existing] = await db
        .select()
        .from(tenantPages)
        .where(
          and(
            eq(tenantPages.tenantId, tenant.id as any),
            eq(tenantPages.pageKey, page.pageKey)
          )
        )
        .limit(1);

      if (existing) {
        // Update
        await db
          .update(tenantPages)
          .set({
            title: page.title,
            content: page.content,
            metadata: docPageMetadata[page.pageKey],
            isPublished: true,
            updatedAt: new Date(),
          })
          .where(eq(tenantPages.id, existing.id));
        console.log(`Updated: ${page.pageKey}`);
      } else {
        // Insert
        await db.insert(tenantPages).values({
          tenantId: tenant.id as any,
          pageKey: page.pageKey,
          title: page.title,
          slug: page.slug,
          content: page.content,
          metadata: docPageMetadata[page.pageKey],
          isPublished: true,
          showInMenu: true,
          sortOrder: page.sortOrder,
        });
        console.log(`Created: ${page.pageKey}`);
      }
    }

    console.log("\nDone! Doc pages seeded for smartaihub.app");
  } catch (error) {
    console.error("Seed error:", error);
  } finally {
    await sql.end();
  }
}

seed();
