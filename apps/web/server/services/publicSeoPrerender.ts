import {
  smartaihubPublicIndexSections,
  smartaihubStaticSitemapPaths,
  type SmartAiHubIndexLink,
} from "../../shared/smartaihubPublicIndex";
import { buildSmartAiHubRelatedLinks } from "../../shared/smartaihubDiscovery";

type Snapshot = {
  path: string;
  title: string;
  description: string;
  h1: string;
  sections: Array<{ heading: string; body: string }>;
  links: SmartAiHubIndexLink[];
  faqs: Array<{ question: string; answer: string }>;
};

const productSummary =
  "SmartAIHub is an enterprise AI skill marketplace for reusable skills, virtual workflows, swarm execution, and chat, presentation, image, and video outputs.";

const routeSnapshots: Record<string, Omit<Snapshot, "path" | "links">> = {
  "/": {
    title: "SmartAIHub | AI Skill Marketplace and Workflow Swarms",
    description:
      "SmartAIHub helps teams publish reusable AI skills, build virtual workflows, and run swarm execution for chat, presentation, image, and video outputs.",
    h1: "SmartAIHub: AI skill marketplace and workflow swarms",
    sections: [
      {
        heading: "What is SmartAIHub?",
        body: productSummary,
      },
      {
        heading: "How does SmartAIHub help teams?",
        body: "Teams can discover reusable skills, turn prompts and documents into governed workflows, and deliver repeatable outputs across multiple formats.",
      },
    ],
    faqs: [
      {
        question: "What is SmartAIHub?",
        answer:
          "SmartAIHub is an enterprise AI workspace for reusable skills, virtual workflows, swarm execution, and multi-format AI outputs.",
      },
      {
        question: "What outputs can SmartAIHub create?",
        answer:
          "SmartAIHub supports chat answers, presentation-ready decks, image workflows, and video production pipelines from reusable AI workflows.",
      },
    ],
  },
  "/features": {
    title: "SmartAIHub Features | Skills, Workflows and Swarms",
    description:
      "Explore SmartAIHub features for skill marketplace publishing, virtual workflow design, swarm governance, and AI output delivery.",
    h1: "Enterprise features for skills, workflows, and swarms",
    sections: [
      {
        heading: "Skill marketplace",
        body: "SmartAIHub helps teams publish, discover, version, and reuse approved skills across an organization.",
      },
      {
        heading: "Virtual workflow builder",
        body: "SmartAIHub turns prompts and source documents into repeatable workflows with routing, approvals, and reusable execution patterns.",
      },
      {
        heading: "Swarm execution",
        body: "SmartAIHub coordinates specialist skills with logs, guardrails, and policy checkpoints for enterprise delivery.",
      },
    ],
    faqs: [],
  },
  "/marketplace": {
    title: "SmartAIHub Marketplace | Reusable AI Skills",
    description:
      "Browse reusable AI skills and capabilities for workflows, swarms, content generation, presentations, images, and video production.",
    h1: "Reusable AI skills marketplace",
    sections: [
      {
        heading: "What can teams find in the marketplace?",
        body: "Teams can discover approved skills, reusable prompt patterns, workflow templates, and output-specific capabilities.",
      },
      {
        heading: "Why use reusable skills?",
        body: "Reusable skills reduce duplicated work, improve governance, and give teams a shared capability layer for repeatable AI work.",
      },
    ],
    faqs: [
      {
        question: "What is an AI skill marketplace?",
        answer:
          "An AI skill marketplace is a curated catalog of reusable capabilities that teams can discover, publish, and run inside governed workflows.",
      },
    ],
  },
  "/docs/seo/ai-search-optimization": {
    title: "AI Search Optimization for SmartAIHub",
    description:
      "Learn how SmartAIHub structures public pages, internal links, llms.txt, sitemap, and schema markup for AI search visibility.",
    h1: "AI search optimization for SmartAIHub",
    sections: [
      {
        heading: "How does SmartAIHub support AI search?",
        body: "SmartAIHub exposes crawler-readable public pages, llms.txt, sitemap.xml, structured data, FAQ answers, and intent-specific documentation clusters.",
      },
      {
        heading: "Why do LLM crawlers need semantic HTML?",
        body: "LLM crawlers and answer engines extract facts more reliably when the first HTML response includes a main landmark, clear headings, concise answers, and internal links.",
      },
    ],
    faqs: [
      {
        question: "What is llms.txt?",
        answer:
          "llms.txt is a markdown index that gives AI crawlers a concise map of important public pages and their purpose.",
      },
      {
        question: "Why add JSON-LD for AI search?",
        answer:
          "JSON-LD helps search and AI systems identify entities, page purpose, FAQ answers, and relationships between public pages.",
      },
    ],
  },
};

