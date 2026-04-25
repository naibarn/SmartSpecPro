import fs from "node:fs";
import path from "node:path";

const helpRoot = path.resolve("apps/web/docs/help");
const locales = ["en", "th"];
const startMarker = "<!-- knowledge-graph:related:start -->";
const endMarker = "<!-- knowledge-graph:related:end -->";

const categoryRules = [
  {
    category: "admin",
    test: (slug) => slug.startsWith("admin-") || slug === "domain-admin",
    hub: "admin-advanced",
  },
  {
    category: "knowledge",
    test: (slug) => ["document-management", "memory", "chat", "personas", "mcp-servers"].includes(slug),
    hub: "document-management",
  },
  {
    category: "automation",
    test: (slug) => ["automation", "workflows", "workflow-editor", "workflow-gallery", "webhooks", "factory", "work-os"].includes(slug),
    hub: "workflows",
  },
  {
    category: "teams",
    test: (slug) => ["teams", "team-orchestrator", "team-monitoring", "agencies", "agency-builder", "agency-chat", "groups"].includes(slug),
    hub: "teams",
  },
  {
    category: "media",
    test: (slug) => ["media-generation", "presentations", "video-editor", "gallery", "document-management"].includes(slug),
    hub: "media-generation",
  },
  {
    category: "runtime",
    test: (slug) =>
      [
        "local-ai",
        "desktop-host",
        "desktop-host-managed-mode",
        "desktop-releases",
        "terminal",
        "cli",
        "docker-sandbox",
        "openclaw-workers",
        "hi-claw-workers",
        "nemo-claw-workers",
        "hermes-workers",
        "browser-session",
      ].includes(slug),
    hub: "desktop-host",
  },
  {
    category: "account",
    test: (slug) => ["settings", "profile", "notification-settings", "api-keys", "credits", "usage-analytics"].includes(slug),
    hub: "settings",
  },
  {
    category: "marketplace",
    test: (slug) => ["marketplace", "skills", "skill-browser", "admin-skills"].includes(slug),
    hub: "marketplace",
  },
  {
    category: "feedback",
    test: (slug) => ["feedback", "my-feedback", "admin-feedback-hub"].includes(slug),
    hub: "feedback",
  },
];

function readLocaleDocs(locale) {
  const dir = path.join(helpRoot, locale);
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      const filePath = path.join(dir, name);
      const content = fs.readFileSync(filePath, "utf8");
      const parsed = splitFrontmatter(content);
      const slug = parseScalar(parsed.frontmatter, "slug") || name.replace(/\.md$/i, "");
      const title =
        parseScalar(parsed.frontmatter, "title")
        || parseFirstHeading(parsed.body)
        || titleFromSlug(slug);
      return { filePath, name, slug, title, content, ...parsed };
    });
}

function splitFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: "", body: content };
  }
  return { frontmatter: match[1], body: match[2] };
}

