/**
 * Seed core public pages for smartaihub.app tenant
 * Run: npx tsx scripts/seed-smartaihub-public-pages.ts
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { tenants, tenantPages } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec123@localhost:5432/smartspec";

const pages = [
  {
    pageKey: "home",
    title: "Home",
    slug: "home",
    sortOrder: 1,
    metadata: {
      description: "SmartAIHub is an enterprise skill marketplace with virtual workflows and swarm execution for chat, presentation, and video outputs.",
      keywords: ["SmartAIHub", "skill marketplace", "virtual workflows", "swarm execution", "chat output", "presentation output", "video output", "enterprise AI"],
    },
    content: `<section class="hero">
  <h1>Skill marketplace. Virtual workflows. Swarm execution.</h1>
  <p>SmartAIHub helps teams package reusable skills and deliver chat, presentation, and video outputs from one enterprise platform.</p>
</section>
<section class="content">
  <h2>What makes SmartAIHub different</h2>
  <ul>
    <li>Publish skills once and reuse them everywhere</li>
    <li>Compose workflows with approvals and routing</li>
    <li>Run coordinated swarms for higher quality output</li>
  </ul>
</section>`,
  },
  {
    pageKey: "features",
    title: "Features",
    slug: "features",
    sortOrder: 2,
    metadata: {
      description: "Explore SmartAIHub enterprise capabilities for skill publishing, workflow orchestration, swarm governance, and output delivery.",
      keywords: ["SmartAIHub features", "skill marketplace", "workflow orchestration", "swarm governance", "enterprise capabilities", "chat output", "presentation output", "video output"],
    },
    content: `<section class="hero">
  <h1>Enterprise capabilities for skills, workflows, and swarms.</h1>
  <p>Build a repeatable capability layer with marketplace publishing, workflow orchestration, and governed execution.</p>
</section>
<section class="main">
  <div class="feature-detail">
    <h2>Skill Marketplace</h2>
    <p>Discover, publish, version, and reuse skills across teams.</p>
    <ul><li>Curated catalog</li><li>Versioning</li><li>Ownership metadata</li></ul>
  </div>
  <div class="feature-detail">
    <h2>Virtual Workflow Builder</h2>
    <p>Turn prompts into governed processes with triggers, approvals, and routing.</p>
    <ul><li>Triggers</li><li>Branching</li><li>Reusable graphs</li></ul>
  </div>
  <div class="feature-detail">
    <h2>Swarm Governance</h2>
    <p>Coordinate multiple skills with logs, guardrails, and policy controls.</p>
    <ul><li>Audit logs</li><li>RBAC</li><li>Policy checkpoints</li></ul>
  </div>
</section>
<section class="additional">
  <h2>More ways to deliver</h2>
  <h3>Chat</h3><p>Conversational output grounded in workflow context.</p>
  <h3>Presentation</h3><p>Slide-ready narratives from the same run.</p>
  <h3>Video</h3><p>Scripts and scene plans for video delivery.</p>
</section>
<section class="cta">
  <h2>Build once. Reuse everywhere.</h2>
  <p>Package a skill, connect it to a workflow, and reuse the result across the organization.</p>
</section>`,
  },
  {
    pageKey: "pricing",
    title: "Pricing",
    slug: "pricing",
    sortOrder: 3,
    metadata: {
      description: "Flexible SmartAIHub pricing for teams that need enterprise skill automation, workflow runs, and white-label deployment.",
      keywords: ["SmartAIHub pricing", "enterprise AI pricing", "skill automation", "workflow runs", "credit packages", "white-label deployment"],
    },
    content: `<section class="hero">
  <h1>Simple pricing for enterprise skill automation.</h1>
  <p>Choose the amount of capacity you need. Every plan includes marketplace access, workflows, and swarm execution.</p>
</section>
<section class="pricing-info">
  <p>All plans include the same feature set.</p>
  <p>Plans scale by credits, support level, and white-label needs.</p>
</section>
<section class="faq">
  <dt>What are credits?</dt><dd>Credits are used for AI operations and workflow runs.</dd>
  <dt>Can I change plans later?</dt><dd>Yes, you can upgrade or downgrade at any time.</dd>
</section>
<section class="cta">
  <h2>Need a custom solution?</h2>
  <p>Talk to us about enterprise branding, domain admin controls, and white-label deployments.</p>
</section>`,
  },
  {
    pageKey: "contact",
    title: "Contact",
    slug: "contact",
    sortOrder: 4,
    metadata: {
      description: "Contact SmartAIHub for enterprise support, product questions, pricing, and partnership discussions.",
      keywords: ["contact SmartAIHub", "enterprise support", "sales inquiry", "partnership", "technical support", "pricing questions"],
    },
    content: `<section class="hero">
  <h1>Contact SmartAIHub</h1>
  <p>Talk to our team about marketplace setup, workflow design, and enterprise deployments.</p>
</section>
<section class="content">
  <h2>Support channels</h2>
  <ul>
    <li>Email: support@smartaihub.app</li>
    <li>Sales: contact form for enterprise questions</li>
    <li>Docs: browse the documentation for implementation details</li>
  </ul>
</section>`,
  },
];

async function seed() {
  const sql = postgres(DATABASE_URL);
  const db = drizzle(sql);

  try {
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

    for (const page of pages) {
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
        await db
          .update(tenantPages)
          .set({
            title: page.title,
            content: page.content,
            metadata: page.metadata,
            isPublished: true,
            updatedAt: new Date(),
          })
          .where(eq(tenantPages.id, existing.id));
        console.log(`Updated: ${page.pageKey}`);
      } else {
        await db.insert(tenantPages).values({
          tenantId: tenant.id as any,
          pageKey: page.pageKey,
          title: page.title,
          slug: page.slug,
          content: page.content,
          metadata: page.metadata,
          isPublished: true,
          showInMenu: true,
          sortOrder: page.sortOrder,
        });
        console.log(`Created: ${page.pageKey}`);
      }
    }

    console.log("\nDone! Core public pages seeded for smartaihub.app");
  } catch (error) {
    console.error("Seed error:", error);
  } finally {
    await sql.end();
  }
}

seed();
