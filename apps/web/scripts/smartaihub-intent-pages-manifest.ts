import type { SmartAiHubContentManifest } from "../shared/smartaihubContentManifest";

const faqMarketplaceContent = `<section class="doc-content">
  <h1>Marketplace FAQ</h1>
  <p>Answers about finding, publishing, and governing reusable skills in SmartAIHub.</p>
  <h2>Common questions</h2>
  <details>
    <summary>How do I choose the right skill?</summary>
    <p>Start with the outcome you need, then filter by intent, output format, and ownership.</p>
  </details>
  <details>
    <summary>Can I publish a private skill first?</summary>
    <p>Yes. Teams can validate a skill privately, then promote it into the marketplace after review.</p>
  </details>
  <details>
    <summary>Why is marketplace metadata important?</summary>
    <p>Metadata helps people and AI systems understand what a skill does, who owns it, and when to use it.</p>
  </details>
</section>`;

const faqWorkflowContent = `<section class="doc-content">
  <h1>Workflow Builder FAQ</h1>
  <p>Learn how virtual workflows connect skills, approvals, and routing into repeatable enterprise processes.</p>
  <details>
    <summary>What is a virtual workflow?</summary>
    <p>A virtual workflow is a reusable process that orchestrates skills, context, and review steps.</p>
  </details>
  <details>
    <summary>Can a workflow trigger a swarm?</summary>
    <p>Yes. A workflow can launch multiple specialist skills in parallel and then merge the results.</p>
  </details>
  <details>
    <summary>How do I keep workflows maintainable?</summary>
    <p>Keep the flow short, label each step clearly, and separate reusable skills from orchestration logic.</p>
  </details>
</section>`;

const faqOutputContent = `<section class="doc-content">
  <h1>Output Packaging FAQ</h1>
  <p>See how SmartAIHub turns one workflow into chat answers, presentations, and video assets.</p>
  <details>
    <summary>Can one run create multiple formats?</summary>
    <p>Yes. The same run can produce a chat response, a slide outline, and a video script.</p>
  </details>
  <details>
    <summary>How do I package an output for presentation?</summary>
    <p>Structure the result into sections, bullets, and speaker notes so it can become a slide deck fast.</p>
  </details>
  <details>
    <summary>How do I package output for video?</summary>
    <p>Convert the workflow result into scenes, narration, and production cues before rendering.</p>
  </details>
</section>`;

const imagePromptContent = `<section class="doc-content">
  <h1>Image Prompt Engineering</h1>
  <p>Use prompt structure, style references, and brand guidance to generate enterprise-ready images.</p>
  <h2>Prompt pattern</h2>
  <p>Subject + style + composition + lighting + brand constraints + quality target.</p>
  <ul>
    <li>Describe the subject clearly</li>
    <li>Add style and camera cues</li>
    <li>Specify aspect ratio and output intent</li>
    <li>Use brand terms for consistency</li>
  </ul>
</section>`;

const imagePipelineContent = `<section class="doc-content">
  <h1>Image Workflow Pipeline</h1>
  <p>Turn a brief into batches of approved image assets with review, versioning, and export steps.</p>
  <h2>Recommended pipeline</h2>
  <ol>
    <li>Gather the content brief</li>
    <li>Draft the prompt set</li>
    <li>Generate several image options</li>
    <li>Review and publish the selected asset</li>
  </ol>
</section>`;

const videoPromptContent = `<section class="doc-content">
  <h1>Video Prompt Engineering</h1>
  <p>Design prompts that translate a workflow result into a clear script, scene plan, and motion direction.</p>
  <ul>
    <li>Define the audience and tone</li>
    <li>Describe scene transitions and pacing</li>
    <li>Include voiceover direction and framing</li>
    <li>Keep each scene focused on one idea</li>
  </ul>
</section>`;

const videoPipelineContent = `<section class="doc-content">
  <h1>Video Production Pipeline</h1>
  <p>Use SmartAIHub to move from workflow output to a production-ready video plan.</p>
  <h2>Pipeline stages</h2>
  <ol>
    <li>Convert run output into a script</li>
    <li>Split the script into scenes</li>
    <li>Attach visual and audio cues</li>
    <li>Produce and review the final video</li>
  </ol>
</section>`;