function parseScalar(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${escapeRegExp(key)}:\\s*(.+?)\\s*$`, "m"));
  if (!match) return "";
  return unquote(match[1].trim());
}

function parseFirstHeading(body) {
  const match = body.match(/^#\s+(.+?)\s*$/m);
  return match ? match[1].trim() : "";
}

function titleFromSlug(slug) {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function categoryForSlug(slug) {
  return categoryRules.find((rule) => rule.test(slug)) ?? { category: "core", hub: "getting-started" };
}

function unique(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function extractYamlList(frontmatter, key) {
  const lines = frontmatter.split("\n");
  const keyIndex = lines.findIndex((line) => line.match(new RegExp(`^${escapeRegExp(key)}:\\s*`)));
  if (keyIndex === -1) return [];

  const firstLine = lines[keyIndex];
  const inline = firstLine.match(/^\w[\w-]*:\s*\[(.*)\]\s*$/);
  if (inline) {
    return inline[1]
      .split(",")
      .map((value) => unquote(value.trim()))
      .filter(Boolean);
  }

  const sameLineValue = firstLine.replace(/^\w[\w-]*:\s*/, "").trim();
  if (sameLineValue && sameLineValue !== "[" && sameLineValue !== "[]") {
    return [unquote(sameLineValue)];
  }

  const values = [];
  for (let index = keyIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[A-Za-z][A-Za-z0-9_-]*:\s*/.test(line)) break;
    const trimmed = line.trim();
    if (!trimmed || trimmed === "[" || trimmed === "]") continue;
    const listMatch = trimmed.match(/^-\s*(.+)$/);
    values.push(unquote((listMatch ? listMatch[1] : trimmed).replace(/,$/, "").trim()));
  }
  return values.filter(Boolean);
}

function replaceYamlList(frontmatter, key, values) {
  const lines = frontmatter.split("\n");
  const rendered = [
    `${key}:`,
    ...values.map((value) => `  - ${JSON.stringify(value)}`),
  ];
  const keyIndex = lines.findIndex((line) => line.match(new RegExp(`^${escapeRegExp(key)}:\\s*`)));
  if (keyIndex === -1) {
    return `${frontmatter.trimEnd()}\n${rendered.join("\n")}`;
  }

  let endIndex = keyIndex + 1;
  for (; endIndex < lines.length; endIndex += 1) {
    if (/^[A-Za-z][A-Za-z0-9_-]*:\s*/.test(lines[endIndex])) break;
  }
  return [
    ...lines.slice(0, keyIndex),
    ...rendered,
    ...lines.slice(endIndex),
  ].join("\n");
}

function relatedSlugsFor(doc, docs) {
  const bySlug = new Map(docs.map((item) => [item.slug, item]));
  const category = categoryForSlug(doc.slug);
  const peers = docs
    .filter((item) => item.slug !== doc.slug && categoryForSlug(item.slug).category === category.category)
    .sort((a, b) => Number(a.slug === category.hub) - Number(b.slug === category.hub) || a.slug.localeCompare(b.slug))
    .map((item) => item.slug);

  return unique([
    category.hub,
    doc.slug === "getting-started" ? "document-management" : "getting-started",
    doc.slug === "document-management" ? "memory" : "document-management",
    ...peers,
  ])
    .filter((slug) => slug !== doc.slug && bySlug.has(slug))
    .slice(0, 7);
}

function buildRelatedSection(doc, docs, locale) {
  const heading = locale === "th" ? "## หัวข้อที่เกี่ยวข้อง" : "## Related Help";
  const bySlug = new Map(docs.map((item) => [item.slug, item]));
  const links = relatedSlugsFor(doc, docs)
    .map((slug) => bySlug.get(slug))
    .filter(Boolean)
    .map((item) => `- [[${item.slug}|${item.title}]]`);

  if (links.length === 0) return "";

  return `${startMarker}\n${heading}\n\n${links.join("\n")}\n${endMarker}`;
}

function removeGeneratedRelatedSection(body) {
  const pattern = new RegExp(`\\n*${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}\\n*`, "g");
  return body.replace(pattern, "\n").trimEnd();
}

function rewriteDoc(doc, docs, locale) {
  const category = categoryForSlug(doc.slug).category;
  const tags = unique([
    ...extractYamlList(doc.frontmatter, "tags"),
    "help",
    `help/${locale}`,
    `help/${category}`,
    category,
    doc.slug,
  ]);
  const aliases = unique([
    ...extractYamlList(doc.frontmatter, "aliases"),
    doc.slug,
    doc.title,
    `${doc.title} help`,
  ]);

  let frontmatter = replaceYamlList(doc.frontmatter, "aliases", aliases);
  frontmatter = replaceYamlList(frontmatter, "tags", tags);

  const cleanBody = removeGeneratedRelatedSection(doc.body);
  const relatedSection = buildRelatedSection(doc, docs, locale);
  const body = relatedSection ? `${cleanBody.trimEnd()}\n\n${relatedSection}\n` : `${cleanBody.trimEnd()}\n`;
  return `---\n${frontmatter.trimEnd()}\n---\n${body}`;
}

let changed = 0;
for (const locale of locales) {
  const docs = readLocaleDocs(locale);
  for (const doc of docs) {
    const next = rewriteDoc(doc, docs, locale);
    if (next !== doc.content) {
      fs.writeFileSync(doc.filePath, next, "utf8");
      changed += 1;
    }
  }
}

console.log(`Updated ${changed} help markdown files for knowledge graph links.`);
