/**
 * Help Content Service
 *
 * Reads markdown files from docs/help/{locale}/*.md, parses YAML frontmatter
 * and markdown body, converts to HTML, and caches results for 5 minutes.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import { marked } from "marked";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HelpTopic {
  slug: string;
  title: string;
  description: string;
  icon: string;
  section: string;
  order: number;
  pages: string[];
  tags: string[];
  html: string;
  /** First 200 chars of plain text, used for search excerpts */
  excerpt: string;
  graph: HelpTopicGraph;
}

export interface HelpTopicGraphNode {
  slug: string;
  title: string;
  description: string;
  kind: "active" | "outgoing" | "backlink" | "shared_tag";
  tags: string[];
  sharedTags: string[];
}

export interface HelpTopicGraph {
  outgoing: HelpTopicGraphNode[];
  backlinks: HelpTopicGraphNode[];
  sharedTags: HelpTopicGraphNode[];
}

export interface HelpSection {
  id: string;
  label: Record<string, string>; // { en: "Features", th: "ฟีเจอร์" }
  order: number;
}

export interface HelpManifest {
  sections: HelpSection[];
  topics: Array<{
    slug: string;
    title: string;
    description: string;
    icon: string;
    section: string;
    order: number;
    pages: string[];
  }>;
}

interface Frontmatter {
  title?: string;
  description?: string;
  icon?: string;
  section?: string;
  order?: number;
  pages?: string[];
  tags?: string[];
}

interface ManifestFile {
  sections?: HelpSection[];
}

