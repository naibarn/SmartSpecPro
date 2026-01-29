import postgres from "postgres";

const sql = postgres("postgresql://smartspec:smartspec_dev@localhost:5432/smartspec");

const tenantId = "tenant-ZCSKEM9s";

const posts = [
  {
    slug: "introducing-smart-ai-hub",
    title: "Introducing Smart AI Hub: Your All-in-One AI Creative Platform",
    excerpt: "We're excited to launch Smart AI Hub — a unified platform for AI-powered image, video, and audio generation with enterprise-grade features.",
    content: `<h2>Welcome to Smart AI Hub</h2>
<p>We're thrilled to announce the launch of <strong>Smart AI Hub</strong>, a comprehensive platform that brings together the best AI models for creative content generation.</p>

<h3>What You Can Create</h3>
<ul>
<li><strong>Images</strong> — Generate stunning visuals with FLUX, Stable Diffusion, and more</li>
<li><strong>Videos</strong> — Create professional video content with cutting-edge AI models</li>
<li><strong>Audio</strong> — Text-to-speech, music generation, and sound effects</li>
<li><strong>Code</strong> — AI-assisted code generation and refactoring</li>
</ul>

<h3>Built for Teams</h3>
<p>Smart AI Hub is designed from the ground up for team collaboration. Share projects, manage credits across your organization, and maintain brand consistency with shared style presets.</p>

<h3>Enterprise-Ready</h3>
<p>With multi-tenant architecture, SSO integration, audit logs, and granular access controls, Smart AI Hub meets the security and compliance requirements of modern enterprises.</p>

<blockquote><p>The future of creative work is AI-augmented. Smart AI Hub puts the power of dozens of AI models at your fingertips.</p></blockquote>

<p>Ready to get started? <a href="/signup">Create your free account</a> and start generating today.</p>`,
    coverImage: "",
    author: "Smart AI Hub Team",
    authorAvatar: "",
    category: "News",
    tags: ["launch", "platform", "ai"],
    readTime: "3 min read",
    isPublished: true,
    isFeatured: true,
  },
  {
    slug: "getting-started-with-image-generation",
    title: "Getting Started with AI Image Generation",
    excerpt: "Learn how to create your first AI-generated image using Smart AI Hub's Media Studio with step-by-step instructions.",
    content: `<h2>Your First AI Image</h2>
<p>Creating images with AI has never been easier. This guide walks you through generating your first image on Smart AI Hub.</p>

<h3>Step 1: Open Media Studio</h3>
<p>Navigate to <a href="/media-studio">Media Studio</a> from the sidebar. Select <strong>Image Generation</strong> as your creation type.</p>

<h3>Step 2: Choose a Model</h3>
<p>We offer several models optimized for different use cases:</p>
<ul>
<li><strong>FLUX</strong> — Best for photorealistic images and complex scenes</li>
<li><strong>Stable Diffusion XL</strong> — Great all-rounder with fast generation</li>
<li><strong>DALL-E 3</strong> — Excellent for creative and artistic styles</li>
</ul>

<h3>Step 3: Write Your Prompt</h3>
<p>Be specific and descriptive. Good prompts include:</p>
<ul>
<li>Subject and action</li>
<li>Style and mood</li>
<li>Lighting and composition</li>
<li>Technical details (resolution, aspect ratio)</li>
</ul>

<h3>Example Prompt</h3>
<pre><code>A serene mountain lake at sunset, golden hour lighting,
reflection on calm water, pine forest in background,
photorealistic, 4K, cinematic composition</code></pre>

<h3>Step 4: Generate and Iterate</h3>
<p>Click <strong>Generate</strong> and wait a few seconds. You can refine your results by adjusting the prompt, changing the model, or tweaking advanced settings like guidance scale and seed.</p>

<p>Happy creating!</p>`,
    coverImage: "",
    author: "Smart AI Hub Team",
    authorAvatar: "",
    category: "Tutorial",
    tags: ["tutorial", "image-generation", "getting-started"],
    readTime: "4 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "api-key-security-best-practices",
    title: "API Key Security: Best Practices for Developers",
    excerpt: "Keep your API keys safe with these essential security practices for integrating Smart AI Hub into your applications.",
    content: `<h2>Protecting Your API Keys</h2>
<p>API keys are the gateway to your Smart AI Hub account. Treating them with care is essential to prevent unauthorized usage and unexpected charges.</p>

<h3>Never Expose Keys in Client-Side Code</h3>
<p>Your API key should <strong>never</strong> appear in frontend JavaScript, mobile app bundles, or public repositories. Always make API calls from your server.</p>

<h3>Use Environment Variables</h3>
<pre><code># .env (never commit this file)
SMARTAIHUB_API_KEY=sk-your-secret-key-here</code></pre>

<h3>Rotate Keys Regularly</h3>
<p>Generate new API keys periodically and revoke old ones. You can manage your keys from the <a href="/settings">Settings</a> page.</p>

<h3>Set Usage Limits</h3>
<p>Configure spending alerts and hard limits in your account settings to prevent runaway costs if a key is compromised.</p>

<h3>Monitor Usage</h3>
<p>Review your API usage logs regularly. Unusual spikes in traffic may indicate a compromised key.</p>

<h3>Key Security Checklist</h3>
<ul>
<li>Store keys in environment variables or a secrets manager</li>
<li>Add <code>.env</code> to your <code>.gitignore</code></li>
<li>Use separate keys for development and production</li>
<li>Enable MFA on your Smart AI Hub account</li>
<li>Set up billing alerts</li>
</ul>`,
    coverImage: "",
    author: "Smart AI Hub Team",
    authorAvatar: "",
    category: "Security",
    tags: ["security", "api", "best-practices"],
    readTime: "3 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "whats-new-january-2025",
    title: "What's New: January 2025 Platform Updates",
    excerpt: "Video generation improvements, new audio models, enhanced Media Studio UI, and more in this month's update.",
    content: `<h2>January 2025 Updates</h2>
<p>Here's a roundup of everything new on Smart AI Hub this month.</p>

<h3>Video Generation Improvements</h3>
<p>We've upgraded our video pipeline with faster processing and higher resolution output. Videos now render up to <strong>2x faster</strong> with improved frame consistency.</p>

<h3>New Audio Models</h3>
<p>Two new text-to-speech voices are now available, along with an experimental music generation model that creates royalty-free background tracks.</p>

<h3>Media Studio UX Overhaul</h3>
<p>The Media Studio has been redesigned with a cleaner layout, better prompt editing, and a new gallery view for browsing your generation history.</p>

<h3>Credit System Updates</h3>
<ul>
<li>New flexible packages for teams of all sizes</li>
<li>Volume discounts for enterprise customers</li>
<li>Transparent per-model pricing in the dashboard</li>
</ul>

<h3>Bug Fixes</h3>
<ul>
<li>Fixed image download issues on Safari</li>
<li>Resolved timeout errors for long video generations</li>
<li>Fixed gallery pagination on mobile devices</li>
</ul>

<p>Questions or feedback? <a href="/contact">Reach out to our team</a>.</p>`,
    coverImage: "",
    author: "Smart AI Hub Team",
    authorAvatar: "",
    category: "Product Update",
    tags: ["product-update", "changelog"],
    readTime: "3 min read",
    isPublished: true,
    isFeatured: false,
  },
  {
    slug: "prompt-engineering-guide",
    title: "The Complete Guide to Prompt Engineering for AI Image Generation",
    excerpt: "Master the art of writing effective prompts to get better results from AI image generation models.",
    content: `<h2>Why Prompts Matter</h2>
<p>The quality of your AI-generated images depends heavily on how you write your prompts. A well-crafted prompt can be the difference between a mediocre result and a stunning masterpiece.</p>

<h3>Anatomy of a Good Prompt</h3>
<p>Effective prompts typically include these elements:</p>
<ol>
<li><strong>Subject</strong> — What is the main focus?</li>
<li><strong>Style</strong> — What artistic style? (photorealistic, watercolor, anime, etc.)</li>
<li><strong>Composition</strong> — How should it be framed? (close-up, wide angle, bird's eye)</li>
<li><strong>Lighting</strong> — What mood? (golden hour, dramatic, soft, studio)</li>
<li><strong>Details</strong> — Colors, textures, atmosphere</li>
</ol>

<h3>Prompt Formulas</h3>
<p>Try this structure as a starting point:</p>
<pre><code>[Subject] in [setting], [style], [lighting], [camera angle], [quality modifiers]</code></pre>

<h3>Quality Modifiers That Work</h3>
<ul>
<li><code>highly detailed</code>, <code>4K</code>, <code>8K</code></li>
<li><code>cinematic lighting</code>, <code>volumetric fog</code></li>
<li><code>sharp focus</code>, <code>depth of field</code></li>
<li><code>award-winning photography</code></li>
</ul>

<h3>Common Mistakes</h3>
<ul>
<li>Being too vague — "a dog" vs "a golden retriever puppy playing in autumn leaves"</li>
<li>Conflicting instructions — "dark moody lighting, bright and cheerful"</li>
<li>Too many subjects — focus on one main element</li>
</ul>

<h3>Negative Prompts</h3>
<p>Most models support negative prompts to exclude unwanted elements. Common negative prompt terms: <code>blurry, low quality, distorted, watermark, text</code></p>

<p>Practice makes perfect. Experiment with different styles and save your best prompts for reuse!</p>`,
    coverImage: "",
    author: "Smart AI Hub Team",
    authorAvatar: "",
    category: "Guide",
    tags: ["guide", "prompts", "image-generation", "tips"],
    readTime: "5 min read",
    isPublished: true,
    isFeatured: false,
  },
];

async function seed() {
  for (const post of posts) {
    await sql`
      INSERT INTO blog_posts ("tenantId", slug, title, excerpt, content, "coverImage", author, "authorAvatar", category, tags, "readTime", "isPublished", "isFeatured", "publishedAt", "createdAt", "updatedAt")
      VALUES (
        ${tenantId}, ${post.slug}, ${post.title}, ${post.excerpt}, ${post.content},
        ${post.coverImage}, ${post.author}, ${post.authorAvatar}, ${post.category},
        ${JSON.stringify(post.tags)}::json, ${post.readTime}, ${post.isPublished}, ${post.isFeatured},
        NOW(), NOW(), NOW()
      )
      ON CONFLICT DO NOTHING
    `;
    console.log(`Seeded: ${post.slug}`);
  }
  await sql.end();
  console.log("Done seeding blog posts.");
}

seed().catch((e) => { console.error(e); process.exit(1); });
