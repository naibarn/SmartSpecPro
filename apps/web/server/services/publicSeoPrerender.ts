import {
  smartaihubPublicIndexSections,
  smartaihubStaticSitemapPaths,
  type SmartAiHubIndexLink,
} from "../../shared/smartaihubPublicIndex";
import { buildSmartAiHubRelatedLinks } from "../../shared/smartaihubDiscovery";
import { PUBLIC_HOME_SEO } from "../../shared/publicHomeContent";

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
  "SmartAIHub provides public information about its product, documentation, media tools, and support.";

const routeSnapshots: Record<string, Omit<Snapshot, "path" | "links">> = {
  "/": {
    title: PUBLIC_HOME_SEO.en.title,
    description: PUBLIC_HOME_SEO.en.description,
    h1: PUBLIC_HOME_SEO.en.h1,
    sections: [
      {
        heading: "Explore a creative workspace",
        body: PUBLIC_HOME_SEO.en.description,
      },
      {
        heading: "Vertical Series",
        body: "Explore the public Vertical Series feature information and its existing sign-in entry.",
      },
    ],
    faqs: [
      {
        question: "What is SmartAIHub?",
        answer:
          "SmartAIHub provides public information about its product, documentation, and support.",
      },
    ],
  },
  "/features": {
    title: "SmartAIHub Features | Product Overview",
    description: "Explore product information and currently listed SmartAIHub capabilities.",
    h1: "SmartAIHub product overview",
    sections: [
      {
        heading: "Marketplace information",
        body: "Browse public information about SmartAIHub product areas and currently listed marketplace entries.",
      },
    ],
    faqs: [],
  },
  "/marketplace": {
    title: "SmartAIHub Marketplace Information",
    description:
      "Browse information about currently listed marketplace entries.",
    h1: "SmartAIHub marketplace information",
    sections: [
      {
        heading: "What can teams find in the marketplace?",
      body: "Browse information about current marketplace listings.",
      },
      {
        heading: "What is listed?",
        body: "The marketplace page presents information about currently listed entries.",
      },
    ],
    faqs: [
      {
        question: "What is listed on the marketplace page?",
        answer:
          "The page provides information about current marketplace listings.",
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
    "Explore SmartAIHub public pages for product information, documentation, blog articles, and support resources.",
  h1: "SmartAIHub public content",
  sections: [
    {
      heading: "What is available on SmartAIHub?",
      body: "SmartAIHub public pages explain product information, documentation, blog content, support, and security information.",
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
  if (pathname.startsWith("/blog/")) {
    return true;
  }
  if (/^\/marketplace\/[^/]+$/.test(pathname) && !pathname.startsWith("/marketplace/auto-review/")) return true;
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

function snapshotFor(pathname: string, language: "en" | "th" = "en"): Snapshot | null {
  if (!isPublicSeoPath(pathname)) return null;

  const known =
    pathname === "/" && language === "th"
      ? {
          ...routeSnapshots["/"],
          title: PUBLIC_HOME_SEO.th.title,
          description: PUBLIC_HOME_SEO.th.description,
          h1: PUBLIC_HOME_SEO.th.h1,
          sections: [
            {
              heading: "สำรวจพื้นที่ทำงานสร้างสรรค์",
              body: PUBLIC_HOME_SEO.th.description,
            },
            {
              heading: "ซีรีส์แนวตั้ง",
              body: "ดูข้อมูลฟีเจอร์ซีรีส์แนวตั้งและทางเข้าสู่ระบบที่มีอยู่",
            },
          ],
          faqs: [],
        }
      : routeSnapshots[pathname];
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
      about: ["product information", "AI search optimization"],
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

export function buildPublicSeoSnapshotHtml(
  originalUrl: string,
  baseUrl = "https://smartaihub.app",
  language: "en" | "th" = "en",
): string {
  const pathname = normalizePath(originalUrl);
  const snapshot = snapshotFor(pathname, language);
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

export function injectPublicSeoSnapshot(
  html: string,
  originalUrl: string,
  baseUrl = "https://smartaihub.app",
  language: "en" | "th" = "en",
): string {
  const snapshotHtml = buildPublicSeoSnapshotHtml(originalUrl, baseUrl, language);
  if (!snapshotHtml) return html;

  const snapshot = snapshotFor(normalizePath(originalUrl), language);
  if (!snapshot) return html;
  const titleTag = `<title>${escapeHtml(snapshot.title)}</title>`;
  const titlePattern = /<title(?:\s[^>]*)?>[\s\S]*?<\/title>/i;
  let withMetadata = titlePattern.test(html)
    ? html.replace(titlePattern, titleTag)
    : html.replace("</head>", `${titleTag}\n</head>`);

  const canonicalTag = `<link rel="canonical" href="${escapeHtml(`${baseUrl}${snapshot.path}`)}" data-seo-prerender="true" />`;
  const ogUrlTag = `<meta property="og:url" content="${escapeHtml(`${baseUrl}${snapshot.path}`)}" data-seo-prerender="true" />`;
  const descriptionTag = `<meta name="description" content="${escapeHtml(snapshot.description)}" data-seo-prerender="true" />`;
  const replaceOrInsertHeadTag = (pattern: RegExp, replacement: string) => {
    if (pattern.test(withMetadata)) {
      withMetadata = withMetadata.replace(pattern, replacement);
    } else {
      withMetadata = withMetadata.replace("</head>", `${replacement}\n</head>`);
    }
  };
  replaceOrInsertHeadTag(/<link\b[^>]*rel=["']canonical["'][^>]*>/i, canonicalTag);
  replaceOrInsertHeadTag(/<meta\b[^>]*property=["']og:url["'][^>]*>/i, ogUrlTag);
  replaceOrInsertHeadTag(/<meta\b[^>]*name=["']description["'][^>]*>/i, descriptionTag);

  const bodySnapshot = snapshotHtml
    .replace(/\s*<link\b[^>]*rel=["']canonical["'][^>]*\/?\s*>/i, "")
    .replace(/\s*<meta\b[^>]*property=["']og:url["'][^>]*\/?\s*>/i, "")
    .replace(/\s*<meta\b[^>]*name=["']description["'][^>]*\/?\s*>/i, "");

  if (bodySnapshot.includes('<div id="root"></div>')) {
    return withMetadata.replace('<div id="root"></div>', `<div id="root">\n${bodySnapshot}\n    </div>`);
  }

  return withMetadata.replace("</body>", `${bodySnapshot}\n</body>`);
}

export function injectTenantIdentitySeo(
  html: string,
  originalUrl: string,
  tenantName: string,
  baseUrl: string,
): string {
  const path = normalizePath(originalUrl);
  const title = `${tenantName} | AI Workspace`;
  const description = `Public information and services from ${tenantName}.`;
  const canonical = `${baseUrl}${path}`;
  const replaceAttribute = (tag: string, attribute: string, value: string) => {
    const escaped = escapeHtml(value);
    const pattern = new RegExp(`(${attribute}=["'])[^"']*(["'])`, "i");
    return tag.replace(pattern, (_match, prefix: string, suffix: string) => `${prefix}${escaped}${suffix}`);
  };

  let result = html.replace(/<title(?:\s[^>]*)?>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  result = result.replace(/<meta\b[^>]*>/gi, (tag) => {
    if (/\bname=["']description["']/i.test(tag) || /\bproperty=["']og:description["']/i.test(tag) || /\bname=["']twitter:description["']/i.test(tag)) {
      return replaceAttribute(tag, "content", description);
    }
    if (/\bname=["']keywords["']/i.test(tag)) return replaceAttribute(tag, "content", tenantName);
    if (/\bname=["']twitter:title["']/i.test(tag) || /\bproperty=["']og:title["']/i.test(tag)) {
      return replaceAttribute(tag, "content", title);
    }
    if (/\bproperty=["']og:url["']/i.test(tag)) return replaceAttribute(tag, "content", canonical);
    return tag;
  });
  result = result.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/i, (tag) => replaceAttribute(tag, "href", canonical));
  return result;
}
