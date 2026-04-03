/**
 * Help Content Service
 *
 * Reads markdown files from docs/help/{locale}/*.md, parses YAML frontmatter
 * and markdown body, converts to HTML, and caches results for 5 minutes.
 */

import fs from "fs";
import path from "path";
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

function cacheSet<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): void {
  map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function getHelpBasePath(): string {
  const candidates = [
    path.resolve(process.cwd(), "docs/help"),
    path.resolve(process.cwd(), "../docs/help"),
    path.resolve(process.cwd(), "../../docs/help"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
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
  return marked.parse(md, { async: false }) as string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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

function loadTopicsFromLocale(locale: string): HelpTopic[] {
  const localeDir = getLocaleDir(locale);
  if (!fs.existsSync(localeDir)) {
    return [];
  }

  let files: string[];
  try {
    files = fs.readdirSync(localeDir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }

  const topics: HelpTopic[] = [];

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
    const html = markdownToHtml(body);
    const excerpt = makeExcerpt(html);

    topics.push({
      slug,
      title: frontmatter.title ?? slug,
      description: frontmatter.description ?? "",
      icon: frontmatter.icon ?? "file",
      section: frontmatter.section ?? "general",
      order: frontmatter.order ?? 99,
      pages: frontmatter.pages ?? [],
      tags: frontmatter.tags ?? [],
      html,
      excerpt,
    });
  }

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
    topics: topics.map(({ slug, title, description, icon, section, order, pages }) => ({
      slug,
      title,
      description,
      icon,
      section,
      order,
      pages,
    })),
  };

  cacheSet(manifestCache, cacheKey, manifest);
  return manifest;
}

export async function getHelpTopic(
  slug: string,
  locale: string,
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
  const html = markdownToHtml(body);
  const excerpt = makeExcerpt(html);

  const topic: HelpTopic = {
    slug,
    title: frontmatter.title ?? slug,
    description: frontmatter.description ?? "",
    icon: frontmatter.icon ?? "file",
    section: frontmatter.section ?? "general",
    order: frontmatter.order ?? 99,
    pages: frontmatter.pages ?? [],
    tags: frontmatter.tags ?? [],
    html,
    excerpt,
  };

  cacheSet(topicCache, cacheKey, topic);
  return topic;
}

export async function getHelpSearchIndex(
  locale: string,
): Promise<
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
  locale: string,
): Promise<Array<{ slug: string; title: string; description: string; icon: string }>> {
  const topics = loadTopicsFromLocale(locale);

  // Return topics whose `pages` array contains this page name
  const matched = topics
    .filter((t) => t.pages.includes(page))
    .map(({ slug, title, description, icon }) => ({ slug, title, description, icon }));

  return matched;
}
