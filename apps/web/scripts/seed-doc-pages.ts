/**
 * Seed documentation pages for smartaihub.app tenant
 * Run: npx tsx scripts/seed-doc-pages.ts
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { tenants, tenantPages } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec";

const docPages = [
  {
    pageKey: "docs-intro",
    title: "Docs: Introduction",
    slug: "docs-intro",
    sortOrder: 10,
    content: `<section class="doc-content">
  <h1>Welcome to Smart AI Hub</h1>
  <p>Smart AI Hub is your all-in-one AI creative platform. Generate stunning images, videos, music, and more with cutting-edge AI models — all from a single dashboard.</p>
  <h3>What You Can Do</h3>
  <ul>
    <li><strong>Create Images</strong> — Generate photorealistic images, illustrations, and artwork using FLUX, Nano Banana, and other top models.</li>
    <li><strong>Produce Videos</strong> — Create high-quality videos with Wan 2.6, Kling, Runway, and Veo 3.1.</li>
    <li><strong>Generate Music</strong> — Compose original tracks with Suno AI in any genre.</li>
    <li><strong>Generate Code</strong> — Transform ideas into production-ready code with AI assistance.</li>
    <li><strong>Text-to-Speech</strong> — Convert text to natural-sounding speech in multiple languages.</li>
  </ul>
  <h3>Getting Started</h3>
  <p>Create your free account, grab some credits, and start creating. Check the <a href="/docs/quickstart">Quick Start</a> guide for step-by-step instructions.</p>
</section>`,
  },
  {
    pageKey: "docs-quickstart",
    title: "Docs: Quick Start",
    slug: "docs-quickstart",
    sortOrder: 11,
    content: `<section class="doc-content">
  <h1>Quick Start — Smart AI Hub</h1>
  <p>Start creating AI-generated content in minutes.</p>
  <h3>Step 1: Create Your Account</h3>
  <p>Sign up at <a href="/signup">Smart AI Hub</a>. New accounts receive free credits to explore the platform.</p>
  <h3>Step 2: Choose Your Tool</h3>
  <p>From the dashboard, select <strong>Media Studio</strong> to access image, video, and audio generation tools.</p>
  <h3>Step 3: Generate Your First Image</h3>
  <p>Select an image model (e.g., FLUX Pro), type a descriptive prompt like "a futuristic cityscape at sunset, photorealistic", and click Generate.</p>
  <h3>Step 4: Explore More</h3>
  <ul>
    <li>Try <strong>Video Generation</strong> with Wan 2.6 or Kling</li>
    <li>Create <strong>Music</strong> with Suno AI</li>
    <li>Use the <strong>API</strong> for programmatic access</li>
  </ul>
</section>`,
  },
  {
    pageKey: "docs-concepts",
    title: "Docs: Core Concepts",
    slug: "docs-concepts",
    sortOrder: 12,
    content: `<section class="doc-content">
  <h1>Core Concepts</h1>
  <h3>Credits</h3>
  <p>Credits are the currency of Smart AI Hub. Each AI generation consumes credits based on the model and output quality. Purchase credit packages or subscribe to a plan for the best value.</p>
  <h3>Models</h3>
  <p>We offer a curated selection of AI models for different creative tasks — image generators like FLUX and Stable Diffusion, video models like Wan 2.6 and Kling, music with Suno AI, and more.</p>
  <h3>Prompts</h3>
  <p>The quality of your output depends on your prompt. Be specific about style, mood, composition, and technical details. Use the prompt guide in each tool for tips.</p>
  <h3>Media Studio</h3>
  <p>The unified workspace where you access all AI generation tools. Switch between image, video, audio, and code generation from a single interface.</p>
  <h3>Gallery</h3>
  <p>All your generated content is saved to your gallery. Browse, download, share, or use outputs as inputs for further generation.</p>
</section>`,
  },
  {
    pageKey: "docs-auth",
    title: "Docs: Authentication",
    slug: "docs-auth",
    sortOrder: 13,
    content: `<section class="doc-content">
  <h1>Authentication</h1>
  <h3>API Keys</h3>
  <p>Generate API keys from <strong>Settings → API Keys</strong> in your dashboard. Use these for programmatic access to all Smart AI Hub services.</p>
  <ul>
    <li>Keep API keys secret — never expose them in client-side code</li>
    <li>Use environment variables to store keys securely</li>
    <li>Create separate keys for development and production</li>
  </ul>
  <h3>OAuth Sign-In</h3>
  <p>Sign in quickly with Google, GitHub, or other supported providers. No password needed.</p>
  <h3>Multi-Factor Authentication</h3>
  <p>Enable MFA in your account settings for an extra layer of security. We support TOTP authenticator apps like Google Authenticator and Authy.</p>
  <h3>Session Security</h3>
  <p>Sessions are managed via secure HTTP-only cookies with automatic expiration. Review active sessions in your security settings.</p>
</section>`,
  },
  {
    pageKey: "docs-code-generation",
    title: "Docs: Code Generation",
    slug: "docs-code-generation",
    sortOrder: 14,
    content: `<section class="doc-content">
  <h1>Code Generation</h1>
  <p>Smart AI Hub includes powerful code generation capabilities powered by leading AI models.</p>
  <h3>How It Works</h3>
  <p>Describe what you want to build in natural language. The AI generates complete, functional code with proper error handling, types, and documentation.</p>
  <h3>Supported Languages</h3>
  <ul>
    <li>TypeScript / JavaScript</li>
    <li>Python</li>
    <li>Go, Rust, Java, and more</li>
  </ul>
  <h3>Use Cases</h3>
  <ul>
    <li>Generate REST APIs and microservices</li>
    <li>Create React/Vue/Angular components</li>
    <li>Write database schemas and migrations</li>
    <li>Build automation scripts</li>
  </ul>
  <h3>Tips</h3>
  <p>Be specific about requirements, specify frameworks and versions, and always review generated code before deploying to production.</p>
</section>`,
  },
  {
    pageKey: "docs-image-generation",
    title: "Docs: Image Generation",
    slug: "docs-image-generation",
    sortOrder: 15,
    content: `<section class="doc-content">
  <h1>Image Generation</h1>
  <p>Create stunning images from text descriptions using our curated collection of AI models.</p>
  <h3>Available Models</h3>
  <ul>
    <li><strong>FLUX Pro</strong> — State-of-the-art photorealistic and artistic image generation</li>
    <li><strong>FLUX Schnell</strong> — Fast generation for quick iterations</li>
    <li><strong>Nano Banana</strong> — Specialized creative model</li>
    <li><strong>Stable Diffusion XL</strong> — Versatile generation with fine control</li>
  </ul>
  <h3>Prompt Guide</h3>
  <ul>
    <li>Be descriptive — include details about style, lighting, composition, and mood</li>
    <li>Use style references like "photorealistic", "digital art", "oil painting", "anime"</li>
    <li>Specify aspect ratios: portrait (2:3), landscape (16:9), square (1:1)</li>
    <li>Use negative prompts to exclude unwanted elements</li>
  </ul>
  <h3>Advanced Features</h3>
  <p>Use image-to-image for variations, inpainting for targeted edits, and upscaling for higher resolution outputs.</p>
</section>`,
  },
  {
    pageKey: "docs-video-generation",
    title: "Docs: Video Generation",
    slug: "docs-video-generation",
    sortOrder: 16,
    content: `<section class="doc-content">
  <h1>Video Generation</h1>
  <p>Create professional-quality videos with AI — from short clips to creative productions.</p>
  <h3>Available Models</h3>
  <ul>
    <li><strong>Wan 2.6</strong> — Text-to-video and image-to-video with excellent quality</li>
    <li><strong>Kling</strong> — High-fidelity video generation with consistent motion</li>
    <li><strong>Runway Gen-3</strong> — Creative video with advanced style control</li>
    <li><strong>Veo 3.1</strong> — Google's latest video generation model</li>
  </ul>
  <h3>Use Cases</h3>
  <ul>
    <li>Social media content and reels</li>
    <li>Marketing and promotional videos</li>
    <li>Product demonstrations</li>
    <li>Creative storytelling and animations</li>
  </ul>
  <h3>Tips</h3>
  <p>Start with 3-5 second clips to iterate on prompts. Use image-to-video for more control over the starting frame. Describe motion and camera angles in your prompt.</p>
</section>`,
  },
  {
    pageKey: "docs-audio",
    title: "Docs: Audio & Speech",
    slug: "docs-audio",
    sortOrder: 17,
    content: `<section class="doc-content">
  <h1>Audio & Speech</h1>
  <p>Generate speech, music, and sound effects with Smart AI Hub audio tools.</p>
  <h3>Text-to-Speech</h3>
  <p>Convert text to natural-sounding speech in multiple languages and voices. Customize tone, speed, and emphasis for the perfect narration.</p>
  <h3>Music Generation with Suno AI</h3>
  <p>Create original music tracks by describing the genre, mood, instruments, and style. Suno AI generates full songs with vocals and instrumentals.</p>
  <h3>Tips for Music</h3>
  <ul>
    <li>Specify genre: pop, jazz, electronic, orchestral, lo-fi, etc.</li>
    <li>Describe mood: upbeat, melancholic, energetic, calm</li>
    <li>Mention instruments: piano, guitar, synth, drums</li>
    <li>Set duration constraints for your needs</li>
  </ul>
  <h3>Use Cases</h3>
  <ul>
    <li>Background music for videos</li>
    <li>Podcast intros and outros</li>
    <li>Voice-over narration</li>
    <li>Sound effects for content</li>
  </ul>
</section>`,
  },
  {
    pageKey: "docs-security-best-practices",
    title: "Docs: Security Best Practices",
    slug: "docs-security-best-practices",
    sortOrder: 18,
    content: `<section class="doc-content">
  <h1>Security Best Practices</h1>
  <p>Keep your Smart AI Hub account and API access secure by following these guidelines.</p>
  <h3>API Key Security</h3>
  <ul>
    <li>Never hardcode API keys in source code or commit them to repositories</li>
    <li>Use environment variables or secret managers (AWS Secrets Manager, Vault)</li>
    <li>Rotate keys periodically — at least every 90 days</li>
    <li>Use separate keys for development and production environments</li>
    <li>Set IP allowlists when possible</li>
  </ul>
  <h3>Account Security</h3>
  <ul>
    <li>Enable Multi-Factor Authentication (MFA) immediately after signup</li>
    <li>Use a strong, unique password (16+ characters recommended)</li>
    <li>Review login history and active sessions regularly</li>
    <li>Revoke access for unused OAuth integrations</li>
  </ul>
  <h3>Data Protection</h3>
  <ul>
    <li>All data encrypted in transit (TLS 1.3) and at rest (AES-256)</li>
    <li>Generated content is accessible only by your account</li>
    <li>We do not use your content to train models without explicit consent</li>
    <li>You can delete your data at any time from account settings</li>
  </ul>
  <h3>Audit Logs</h3>
  <p>Monitor all API and account activity through the audit log in your dashboard. Track access patterns and detect anomalies early.</p>
</section>`,
  },
];

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
          isPublished: true,
          showInMenu: true,
          sortOrder: page.sortOrder,
        });
        console.log(`Created: ${page.pageKey}`);
      }
    }

    console.log("\nDone! All 9 doc pages seeded for smartaihub.app");
  } catch (error) {
    console.error("Seed error:", error);
  } finally {
    await sql.end();
  }
}

seed();