interface ParsedHelpDoc {
  slug: string;
  frontmatter: Frontmatter;
  body: string;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const manifestCache = new Map<string, CacheEntry<HelpManifest>>();
const topicCache = new Map<string, CacheEntry<HelpTopic>>();
const searchIndexCache = new Map<
  string,
  CacheEntry<
    Array<{
      slug: string;
      title: string;
      description: string;
      excerpt: string;
      tags: string[];
    }>
  >
>();

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet<T>(
  map: Map<string, CacheEntry<T>>,
  key: string,
  value: T
): void {
  map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function getHelpBasePath(): string {
  const moduleRelativePath = fileURLToPath(
    new URL("../../docs/help", import.meta.url)
  );
  const candidates = [
    moduleRelativePath,
    path.resolve(process.cwd(), "apps/web/docs/help"),
    path.resolve(process.cwd(), "docs/help"),
    path.resolve(process.cwd(), "../docs/help"),
    path.resolve(process.cwd(), "../../docs/help"),
  ];

  let bestCandidate: string | null = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;

    let score = 0;
    const manifestPath = path.join(candidate, "_manifest.json");
    if (fs.existsSync(manifestPath)) {
      score += 10;
    }

    for (const locale of ["en", "th"]) {
      const localeDir = path.join(candidate, locale);
      if (!fs.existsSync(localeDir)) continue;

      score += 5;
      try {
        score += fs
          .readdirSync(localeDir)
          .filter(file => file.endsWith(".md")).length;
      } catch {
        // Ignore unreadable locale directories and keep evaluating other candidates.
      }
    }

    if (score > bestScore) {
      bestCandidate = candidate;
      bestScore = score;
    }
  }

  return bestCandidate ?? moduleRelativePath;
}

function getManifestPath(): string {
  return path.join(getHelpBasePath(), "_manifest.json");
}

function getLocaleDir(locale: string): string {
  const basePath = getHelpBasePath();
  const resolved = path.join(basePath, locale);
  // Defence-in-depth: reject any path that escapes the help base directory
  if (!resolved.startsWith(basePath + path.sep) && resolved !== basePath) {
    throw new Error(`Invalid locale path: ${locale}`);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Markdown → HTML (using marked library)
// ---------------------------------------------------------------------------

function markdownToHtml(md: string): string {
  return marked.parse(renderHelpWikiLinks(md), { async: false }) as string;
}

function renderHelpWikiLinks(markdown: string): string {
  return markdown.replace(/\[\[([^[\]]+)\]\]/g, (_match, rawTarget: string) => {
    const [rawReference, rawLabel] = String(rawTarget).split("|", 2);
    const reference = rawReference.trim();
    if (!reference) {
      return _match;
    }

    const label = (rawLabel ?? reference).trim() || reference;
    const [slug, heading] = reference.split("#", 2);
    const href = `/help/${encodeURIComponent(slug.trim())}${heading ? `#${encodeURIComponent(heading.trim())}` : ""}`;
    return `[${label}](${href})`;
  });
}

function extractHelpWikiReferences(markdown: string): string[] {
  const references = new Set<string>();
  for (const match of markdown.matchAll(/\[\[([^[\]]+)\]\]/g)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    const [referencePart] = raw.split("|", 1);
    const [slugPart] = referencePart.trim().split("#", 1);
    const slug = slugPart.trim().replace(/\.(md|markdown)$/i, "");
    if (/^[a-z0-9-]+$/.test(slug)) {
      references.add(slug);
    }
  }
  return Array.from(references);
}

function normalizeHelpGraphTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function isGraphGroupingTag(tag: string, activeSlug: string): boolean {
  const normalized = normalizeHelpGraphTag(tag);
  return Boolean(normalized)
    && normalized !== "help"
    && normalized !== activeSlug
    && !normalized.startsWith("help/")
    && !["en", "th"].includes(normalized);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeExcerpt(html: string, maxLen = 200): string {
  const plain = stripHtml(html);
  if (plain.length <= maxLen) return plain;
  return plain.slice(0, maxLen).trimEnd() + "…";
}

// ---------------------------------------------------------------------------
// Frontmatter parser
// ---------------------------------------------------------------------------

interface ParsedFile {
  frontmatter: Frontmatter;
  body: string;
}

function parseMarkdownFile(content: string): ParsedFile {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!fmMatch) {
    return { frontmatter: {}, body: content };
  }
  let frontmatter: Frontmatter = {};
  try {
    const parsed = yaml.load(fmMatch[1]);
    if (parsed && typeof parsed === "object") {
      frontmatter = parsed as Frontmatter;
    }
  } catch {
    // Malformed YAML — treat as no frontmatter
  }
  return { frontmatter, body: fmMatch[2].trimStart() };
}

// ---------------------------------------------------------------------------
// Manifest loading
// ---------------------------------------------------------------------------

function loadManifest(): ManifestFile {
  const manifestPath = getManifestPath();
  if (!fs.existsSync(manifestPath)) {
    return { sections: [] };
  }
  try {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    return JSON.parse(raw) as ManifestFile;
  } catch {
    return { sections: [] };
  }
}

// ---------------------------------------------------------------------------
// Locale topic loading
// ---------------------------------------------------------------------------

function loadParsedHelpDocs(locale: string): ParsedHelpDoc[] {
  const localeDir = getLocaleDir(locale);
  if (!fs.existsSync(localeDir)) {
    return [];
  }

  let files: string[];
  try {
    files = fs.readdirSync(localeDir).filter(f => f.endsWith(".md"));
  } catch {
    return [];
  }

  const docs: ParsedHelpDoc[] = [];

  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    const filePath = path.join(localeDir, file);
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseMarkdownFile(content);
    docs.push({
      slug,
      frontmatter,
      body,
    });
  }

  return docs;
}

function buildHelpTopicGraph(
  doc: ParsedHelpDoc,
  docs: ParsedHelpDoc[],
): HelpTopicGraph {
  const bySlug = new Map(docs.map((item) => [item.slug, item]));
  const activeTags = new Set(
    (doc.frontmatter.tags ?? [])
      .map(normalizeHelpGraphTag)
      .filter((tag) => isGraphGroupingTag(tag, doc.slug)),
  );

  const toNode = (
    target: ParsedHelpDoc,
    kind: HelpTopicGraphNode["kind"],
    sharedTags: string[] = [],
  ): HelpTopicGraphNode => ({
    slug: target.slug,
    title: target.frontmatter.title ?? target.slug,
    description: target.frontmatter.description ?? "",
    kind,
    tags: target.frontmatter.tags ?? [],
    sharedTags,
  });

  const outgoing = extractHelpWikiReferences(doc.body)
    .map((slug) => bySlug.get(slug))
    .filter((target): target is ParsedHelpDoc => target !== undefined && target.slug !== doc.slug)
    .map((target) => toNode(target, "outgoing"))
    .slice(0, 8);

  const backlinks = docs
    .filter((target) => target.slug !== doc.slug)
    .filter((target) => extractHelpWikiReferences(target.body).includes(doc.slug))
    .map((target) => toNode(target, "backlink"))
    .slice(0, 8);

  const linkedSlugs = new Set([
    doc.slug,
    ...outgoing.map((node) => node.slug),
    ...backlinks.map((node) => node.slug),
  ]);

  const sharedTags = docs
    .filter((target) => !linkedSlugs.has(target.slug))
    .map((target) => {
      const targetSharedTags = (target.frontmatter.tags ?? [])
        .map(normalizeHelpGraphTag)
        .filter((tag) => activeTags.has(tag));
      return {
        target,
        sharedTags: Array.from(new Set(targetSharedTags)),
      };
    })
    .filter(({ sharedTags }) => sharedTags.length > 0)
    .sort((a, b) => b.sharedTags.length - a.sharedTags.length || a.target.slug.localeCompare(b.target.slug))
    .map(({ target, sharedTags }) => toNode(target, "shared_tag", sharedTags))
    .slice(0, 8);

  return { outgoing, backlinks, sharedTags };
}

function buildHelpTopicFromParsed(doc: ParsedHelpDoc, docs: ParsedHelpDoc[]): HelpTopic {
  const html = markdownToHtml(doc.body);
  const excerpt = makeExcerpt(html);

  return {
    slug: doc.slug,
    title: doc.frontmatter.title ?? doc.slug,
    description: doc.frontmatter.description ?? "",
    icon: doc.frontmatter.icon ?? "file",
    section: doc.frontmatter.section ?? "general",
    order: doc.frontmatter.order ?? 99,
    pages: doc.frontmatter.pages ?? [],
    tags: doc.frontmatter.tags ?? [],
    html,
    excerpt,
    graph: buildHelpTopicGraph(doc, docs),
  };
}

function loadTopicsFromLocale(locale: string): HelpTopic[] {
  const docs = loadParsedHelpDocs(locale);
  const topics = docs.map((doc) => buildHelpTopicFromParsed(doc, docs));
  topics.sort((a, b) => a.order - b.order);
  return topics;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getHelpManifest(locale: string): Promise<HelpManifest> {
  const cacheKey = `manifest:${locale}`;
  const cached = cacheGet(manifestCache, cacheKey);
  if (cached) return cached;

  const manifestFile = loadManifest();
  const topics = loadTopicsFromLocale(locale);

  const manifest: HelpManifest = {
    sections: manifestFile.sections ?? [],
    topics: topics.map(
      ({ slug, title, description, icon, section, order, pages }) => ({
        slug,
        title,
        description,
        icon,
        section,
        order,
        pages,
      })
    ),
  };

  cacheSet(manifestCache, cacheKey, manifest);
  return manifest;
}

export async function getHelpTopic(
  slug: string,
  locale: string
): Promise<HelpTopic | null> {
  const cacheKey = `topic:${locale}:${slug}`;
  const cached = cacheGet(topicCache, cacheKey);
  if (cached) return cached;

  const localeDir = getLocaleDir(locale);
  const filePath = path.join(localeDir, `${slug}.md`);

  // Defence-in-depth: slug must not escape the locale directory
  if (!filePath.startsWith(localeDir + path.sep)) {
    return null;
  }

  if (!fs.existsSync(filePath)) {
    return null;
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  const { frontmatter, body } = parseMarkdownFile(content);
  const docs = [
    ...loadParsedHelpDocs(locale).filter((doc) => doc.slug !== slug),
    { slug, frontmatter, body },
  ];
  const topic = buildHelpTopicFromParsed({ slug, frontmatter, body }, docs);

  cacheSet(topicCache, cacheKey, topic);
  return topic;
}

export async function getHelpSearchIndex(locale: string): Promise<
  Array<{
    slug: string;
    title: string;
    description: string;
    excerpt: string;
    tags: string[];
  }>
> {
  const cacheKey = `search:${locale}`;
  const cached = cacheGet(searchIndexCache, cacheKey);
  if (cached) return cached;

  const topics = loadTopicsFromLocale(locale);

  const index = topics.map(({ slug, title, description, excerpt, tags }) => ({
    slug,
    title,
    description,
    excerpt,
    tags,
  }));

  cacheSet(searchIndexCache, cacheKey, index);
  return index;
}

export async function getContextualHelpTopics(
  page: string,
  locale: string
): Promise<
  Array<{ slug: string; title: string; description: string; icon: string }>
> {
  const topics = loadTopicsFromLocale(locale);

  // Return topics whose `pages` array contains this page name
  const matched = topics
    .filter(t => t.pages.includes(page))
    .map(({ slug, title, description, icon }) => ({
      slug,
      title,
      description,
      icon,
    }));

  return matched;
}

export function resetHelpContentCachesForTests(): void {
  manifestCache.clear();
  topicCache.clear();
  searchIndexCache.clear();
}
