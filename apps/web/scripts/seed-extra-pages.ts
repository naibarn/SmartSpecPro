/**
 * Seed extra pages (about, changelog, careers, etc.) for smartaihub.app tenant
 * Run: npx tsx scripts/seed-extra-pages.ts
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { tenants, tenantPages } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec123@localhost:5432/smartspec";

const pages = [
  {
    pageKey: "about",
    title: "About Us",
    slug: "about",
    sortOrder: 5,
    metadata: {
      description: "About SmartAIHub: a skill marketplace with virtual workflows, swarm execution, and enterprise-grade output delivery.",
      keywords: ["About SmartAIHub", "skill marketplace", "virtual workflows", "swarm execution", "enterprise AI"],
    },
    content: `<section class="doc-content">
  <h1>About Smart AI Hub</h1>
  <p>SmartAIHub is a skill marketplace for enterprise teams. We help organizations publish reusable skills, connect them into virtual workflows, and run swarms that deliver chat, presentation, and video outputs.</p>

  <h2>Our Mission</h2>
  <p>Our mission is to make AI capabilities reusable, governed, and easy to deploy across teams and tenants.</p>

  <h2>What Makes Us Different</h2>
  <ul>
    <li><strong>Skill Marketplace</strong> — Publish and discover reusable skills in a governed catalog</li>
    <li><strong>Virtual Workflow Builder</strong> — Turn prompts into repeatable enterprise processes</li>
    <li><strong>Swarm Execution</strong> — Coordinate multiple skills to reach a better outcome</li>
    <li><strong>Enterprise Security</strong> — Bank-grade encryption, MFA, and comprehensive audit logs</li>
    <li><strong>API Access</strong> — Integrate AI generation into your own applications</li>
  </ul>

  <h2>Our Values</h2>
  <h3>Innovation</h3>
  <p>We continuously improve the platform so teams can ship faster without rebuilding workflows from scratch.</p>

  <h3>Accessibility</h3>
  <p>We design for operators, creators, and approvers alike. No custom plumbing required to get value.</p>

  <h3>Quality</h3>
  <p>Every published skill and workflow should be predictable, reusable, and easy to measure.</p>

  <h2>Contact Us</h2>
  <p>Have questions or want to learn more? Visit our <a href="/contact">contact page</a>.</p>
</section>`,
  },
  {
    pageKey: "changelog",
    title: "Changelog",
    slug: "changelog",
    sortOrder: 20,
    metadata: {
      description: "Latest SmartAIHub product updates, documentation improvements, and enterprise feature releases.",
      keywords: ["SmartAIHub changelog", "product updates", "documentation hub", "enterprise features", "workflow execution"],
    },
    content: `<section class="doc-content">
  <h1>Smart AI Hub Changelog</h1>
  <p>Stay up to date with the latest platform, workflow, and enterprise improvements.</p>

  <h2>January 2026</h2>
  <ul>
    <li><strong>Documentation Hub</strong> — SmartAIHub docs now cover skills, workflows, and swarms</li>
    <li><strong>Theme Presets</strong> — Enterprise color presets for tenant branding</li>
    <li><strong>Content Editor</strong> — Improved editing experience with instant preview</li>
  </ul>

  <h2>December 2025</h2>
  <ul>
    <li><strong>Marketplace</strong> — Skill publishing, discovery, and reuse workflows</li>
    <li><strong>Multi-Tenant System</strong> — Custom domains, branding, and user management</li>
    <li><strong>Swarm Execution</strong> — Coordinated run support for enterprise outputs</li>
  </ul>

  <h2>November 2025</h2>
  <ul>
    <li><strong>Flexible Pricing</strong> — Subscription, agency, and one-time credit packages</li>
    <li><strong>Output Surfaces</strong> — Chat, presentation, and video delivery lanes</li>
    <li><strong>Gallery System</strong> — Share and discover outputs across tenants</li>
    <li><strong>Skill Library</strong> — Reusable capabilities for teams and agencies</li>
  </ul>

  <p>Follow our <a href="/blog">blog</a> for detailed release notes.</p>
</section>`,
  },
  {
    pageKey: "careers",
    title: "Careers",
    slug: "careers",
    sortOrder: 21,
    metadata: {
      description: "Careers at SmartAIHub for engineers, designers, and product builders working on AI orchestration.",
      keywords: ["SmartAIHub careers", "AI orchestration jobs", "enterprise AI", "product design", "full stack engineering"],
    },
    content: `<section class="doc-content">
  <h1>Careers at Smart AI Hub</h1>
  <p>We're building the future of enterprise skill orchestration. Join us if you want to shape how teams package and run AI capabilities.</p>

  <h2>Why Smart AI Hub?</h2>
  <ul>
    <li><strong>Cutting-Edge AI</strong> — Work on skills, workflows, and swarm execution</li>
    <li><strong>Real Impact</strong> — Your work helps teams ship repeatable outcomes</li>
    <li><strong>Growth</strong> — Continuous learning and career development</li>
    <li><strong>Remote-Friendly</strong> — Flexible working hours and locations</li>
  </ul>

  <h2>Open Positions</h2>
  <h3>Engineering</h3>
  <ul>
    <li><strong>Senior Full-Stack Engineer</strong> — TypeScript, React, Node.js</li>
    <li><strong>ML/AI Engineer</strong> — Model integration, inference optimization</li>
    <li><strong>DevOps Engineer</strong> — Kubernetes, Docker, cloud infrastructure</li>
  </ul>

  <h3>Design & Product</h3>
  <ul>
    <li><strong>Senior Product Designer</strong> — UI/UX for AI tools</li>
    <li><strong>Product Manager</strong> — AI products, user research</li>
  </ul>

  <h2>Apply</h2>
  <p>Send your resume via our <a href="/contact">contact page</a>. Tell us what excites you about AI creativity!</p>
</section>`,
  },
  {
    pageKey: "community",
    title: "Community",
    slug: "community",
    sortOrder: 22,
    metadata: {
      description: "Join the SmartAIHub community for skill sharing, workflow patterns, and output inspiration.",
      keywords: ["SmartAIHub community", "skill sharing", "workflow patterns", "output inspiration", "enterprise builders"],
    },
    content: `<section class="doc-content">
  <h1>Smart AI Hub Community</h1>
  <p>Join a growing community of operators, builders, and creators who are turning skills into reusable enterprise workflows.</p>

  <h2>Get Involved</h2>
  <h3>Gallery</h3>
  <p>Browse and share AI-generated images, videos, and more in our <a href="/gallery">public gallery</a>. Get inspired and showcase your best work.</p>

  <h3>Learn & Share</h3>
  <ul>
    <li>Share skill and workflow patterns</li>
    <li>Discover reusable automation ideas</li>
    <li>Get feedback on outputs and orchestration</li>
  </ul>

  <h2>Community Guidelines</h2>
  <ul>
    <li><strong>Be Respectful</strong> — Treat everyone with kindness</li>
    <li><strong>Share Knowledge</strong> — Help others learn and grow</li>
    <li><strong>Create Responsibly</strong> — Follow content policies</li>
  </ul>
</section>`,
  },
  {
    pageKey: "support",
    title: "Support",
    slug: "support",
    sortOrder: 23,
    metadata: {
      description: "Support resources for SmartAIHub covering docs, billing, keys, workflows, and output troubleshooting.",
      keywords: ["SmartAIHub support", "workflow troubleshooting", "billing help", "API keys", "enterprise support"],
    },
    content: `<section class="doc-content">
  <h1>Smart AI Hub Support</h1>
  <p>We're here to help you get the most out of the platform, from publishing skills to running enterprise workflows.</p>

  <h2>Support Options</h2>
  <h3>Documentation</h3>
  <p>Start with our <a href="/docs">comprehensive docs</a> for quick answers on all features.</p>

  <h3>Contact Us</h3>
  <p><a href="/contact">Contact our team</a> for personalized support. We respond within 24 hours.</p>

  <h2>Common Topics</h2>
  <ul>
    <li><strong>Account & Billing</strong> — Manage subscriptions and credits in Settings</li>
    <li><strong>API Access</strong> — Generate keys at Settings → API Keys</li>
    <li><strong>Image Generation</strong> — See <a href="/docs/image-generation">Image Generation docs</a></li>
    <li><strong>Video Generation</strong> — See <a href="/docs/video-generation">Video Generation docs</a></li>
    <li><strong>Workflows</strong> — Learn how to package reusable skills</li>
  </ul>

  <h2>System Status</h2>
  <p>Check our <a href="/status">status page</a> for real-time platform health.</p>
</section>`,
  },
  {
    pageKey: "status",
    title: "System Status",
    slug: "status",
    sortOrder: 24,
    metadata: {
      description: "Real-time SmartAIHub system status for web, API, marketplace, workflows, and swarm orchestration.",
      keywords: ["SmartAIHub status", "platform health", "workflow execution", "swarm orchestration", "API status"],
    },
    content: `<section class="doc-content">
  <h1>Smart AI Hub — System Status</h1>
  <p>All systems are currently <strong>operational</strong>.</p>

  <h3>Services</h3>
  <ul>
    <li><strong>Web Application</strong> — Operational</li>
    <li><strong>API</strong> — Operational</li>
    <li><strong>Marketplace</strong> — Operational</li>
    <li><strong>Workflow Execution</strong> — Operational</li>
    <li><strong>Swarm Orchestration</strong> — Operational</li>
    <li><strong>Authentication</strong> — Operational</li>
  </ul>

  <h2>Uptime</h2>
  <p>We maintain 99.9% uptime across all services.</p>

  <h2>Report an Issue</h2>
  <p>Experiencing problems? <a href="/contact">Contact support</a> immediately.</p>
</section>`,
  },
  {
    pageKey: "security",
    title: "Security",
    slug: "security",
    sortOrder: 25,
    metadata: {
      description: "Security overview for SmartAIHub enterprise encryption, MFA, access control, and audit readiness.",
      keywords: ["SmartAIHub security", "enterprise encryption", "MFA", "access control", "audit readiness"],
    },
    content: `<section class="doc-content">
  <h1>Security at Smart AI Hub</h1>
  <p>Your data, skills, and workflow outputs are protected with enterprise-grade security measures.</p>

  <h2>Data Protection</h2>
  <ul>
    <li><strong>Encryption in Transit</strong> — TLS 1.3 for all connections</li>
    <li><strong>Encryption at Rest</strong> — AES-256 for stored data</li>
    <li><strong>Data Ownership</strong> — Your content belongs to you</li>
    <li><strong>No Training</strong> — We don't use your content to train models without consent</li>
  </ul>

  <h2>Authentication & Access</h2>
  <ul>
    <li>Multi-Factor Authentication (MFA) with TOTP</li>
    <li>OAuth sign-in (Google, GitHub)</li>
    <li>Secure session management</li>
    <li>Role-based access control</li>
  </ul>

  <h2>Infrastructure</h2>
  <ul>
    <li>Enterprise-grade cloud hosting</li>
    <li>DDoS protection and rate limiting</li>
    <li>Regular security audits</li>
    <li>Automated vulnerability scanning</li>
  </ul>

  <h2>Reporting Vulnerabilities</h2>
  <p>Found a security issue? Report it through our <a href="/contact">contact page</a>.</p>

  <p>For detailed guidelines, see <a href="/docs/security/best-practices">Security Best Practices</a>.</p>
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

    console.log("\nDone! Extra pages seeded for smartaihub.app");
  } catch (error) {
    console.error("Seed error:", error);
  } finally {
    await sql.end();
  }
}

seed();