const fallbackSnapshot: Omit<Snapshot, "path" | "links"> = {
  title: "SmartAIHub Public Content",
  description:
    "Explore SmartAIHub public pages for AI skills, virtual workflows, swarm execution, docs, blog articles, media workflows, and support resources.",
  h1: "SmartAIHub public content",
  sections: [
    {
      heading: "What is available on SmartAIHub?",
      body: "SmartAIHub public pages explain the skill marketplace, workflow builder, swarm execution, media outputs, documentation, blog content, support, and security posture.",
    },
  ],
  faqs: [],
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizePath(url: string): string {
  const pathname = url.split("?")[0]?.split("#")[0] || "/";
  const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") : "/";
}

function isPublicSeoPath(pathname: string): boolean {
  if (pathname.startsWith("/api/") || pathname.startsWith("/admin") || pathname.startsWith("/internal/")) {
    return false;
  }
  if (pathname.startsWith("/blog/") || pathname.startsWith("/marketplace/")) {
    return true;
  }
  return smartaihubStaticSitemapPaths.some((entry) => entry.path === pathname);
}

function findIndexLink(pathname: string): SmartAiHubIndexLink | undefined {
  for (const section of smartaihubPublicIndexSections) {
    const match = section.links.find((link) => link.href === pathname);
    if (match) return match;
  }
  return undefined;
}

function titleFromPath(pathname: string): string {
  const link = findIndexLink(pathname);
  if (link) return link.label;
  const slug = pathname.split("/").filter(Boolean).at(-1) || "public content";
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function snapshotFor(pathname: string): Snapshot | null {
  if (!isPublicSeoPath(pathname)) return null;

  const known = routeSnapshots[pathname];
  const link = findIndexLink(pathname);
  const base = known || {
    ...fallbackSnapshot,
    title: `${titleFromPath(pathname)} | SmartAIHub`,
    h1: `${titleFromPath(pathname)} on SmartAIHub`,
    description: link?.description || fallbackSnapshot.description,
  };
  const links = buildSmartAiHubRelatedLinks(pathname, base.title, []);
  return { path: pathname, links, ...base };
}

function jsonLdFor(snapshot: Snapshot, baseUrl: string): Array<Record<string, unknown>> {
  const url = `${baseUrl}${snapshot.path}`;
  const graph: Array<Record<string, unknown>> = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "SmartAIHub",
      url: baseUrl,
      description: productSummary,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: snapshot.title,
      headline: snapshot.h1,
      description: snapshot.description,
      url,
      isPartOf: {
        "@type": "WebSite",
        name: "SmartAIHub",
        url: baseUrl,
      },
      about: ["AI skill marketplace", "virtual workflows", "swarm execution", "AI search optimization"],
    },
  ];

  if (snapshot.faqs.length > 0) {
    graph.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: snapshot.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    });
  }

  return graph;
}

export function buildPublicSeoSnapshotHtml(originalUrl: string, baseUrl = "https://smartaihub.app"): string {
  const pathname = normalizePath(originalUrl);
  const snapshot = snapshotFor(pathname);
  if (!snapshot) return "";

  const canonical = `${baseUrl}${snapshot.path}`;
  const sections = snapshot.sections
    .map(
      (section) => `<section>
  <h2>${escapeHtml(section.heading)}</h2>
  <p>${escapeHtml(section.body)}</p>
</section>`
    )
    .join("\n");
  const faqs = snapshot.faqs.length
    ? `<section>
  <h2>Frequently Asked Questions</h2>
  ${snapshot.faqs
    .map((faq) => `<article>
    <h3>${escapeHtml(faq.question)}</h3>
    <p>${escapeHtml(faq.answer)}</p>
  </article>`)
    .join("\n")}
</section>`
    : "";
  const links = snapshot.links
    .map((link) => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a> - ${escapeHtml(link.description)}</li>`)
    .join("\n");

  return `<main id="smartaihub-prerender" data-seo-prerender="true">
  <article>
    <h1>${escapeHtml(snapshot.h1)}</h1>
    <p>${escapeHtml(snapshot.description)}</p>
    ${sections}
    ${faqs}
    <nav aria-label="Related SmartAIHub pages">
      <h2>Related SmartAIHub pages</h2>
      <ul>
${links}
      </ul>
    </nav>
  </article>
</main>
<script type="application/ld+json">${JSON.stringify(jsonLdFor(snapshot, baseUrl))}</script>
<link rel="canonical" href="${escapeHtml(canonical)}" data-seo-prerender="true" />
<meta property="og:url" content="${escapeHtml(canonical)}" data-seo-prerender="true" />
<meta name="description" content="${escapeHtml(snapshot.description)}" data-seo-prerender="true" />`;
}

export function injectPublicSeoSnapshot(html: string, originalUrl: string, baseUrl = "https://smartaihub.app"): string {
  const snapshotHtml = buildPublicSeoSnapshotHtml(originalUrl, baseUrl);
  if (!snapshotHtml) return html;

  if (html.includes('<div id="root"></div>')) {
    return html.replace('<div id="root"></div>', `<div id="root">\n${snapshotHtml}\n    </div>`);
  }

  return html.replace("</body>", `${snapshotHtml}\n</body>`);
}