const seoContent = `<section class="doc-content">
  <h1>AI Search Optimization</h1>
  <p>Build pages that answer specific search intents with structured data, focused keywords, and clear entity signals.</p>
  <h2>SEO rules</h2>
  <ul>
    <li>One intent cluster per page</li>
    <li>Use exact phrases people search for</li>
    <li>Link related docs, blog, and FAQ pages together</li>
    <li>Refresh content when new keywords appear</li>
  </ul>
</section>`;

const contentFactoryContent = `<section class="doc-content">
  <h1>Content Factory</h1>
  <p>Use skill-generated manifests to create docs, FAQ, and blog pages at scale.</p>
  <h2>How it works</h2>
  <ol>
    <li>A skill writes the manifest JSON</li>
    <li>The manifest is imported into the tenant</li>
    <li>Pages are published with matching SEO metadata</li>
    <li>New keyword clusters can be added over time</li>
  </ol>
</section>`;

export const smartaihubIntentPagesManifest: SmartAiHubContentManifest = {
  tenantDomain: "smartaihub.app",
  pages: [
    {
      pageKey: "docs-faq-marketplace",
      path: "/docs/faq/marketplace",
      slug: "faq/marketplace",
      title: "Marketplace FAQ",
      description: "Answers about finding, publishing, and governing reusable skills in SmartAIHub.",
      keywords: ["SmartAIHub marketplace FAQ", "AI skill marketplace", "publish reusable skills", "skill governance", "marketplace discovery"],
      aiContext: "This page answers common marketplace questions about discovering, publishing, and governing reusable skills in SmartAIHub.",
      keyFacts: [
        "Marketplace metadata improves both human and AI discovery.",
        "Skills can be validated privately before publishing.",
        "Discovery should start from the outcome the user wants.",
      ],
      content: faqMarketplaceContent,
      faqs: [
        { question: "How do I choose the right skill?", answer: "Start with the outcome you need, then filter by intent, output format, and ownership." },
        { question: "Can I publish a private skill first?", answer: "Yes. Teams can validate a skill privately, then promote it into the marketplace after review." },
        { question: "Why is marketplace metadata important?", answer: "Metadata helps people and AI systems understand what a skill does, who owns it, and when to use it." },
      ],
      metadata: {
        description: "Answers about finding, publishing, and governing reusable skills in SmartAIHub.",
        keywords: ["SmartAIHub marketplace FAQ", "AI skill marketplace", "publish reusable skills", "skill governance"],
      },
      isPublished: true,
      showInMenu: true,
      sortOrder: 40,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "How do I choose the right skill?", acceptedAnswer: { "@type": "Answer", text: "Start with the outcome you need, then filter by intent, output format, and ownership." } },
          { "@type": "Question", name: "Can I publish a private skill first?", acceptedAnswer: { "@type": "Answer", text: "Yes. Teams can validate a skill privately, then promote it into the marketplace after review." } },
        ],
      },
    },
    {
      pageKey: "docs-faq-workflows",
      path: "/docs/faq/workflows",
      slug: "faq/workflows",
      title: "Workflow Builder FAQ",
      description: "Answers about virtual workflows, approvals, routing, and swarm execution.",
      keywords: ["SmartAIHub workflow FAQ", "virtual workflow", "workflow builder", "approval routing", "swarm execution"],
      aiContext: "This page answers common workflow questions about building repeatable orchestration paths in SmartAIHub.",
      keyFacts: [
        "A virtual workflow coordinates skills and context.",
        "Approval and routing keep automation enterprise-ready.",
        "Workflows can launch swarms for multi-step tasks.",
      ],
      content: faqWorkflowContent,
      faqs: [
        { question: "What is a virtual workflow?", answer: "A virtual workflow is a reusable process that orchestrates skills, context, and review steps." },
        { question: "Can a workflow trigger a swarm?", answer: "Yes. A workflow can launch multiple specialist skills in parallel and then merge the results." },
        { question: "How do I keep workflows maintainable?", answer: "Keep the flow short, label each step clearly, and separate reusable skills from orchestration logic." },
      ],
      metadata: {
        description: "Answers about virtual workflows, approvals, routing, and swarm execution.",
        keywords: ["SmartAIHub workflow FAQ", "virtual workflow", "workflow builder", "approval routing"],
      },
      isPublished: true,
      showInMenu: true,
      sortOrder: 41,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "What is a virtual workflow?", acceptedAnswer: { "@type": "Answer", text: "A virtual workflow is a reusable process that orchestrates skills, context, and review steps." } },
          { "@type": "Question", name: "Can a workflow trigger a swarm?", acceptedAnswer: { "@type": "Answer", text: "Yes. A workflow can launch multiple specialist skills in parallel and then merge the results." } },
        ],
      },
    },
    {
      pageKey: "docs-faq-outputs",
      path: "/docs/faq/outputs",
      slug: "faq/outputs",
      title: "Output Packaging FAQ",
      description: "Answers about chat, presentation, and video outputs generated from one workflow.",
      keywords: ["SmartAIHub output FAQ", "chat output", "presentation output", "video output", "output packaging"],
      aiContext: "This page answers common output packaging questions for SmartAIHub chat, presentation, and video delivery.",
      keyFacts: [
        "One run can create multiple output formats.",
        "Presentation output should be structured for slides.",
        "Video output should be split into scenes and cues.",
      ],
      content: faqOutputContent,
      faqs: [
        { question: "Can one run create multiple formats?", answer: "Yes. The same run can produce a chat response, a slide outline, and a video script." },
        { question: "How do I package an output for presentation?", answer: "Structure the result into sections, bullets, and speaker notes so it can become a slide deck fast." },
        { question: "How do I package output for video?", answer: "Convert the workflow result into scenes, narration, and production cues before rendering." },
      ],
      metadata: {
        description: "Answers about chat, presentation, and video outputs generated from one workflow.",
        keywords: ["SmartAIHub output FAQ", "chat output", "presentation output", "video output"],
      },
      isPublished: true,
      showInMenu: true,
      sortOrder: 42,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "Can one run create multiple formats?", acceptedAnswer: { "@type": "Answer", text: "Yes. The same run can produce a chat response, a slide outline, and a video script." } },
          { "@type": "Question", name: "How do I package an output for presentation?", acceptedAnswer: { "@type": "Answer", text: "Structure the result into sections, bullets, and speaker notes so it can become a slide deck fast." } },
        ],
      },
    },
    {
      pageKey: "docs-image-prompt-engineering",
      path: "/docs/image/prompt-engineering",
      slug: "image/prompt-engineering",
      title: "Image Prompt Engineering",
      description: "Prompt patterns for enterprise-ready AI image generation and brand-safe visual output.",
      keywords: ["AI image prompt engineering", "image prompt guide", "enterprise image generation", "brand consistency", "AI design workflow"],
      aiContext: "This page teaches image prompt engineering for SmartAIHub users who want brand-safe, enterprise-ready image generation.",
      keyFacts: [
        "Strong prompts describe subject, style, composition, and lighting.",
        "Brand terms help keep images consistent across tenants.",
        "Prompt structure improves output quality and repeatability.",
      ],
      content: imagePromptContent,
      metadata: {
        description: "Prompt patterns for enterprise-ready AI image generation and brand-safe visual output.",
        keywords: ["AI image prompt engineering", "image prompt guide", "enterprise image generation"],
      },
      isPublished: true,
      showInMenu: true,
      sortOrder: 43,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "Image Prompt Engineering",
        description: "Prompt patterns for enterprise-ready AI image generation and brand-safe visual output.",
      },
    },
    {
      pageKey: "docs-image-workflow-pipeline",
      path: "/docs/image/workflow-pipeline",
      slug: "image/workflow-pipeline",
      title: "Image Workflow Pipeline",
      description: "A repeatable workflow for brief, prompt, generation, review, and export of image assets.",
      keywords: ["image workflow pipeline", "AI image workflow", "batch image generation", "prompt workflow", "asset review"],
      aiContext: "This page explains how SmartAIHub can automate image production as a workflow with review and export steps.",
      keyFacts: [
        "Image production improves when brief and review are separated.",
        "Batch generation helps teams compare multiple outputs.",
        "Workflow outputs should be versioned before publishing.",
      ],
      content: imagePipelineContent,
      metadata: {
        description: "A repeatable workflow for brief, prompt, generation, review, and export of image assets.",
        keywords: ["image workflow pipeline", "AI image workflow", "batch image generation"],
      },
      isPublished: true,
      showInMenu: true,
      sortOrder: 44,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "Image Workflow Pipeline",
        description: "A repeatable workflow for brief, prompt, generation, review, and export of image assets.",
      },
    },
    {
      pageKey: "docs-video-prompt-engineering",
      path: "/docs/video/prompt-engineering",
      slug: "video/prompt-engineering",
      title: "Video Prompt Engineering",
      description: "Prompt patterns for turning workflow output into video scripts, scenes, and production notes.",
      keywords: ["video prompt engineering", "AI video prompts", "video script generation", "scene planning", "video workflow"],
      aiContext: "This page helps SmartAIHub users design video prompts that convert workflow output into production-ready assets.",
      keyFacts: [
        "Video prompts should define audience, tone, and pacing.",
        "Scene boundaries keep long videos focused.",
        "Workflow output should feed script and shot planning.",
      ],
      content: videoPromptContent,
      metadata: {
        description: "Prompt patterns for turning workflow output into video scripts, scenes, and production notes.",
        keywords: ["video prompt engineering", "AI video prompts", "video script generation"],
      },
      isPublished: true,
      showInMenu: true,
      sortOrder: 45,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "Video Prompt Engineering",
        description: "Prompt patterns for turning workflow output into video scripts, scenes, and production notes.",
      },
    },
    {
      pageKey: "docs-video-production-pipeline",
      path: "/docs/video/production-pipeline",
      slug: "video/production-pipeline",
      title: "Video Production Pipeline",
      description: "A production pipeline that turns SmartAIHub workflows into scripts, scenes, and final video assets.",
      keywords: ["video production pipeline", "AI video workflow", "prompt to video", "video asset pipeline", "content production"],
      aiContext: "This page explains how SmartAIHub can produce video assets from a structured workflow pipeline.",
      keyFacts: [
        "Video production starts with structured output.",
        "Scripts, scenes, and cues can all be generated from one run.",
        "Review and export steps keep video production repeatable.",
      ],
      content: videoPipelineContent,
      metadata: {
        description: "A production pipeline that turns SmartAIHub workflows into scripts, scenes, and final video assets.",
        keywords: ["video production pipeline", "AI video workflow", "prompt to video"],
      },
      isPublished: true,
      showInMenu: true,
      sortOrder: 46,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "Video Production Pipeline",
        description: "A production pipeline that turns SmartAIHub workflows into scripts, scenes, and final video assets.",
      },
    },
    {
      pageKey: "docs-seo-ai-search-optimization",
      path: "/docs/seo/ai-search-optimization",
      slug: "seo/ai-search-optimization",
      title: "AI Search Optimization",
      description: "How to structure pages so AI search systems and traditional search engines can index them better.",
      keywords: ["AI search optimization", "answer engine optimization", "docs SEO", "structured data", "search intent"],
      aiContext: "This page explains how SmartAIHub public pages can be optimized for AI search and classic search visibility.",
      keyFacts: [
        "Each page should own one main intent cluster.",
        "Structured data improves machine understanding.",
        "Internal links should connect related intents.",
      ],
      content: seoContent,
      metadata: {
        description: "How to structure pages so AI search systems and traditional search engines can index them better.",
        keywords: ["AI search optimization", "answer engine optimization", "docs SEO"],
      },
      isPublished: true,
      showInMenu: true,
      sortOrder: 47,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "AI Search Optimization",
        description: "How to structure pages so AI search systems and traditional search engines can index them better.",
      },
    },
    {
      pageKey: "docs-content-factory",
      path: "/docs/content/factory",
      slug: "content/factory",
      title: "Content Factory",
      description: "Use skill-generated manifests to create docs, FAQ, and blog pages at scale.",
      keywords: ["content factory", "skill generated content", "docs automation", "FAQ automation", "blog automation"],
      aiContext: "This page explains how SmartAIHub can use skills to generate and import public content manifests.",
      keyFacts: [
        "Skills can generate content manifests automatically.",
        "Imported pages can include docs, FAQ, and blog entries.",
        "SEO metadata should be generated with the page content.",
      ],
      content: contentFactoryContent,
      metadata: {
        description: "Use skill-generated manifests to create docs, FAQ, and blog pages at scale.",
        keywords: ["content factory", "skill generated content", "docs automation"],
      },
      isPublished: true,
      showInMenu: true,
      sortOrder: 48,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Content Factory",
        description: "Use skill-generated manifests to create docs, FAQ, and blog pages at scale.",
      },
    },
  ],
};
