import type { CategoryProductCandidate, FieldEvidence, ImageCandidate, MarketplaceUrlFormat, ProductCapturePayload } from "../../shared/types";
import { parseDiscountPercent } from "../utils/number";

function clean(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function currencyFromPrice(raw: string | null): string | null {
  if (!raw) return null;
  if (/฿/.test(raw)) return "THB";
  if (/\$/.test(raw)) return "USD";
  return null;
}

function parseMoneyValue(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw.replace(/,/g, "").match(/[฿$]\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function parseRatingValue(raw: string | null): number | null {
  if (!raw) return null;
  const value = Number(raw.match(/[1-5](?:\.\d+)?/)?.[0]);
  return Number.isFinite(value) ? value : null;
}

function imageQuality(width?: number, height?: number): ImageCandidate["quality"] {
  if (width == null || height == null) return "unknown";
  if (width < 300 || height < 300) return "low";
  if (width < 700 || height < 700) return "medium";
  return "high";
}

function tinyMainImageWarning(candidate: ImageCandidate | undefined): string | undefined {
  if (!candidate || candidate.kind !== "main" || !candidate.selected) return undefined;
  if (candidate.width != null && candidate.height != null && (candidate.width < 300 || candidate.height < 300)) {
    return `Selected main image is small (${candidate.width}x${candidate.height}).`;
  }
  return undefined;
}

function evidence(text: string | null, source: string, confidence: number, options: Partial<FieldEvidence> = {}): FieldEvidence | undefined {
  if (!text) return undefined;
  return { text, source, confidence, ...options };
}

function parseTikTokShopUrl(inputUrl: string) {
  const originalUrl = inputUrl.trim();
  let origin = "https://www.tiktok.com";
  let pathname = originalUrl.split("?")[0]?.split("#")[0] ?? originalUrl;
  let cleanUrl = pathname;
  try {
    const parsed = new URL(originalUrl);
    origin = parsed.origin;
    pathname = parsed.pathname;
    cleanUrl = `${parsed.origin}${parsed.pathname}`;
  } catch {
    if (pathname.startsWith("/")) cleanUrl = `${origin}${pathname}`;
  }

  const pdpMatch = pathname.match(/^\/shop\/([^/]+)\/pdp\/(\d+)\/?$/i);
  if (pdpMatch) {
    const region = pdpMatch[1];
    const productId = pdpMatch[2];
    return { productId, categorySlug: null, categoryId: null, region, format: "pdp_url" as MarketplaceUrlFormat, originalUrl, cleanUrl, canonicalUrl: `${origin}/shop/${region}/pdp/${productId}` };
  }
  const viewMatch = pathname.match(/^\/view\/product\/(\d+)\/?$/i);
  if (viewMatch) {
    const productId = viewMatch[1];
    return { productId, categorySlug: null, categoryId: null, region: null, format: "view_product_url" as MarketplaceUrlFormat, originalUrl, cleanUrl, canonicalUrl: `${origin}/view/product/${productId}` };
  }
  const categoryMatch = pathname.match(/^\/shop\/([^/]+)\/c\/([^/]+)\/(\d+)\/?$/i);
  if (categoryMatch) {
    const region = categoryMatch[1];
    const categorySlug = categoryMatch[2];
    const categoryId = categoryMatch[3];
    return { productId: null, categorySlug, categoryId, region, format: "category_url" as MarketplaceUrlFormat, originalUrl, cleanUrl, canonicalUrl: `${origin}/shop/${region}/c/${categorySlug}/${categoryId}` };
  }
  const shopHomeMatch = pathname.match(/^\/shop\/([^/]+)\/?$/i);
  if (shopHomeMatch) {
    const region = shopHomeMatch[1];
    return { productId: null, categorySlug: null, categoryId: null, region, format: "shop_home" as MarketplaceUrlFormat, originalUrl, cleanUrl, canonicalUrl: `${origin}/shop/${region}` };
  }
  return { productId: null, categorySlug: null, categoryId: null, region: null, format: "not_found" as MarketplaceUrlFormat, originalUrl, cleanUrl, canonicalUrl: null };
}

function uniqueByUrl(candidates: ImageCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (!/^https?:\/\//.test(candidate.url) || seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}

function imageUrlFromElement(el: HTMLElement): string | null {
  if (el instanceof HTMLImageElement) return el.currentSrc || el.src || null;
  if (el instanceof HTMLVideoElement) return el.poster || null;
  const bg = window.getComputedStyle(el).backgroundImage;
  return bg.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/)?.[1] ?? null;
}

function visibleImages(root: ParentNode = document) {
  const elements = [
    ...Array.from(root.querySelectorAll<HTMLElement>("img[src], img[srcset], video[poster], [style*='background']")),
  ];
  return elements.map((el) => {
    const rect = el.getBoundingClientRect();
    const url = imageUrlFromElement(el);
    return { el, rect, url };
  }).filter((item) => item.url && item.rect.width >= 40 && item.rect.height >= 40 && !/avatar|profile|icon|logo/i.test(item.url));
}

function nearestContextText(el: HTMLElement, maxDepth = 7) {
  const chunks: string[] = [];
  let current: HTMLElement | null = el;
  for (let depth = 0; current && depth < maxDepth; depth += 1) {
    const text = clean(current.innerText || current.textContent || "");
    if (text && text.length <= 8_000) chunks.push(text);
    current = current.parentElement;
  }
  return chunks.join(" ");
}

function classifyImageZone(el: HTMLElement, rect: DOMRect): ImageCandidate["kind"] {
  const text = nearestContextText(el);
  const aboveFold = rect.top > -80 && rect.top < window.innerHeight * 1.2;
  const reviewContext = /รูปภาพจากรีวิว|รีวิวจากผู้ใช้|รีวิวจากผู้ซื้อ|ความคิดเห็น|การซื้อที่ตรวจสอบแล้ว|ผู้ใช้ทั่วโลก|คะแนนสินค้า|คะแนนและรีวิว|review|ratings?|สินค้า\s*:|^\s*[pks]\*{2,}|TH\s+สินค้า/i.test(text)
    || /[★⭐]{3,}|\b\d{4}-\d{2}-\d{2}\b/.test(text);
  if (reviewContext && rect.top > 120) return "review";

  if (/คำอธิบายสินค้า|เกี่ยวกับสินค้ารายการนี้|รายละเอียดสินค้า|ข้อมูลจำเพาะ|Product Description/i.test(text)) return "description";
  if (/สำรวจสินค้า|สินค้าที่คล้ายกัน|สินค้าแนะนำ|You may also like|Related products/i.test(text)) return "related";
  if (/สี\s*:|ความจุ\s*:|ตัวเลือก|variant|option|สีสัน|สีขาว|50\s*ชิ้น|100\s*ชิ้น|200\s*ชิ้น|จำนวน\s*:|ซื้อเลย|จัดส่งฟรี/i.test(text)) return "main";
  if (aboveFold && rect.left > window.innerWidth * 0.18 && rect.left < window.innerWidth * 0.72) return "main";
  return "unknown";
}

function collectTikTokImages() {
  const candidates: ImageCandidate[] = [];
  for (const [position, item] of visibleImages().entries()) {
    const kind = classifyImageZone(item.el, item.rect);
    candidates.push({
      url: item.url!,
      kind,
      source: "dom",
      evidenceId: `image.${kind}.${position}`,
      role: kind === "main" ? (position === 0 ? "primary" : "gallery") : kind,
      quality: imageQuality(Math.round(item.rect.width), Math.round(item.rect.height)),
      position,
      width: Math.round(item.rect.width),
      height: Math.round(item.rect.height),
      selected: kind === "main" && position < 12,
      metadata: {
        zone: kind,
        top: Math.round(item.rect.top),
        left: Math.round(item.rect.left),
        alt: item.el instanceof HTMLImageElement ? item.el.alt : undefined,
        warning: kind === "main" && position === 0 && (item.rect.width < 300 || item.rect.height < 300) ? "tiny_main_image" : undefined,
      },
    });
  }
  return uniqueByUrl(candidates).slice(0, 60);
}

function matchLine(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]).slice(0, 500);
    if (match?.[0]) return clean(match[0]).slice(0, 500);
  }
  return null;
}

function findCompactTextSection(markers: RegExp[]): HTMLElement | null {
  const sections = Array.from(document.querySelectorAll<HTMLElement>("section, article, div"))
    .map((el) => ({ el, text: clean(el.innerText || ""), rect: el.getBoundingClientRect() }))
    .filter((item) => item.text.length >= 80 && item.text.length <= 14_000)
    .filter((item) => item.rect.width >= 240 || item.rect.height >= 80)
    .filter((item) => markers.some((marker) => marker.test(item.text)));

  return sections.sort((left, right) => {
    const leftMarkerIndex = Math.min(...markers.map((marker) => {
      const match = left.text.search(marker);
      return match >= 0 ? match : Number.POSITIVE_INFINITY;
    }));
    const rightMarkerIndex = Math.min(...markers.map((marker) => {
      const match = right.text.search(marker);
      return match >= 0 ? match : Number.POSITIVE_INFINITY;
    }));
    const markerComparison = leftMarkerIndex - rightMarkerIndex;
    if (markerComparison !== 0) return markerComparison;
    return left.text.length - right.text.length;
  })[0]?.el ?? null;
}

function trimTikTokDescription(text: string) {
  let output = clean(text);
  const markerMatch = output.match(/(?:เกี่ยวกับสินค้ารายการนี้|คำอธิบายสินค้า)/i);
  if (markerMatch?.index != null && markerMatch.index > 0) {
    output = output.slice(markerMatch.index);
  }
  output = output
    .replace(/^(?:เกี่ยวกับสินค้ารายการนี้|คำอธิบายสินค้า)\s*/i, "")
    .replace(/\s*(?:ดูเพิ่มเติม|Show more)\s*$/i, "")
    .trim();
  const stopMatch = output.search(/\s(?:รูปภาพจากรีวิว|รีวิวจากผู้ใช้|คะแนนสินค้า|สินค้าที่คล้ายกัน|สินค้าแนะนำ|You may also like)\b/i);
  if (stopMatch > 80) {
    output = output.slice(0, stopMatch).trim();
  }
  return output.slice(0, 12_000);
}

function parseCompactCount(raw: string | null): number | null {
  if (!raw) return null;
  const text = raw.toLowerCase().replace(/,/g, "").replace(/\s+/g, "");
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  if (!Number.isFinite(value)) return null;
  if (/m|ล้าน/.test(text)) return Math.round(value * 1_000_000);
  if (/k|พัน/.test(text)) return Math.round(value * 1_000);
  if (/หมื่น/.test(text)) return Math.round(value * 10_000);
  return Math.round(value);
}

function closestProductCard(anchor: HTMLAnchorElement): HTMLElement | null {
  let current: HTMLElement | null = anchor;
  for (let depth = 0; current && depth < 7; depth += 1) {
    const rect = current.getBoundingClientRect();
    const text = clean(current.innerText || "");
    if (rect.width >= 140 && rect.height >= 180 && /[฿$]\s?[\d,.]+/.test(text)) return current;
    current = current.parentElement;
  }
  return anchor.closest("div") as HTMLElement | null;
}

function scoreTikTokCandidate(input: {
  priceText: string | null;
  discountText: string | null;
  ratingText: string | null;
  soldCountText: string | null;
  imageUrl: string | null;
  hasFreeShipping: boolean;
  rank: number;
}) {
  let score = 0;
  const reasons: string[] = [];
  const rating = Number(input.ratingText);
  const sold = parseCompactCount(input.soldCountText);
  const discount = input.discountText ? Number(input.discountText.match(/\d+/)?.[0] ?? 0) : 0;

  if (sold != null) {
    score += Math.min(35, Math.log10(sold + 1) * 7);
    reasons.push(`ขายดี: ${input.soldCountText}`);
  }
  if (Number.isFinite(rating) && rating >= 4) {
    score += Math.min(25, Math.max(0, rating - 3.5) * 20);
    reasons.push(`rating สูง: ${input.ratingText}`);
  }
  if (discount >= 30) {
    score += Math.min(15, discount / 100 * 15);
    reasons.push(`ส่วนลด ${input.discountText}`);
  }
  if (input.priceText) {
    score += 10;
    reasons.push("ราคาอ่านได้");
  }
  if (input.hasFreeShipping) {
    score += 8;
    reasons.push("มี Free shipping");
  }
  if (input.imageUrl) {
    score += 5;
    reasons.push("มีรูปสินค้า");
  }
  if (input.rank <= 10) score += 5;
  return { score: Math.round(Math.min(100, score)), reasons };
}

function extractProductName(rawDomText: string) {
  const lines = rawDomText.split(/\n+/).map((line) => clean(line)).filter(Boolean);
  const priceLineIndex = lines.findIndex((line) => /[฿$]\s?[\d,.]+/.test(line));
  const titleAfterPrice = lines.slice(Math.max(0, priceLineIndex + 1), priceLineIndex + 8)
    .find((line) => line.length >= 8 && !/sold by|จำหน่ายไป|จัดส่งฟรี|เลือกตัวเลือก|การจัดส่ง|คืนสินค้า|TikTok Shop/i.test(line));
  return titleAfterPrice || document.querySelector("h1")?.textContent?.trim() || document.title.replace(/\|.*$/, "").trim() || null;
}

function extractDescription(rawDomText: string) {
  const lines = rawDomText.split(/\n+/).map((line) => clean(line)).filter(Boolean);
  const markerIndex = lines.map((line) => /เกี่ยวกับสินค้ารายการนี้|คำอธิบายสินค้า/i.test(line)).lastIndexOf(true);
  if (markerIndex >= 0) {
    const collected: string[] = [];
    for (const line of lines.slice(markerIndex + 1)) {
      if (/สำรวจสินค้า|สินค้าที่คล้ายกัน|สินค้าแนะนำ|รีวิวจากผู้ใช้|รูปภาพจากรีวิว|คะแนนสินค้า|You may also like/i.test(line)) break;
      if (/^ดูเพิ่มเติม$|^Show more$/i.test(line)) continue;
      if (line.length <= 1) continue;
      collected.push(line);
      if (collected.join("\n").length >= 12_000) break;
    }
    const fromLines = collected.join("\n").trim();
    if (fromLines.length >= 20) return fromLines.slice(0, 12_000);
  }

  const section = findCompactTextSection([/เกี่ยวกับสินค้ารายการนี้/i, /คำอธิบายสินค้า/i]);
  if (section) {
    return trimTikTokDescription(section.innerText || "");
  }
  const match = rawDomText.match(/(?:เกี่ยวกับสินค้ารายการนี้|คำอธิบายสินค้า)([\s\S]{0,4000})/i);
  return trimTikTokDescription(match?.[0] ?? "");
}

function cleanTikTokCategoryPart(value: string, productName: string | null): string | null {
  const text = clean(value).replace(/\s*[>›]\s*$/g, "");
  if (!text) return null;
  if (/TikTok Shop|ดาวน์โหลด|ขาย|เพิ่มเติม/i.test(text)) return null;
  if (/[฿$]\s?[\d,.]+|จำหน่ายไป|sold|รีวิว|reviews?/i.test(text)) return null;
  if (productName && (text === productName || text.includes(productName.slice(0, 80)))) return null;
  return text;
}

function formatTikTokCategoryPath(parts: string[], productName: string | null): string[] {
  return Array.from(new Set(parts.map((part) => cleanTikTokCategoryPart(part, productName)).filter(Boolean) as string[])).slice(0, 12);
}

function extractTikTokCategoryData(productName: string | null): { text: string; path: string[]; source: string } | null {
  const lines = document.body.innerText.split(/\n+/).map((line) => clean(line)).filter(Boolean);
  const breadcrumbLine = lines.find((line) => /TikTok Shop/i.test(line) && /[>›]/.test(line));
  if (breadcrumbLine) {
    const path = formatTikTokCategoryPath(breadcrumbLine.split(/[>›]/), productName);
    if (path.length > 0) return { text: path[path.length - 1], path, source: "text:breadcrumb" };
  }

  const links = Array.from(document.querySelectorAll<HTMLElement>("a, [role='link']"))
    .map((el) => ({ text: clean(el.innerText || el.textContent || ""), rect: el.getBoundingClientRect() }))
    .filter((item) => item.text.length >= 2 && item.text.length <= 80 && item.rect.top >= 0 && item.rect.top < 260)
    .filter((item) => !/[฿$]\s?[\d,.]+|ดาวน์โหลด|ขาย|เพิ่มเติม|TikTok Shop/i.test(item.text))
    .map((item) => item.text);
  const path = formatTikTokCategoryPath(links, productName).slice(0, 5);
  return path.length > 0 ? { text: path[path.length - 1], path, source: "dom:top_links" } : null;
}

function extractTikTokRatingAndReviews(rawDomText: string) {
  const text = clean(rawDomText);
  const ratingReviewMatch = text.match(/([1-5](?:\.\d+)?)\s*[★⭐]?\s*\(?\s*([\d.,]+[kKmM]?)\s*\)?\s*(?:รีวิว|reviews?|ความคิดเห็น)/i);
  if (ratingReviewMatch) {
    return { ratingScoreText: ratingReviewMatch[1], reviewCountText: ratingReviewMatch[2] };
  }
  const ratingScoreText = matchLine(rawDomText, [
    /([1-5](?:\.\d+)?)\s*[★⭐]/,
    /\b([1-5](?:\.\d+)?)\b(?=\s*(?:stars?|rating|ดาว))/i,
  ]);
  const reviewCountText = matchLine(rawDomText, [
    /(?:รีวิว|reviews?|ความคิดเห็น)\s*([\d.,]+[kKmM]?)/i,
    /([\d.,]+[kKmM]?)\s*(?:รีวิว|reviews?|ความคิดเห็น)/i,
    /\([ ]*([\d.,]+[kKmM]?)[ ]*\)\s*(?:รีวิว|reviews?|ความคิดเห็น)?/i,
  ]);
  return { ratingScoreText, reviewCountText };
}

const TIKTOK_VARIANT_LABEL_PATTERN = /^(สี|ความจุ|ขนาด|ตัวเลือก|แบบ|รุ่น|กลิ่น|รส|style|color|size|capacity|option|variant)(?:\s*[:：]\s*(.*)|\s*)$/i;
const TIKTOK_VARIANT_PREFIX_OPTION_PATTERN = /^(รส|กลิ่น|สี|สีสัน)([^\s].{0,60})$/i;
const TIKTOK_VARIANT_STOP_PATTERN = /^(จำนวน|ซื้อเลย|เพิ่มลงรถเข็น|การจัดส่ง|คืนสินค้า|รายละเอียดสินค้า|คำอธิบายสินค้า|เกี่ยวกับสินค้ารายการนี้|รีวิว|รูปภาพจากรีวิว|คะแนน|จำหน่ายไป|ขายแล้ว|sold by|สินค้านี้)/i;
const TIKTOK_VARIANT_NOISE_PATTERN = /การซื้อที่ตรวจสอบแล้ว|สินค้า:|รูปภาพจากรีวิว|รีวิวจากผู้ใช้|ความคิดเห็น|ลักษณะ:|วัสดุ:|การออกแบบ:|คุณภาพ|แข็งแรง|TH$|^\d{4}-\d{2}-\d{2}$|p\*\*\*/i;

function collectTikTokPrefixedVariantOptions(lines: string[]) {
  const byLabel = new Map<string, string[]>();
  for (const line of lines) {
    const match = line.match(TIKTOK_VARIANT_PREFIX_OPTION_PATTERN);
    if (!match || TIKTOK_VARIANT_STOP_PATTERN.test(line) || TIKTOK_VARIANT_NOISE_PATTERN.test(line)) continue;
    if (/[฿$]\s?[\d,.]+|ซื้อเลย|จำหน่ายไป|รีวิว|การจัดส่ง|คืนสินค้า/i.test(line)) continue;
    const label = match[1];
    const options = byLabel.get(label) ?? [];
    options.push(line);
    byLabel.set(label, options);
  }
  const groups = Array.from(byLabel.entries())
    .map(([label, options]) => [label, Array.from(new Set(options)).slice(0, 16)] as const)
    .filter(([, options]) => options.length >= 2);
  return groups.length > 0 ? groups.map(([label, options]) => `${label}\n- ${options.join("\n- ")}`).join("\n\n") : null;
}

function normalizeTikTokVariantOption(option: string) {
  return clean(option)
    .replace(/^[-•]\s*/, "")
    .replace(/^(?:สี|สีสัน|กลิ่น|รส|ความจุ|ขนาด)\s*[:：]\s*/i, "")
    .trim();
}

function formatTikTokVariantGroups(groups: Array<{ name: string; selected: string | null; options: string[] }>) {
  const byName = new Map<string, string[]>();
  for (const group of groups) {
    const name = clean(group.name);
    if (!name) continue;
    const options = byName.get(name) ?? [];
    for (const option of [group.selected, ...group.options]) {
      if (!option) continue;
      const normalized = normalizeTikTokVariantOption(option);
      if (!normalized || normalized === "-" || TIKTOK_VARIANT_STOP_PATTERN.test(normalized) || TIKTOK_VARIANT_NOISE_PATTERN.test(normalized)) continue;
      if (normalized === name && group.options.length === 0) continue;
      options.push(normalized);
    }
    if (options.length > 0) byName.set(name, Array.from(new Set(options)));
  }

  return Array.from(byName.entries())
    .filter(([, options]) => options.length > 0)
    .map(([name, options]) => `${name}\n- ${options.slice(0, 16).join("\n- ")}`)
    .join("\n\n");
}

function collectTikTokVariantsFromText(sourceText: string) {
  const lines = sourceText.split(/\n+/).map((line) => clean(line)).filter(Boolean);
  const groups: Array<{ name: string; selected: string | null; options: string[] }> = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(TIKTOK_VARIANT_LABEL_PATTERN);
    if (!match) continue;
    const name = match[1];
    const selected = match[2]?.trim() || null;
    const options: string[] = [];
    if (selected && selected.length <= 80 && !TIKTOK_VARIANT_STOP_PATTERN.test(selected) && !TIKTOK_VARIANT_NOISE_PATTERN.test(selected)) {
      options.push(selected);
    }
    for (const line of lines.slice(i + 1, i + 12)) {
      if (TIKTOK_VARIANT_LABEL_PATTERN.test(line) || TIKTOK_VARIANT_STOP_PATTERN.test(line)) break;
      if (TIKTOK_VARIANT_NOISE_PATTERN.test(line)) continue;
      if (/[฿$]\s?[\d,.]+|ซื้อเลย|จำหน่ายไป|รีวิว|การจัดส่ง|คืนสินค้า/i.test(line)) break;
      if (line.length > 80) break;
      options.push(line);
    }
    groups.push({ name, selected, options: Array.from(new Set([selected, ...options].filter(Boolean) as string[])) });
  }
  const variantText = formatTikTokVariantGroups(groups);
  return variantText || collectTikTokPrefixedVariantOptions(lines);
}

function collectTikTokVariants() {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("section, article, div"))
    .map((el) => ({ el, text: el.innerText || "", rect: el.getBoundingClientRect() }))
    .map((item) => ({ ...item, compactText: clean(item.text) }))
    .filter((item) => item.compactText.length >= 10 && item.compactText.length <= 4_000)
    .filter((item) => !TIKTOK_VARIANT_NOISE_PATTERN.test(item.compactText))
    .filter((item) => item.text.split(/\n+/).some((line) => TIKTOK_VARIANT_LABEL_PATTERN.test(line.trim())))
    .filter((item) => /จำนวน|ซื้อเลย|เพิ่มลงรถเข็น|จัดส่งฟรี/i.test(item.compactText));

  for (const candidate of candidates.sort((left, right) => left.compactText.length - right.compactText.length)) {
    const parsed = collectTikTokVariantsFromText(candidate.text);
    if (parsed) return parsed;
  }

  return null;
}

export function scanTikTokShopCategoryPage(limit = 60): CategoryProductCandidate[] {
  const currentPage = parseTikTokShopUrl(location.href);
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .filter((anchor) => /\/shop\/[^/]+\/pdp\/\d+|\/view\/product\/\d+/i.test(anchor.href));
  const uniqueAnchors = Array.from(new Map(anchors.map((anchor) => {
    const parsed = parseTikTokShopUrl(anchor.href);
    return [parsed.canonicalUrl ?? anchor.href, anchor] as const;
  })).values()).slice(0, limit);
  return uniqueAnchors.map((anchor, index): CategoryProductCandidate => {
    const parsedUrl = parseTikTokShopUrl(anchor.href);
    const card = closestProductCard(anchor);
    const text = clean(card?.innerText || anchor.innerText || "");
    const image = card?.querySelector<HTMLImageElement>("img[src], img[srcset]");
    const lines = (card?.innerText || anchor.innerText || "").split(/\n+/).map((line) => clean(line)).filter(Boolean);
    const title = lines.find((line) => line.length > 8 && !/[฿$]\s?[\d,.]+|free shipping|จำหน่ายแล้ว|\d(?:\.\d)?\s*[★⭐]/i.test(line))
      || text.split(/[|฿$]/)[0]?.trim()
      || anchor.title
      || anchor.href;
    const priceText = text.match(/[฿$]\s?[\d,.]+/)?.[0] ?? null;
    const ratingText = text.match(/\b([1-5](?:\.\d)?)\s*[★⭐]/)?.[1] ?? null;
    const soldCountText = text.match(/(?:[\d.,]+[kKmM]?|[\d.,]+)\s*(?:จำหน่ายแล้ว|sold)/i)?.[0]
      ?? text.match(/(?:sold|ขายแล้ว|จำหน่ายไป)\s?[^\n\r|]+/i)?.[0]
      ?? null;
    const discountText = text.match(/-\d+%/)?.[0] ?? null;
    const imageUrl = image?.currentSrc || image?.src || null;
    const hasFreeShipping = /free shipping|ส่งฟรี/i.test(text);
    const scored = scoreTikTokCandidate({ priceText, discountText, ratingText, soldCountText, imageUrl, hasFreeShipping, rank: index + 1 });
    return {
      platform: "tiktok_shop",
      sourceUrl: currentPage.canonicalUrl ?? currentPage.cleanUrl,
      externalProductId: parsedUrl.productId,
      externalShopId: null,
      title,
      url: parsedUrl.canonicalUrl ?? anchor.href,
      priceText,
      soldCountText,
      discountText,
      ratingText,
      imageUrl,
      originalUrl: parsedUrl.originalUrl,
      cleanUrl: parsedUrl.cleanUrl,
      canonicalUrl: parsedUrl.canonicalUrl,
      urlFormat: parsedUrl.format,
      badges: hasFreeShipping ? ["free_shipping"] : [],
      position: index,
      score: scored.score,
      scoreReasons: [
        parsedUrl.productId ? "พบ product id" : "พบ product link",
        ...scored.reasons,
      ],
    };
  }).filter((candidate) => candidate.title.length > 4);
}

export function scanTikTokShopProductPage(): ProductCapturePayload {
  const parsedUrl = parseTikTokShopUrl(location.href);
  const rawDomText = document.body.innerText.slice(0, 80_000);
  const productName = extractProductName(rawDomText);
  const categoryData = extractTikTokCategoryData(productName);
  const categoryText = categoryData?.text ?? null;
  const priceMatches = Array.from(rawDomText.matchAll(/[฿$]\s?[\d,.]+/g)).map((match) => match[0]);
  const priceCurrentText = priceMatches[0] ?? null;
  const priceOriginalText = priceMatches.find((price, index) => index > 0 && price !== priceCurrentText) ?? null;
  const soldCountText = matchLine(rawDomText, [/(?:sold|ขายแล้ว|จำหน่ายไป)\s?[^\n\r|]+/i]);
  const shopName = matchLine(rawDomText, [/Sold by\s+([^\n\r|]+)/i, /ขายโดย\s+([^\n\r|]+)/i]);
  const { ratingScoreText, reviewCountText } = extractTikTokRatingAndReviews(rawDomText);
  const imageCandidates = collectTikTokImages();
  const descriptionText = extractDescription(rawDomText);
  const variantsText = collectTikTokVariants();
  const discountText = rawDomText.match(/-\d+%/)?.[0] ?? null;
  const stockText = rawDomText.match(/(?:stock|available|คลัง|สต็อก)\s?[^\n\r|]+/i)?.[0] ?? null;
  const sellerLocationText = rawDomText.match(/(?:ships from|ส่งจาก|location)\s?[^\n\r|]+/i)?.[0] ?? null;
  const priceCurrentValue = parseMoneyValue(priceCurrentText);
  const priceOriginalValue = parseMoneyValue(priceOriginalText);
  const discountPercent = parseDiscountPercent(discountText);
  const ratingScoreValue = parseRatingValue(ratingScoreText);
  const reviewCountValue = parseCompactCount(reviewCountText);
  const soldCountValue = parseCompactCount(soldCountText);
  const selectedMainImage = imageCandidates.find((candidate) => candidate.kind === "main" && candidate.selected);
  const fieldWarnings = [tinyMainImageWarning(selectedMainImage)].filter(Boolean) as string[];
  const fieldEvidence = Object.fromEntries(Object.entries({
    productName: evidence(productName, "text:title_context", 0.68),
    priceCurrentText: evidence(priceCurrentText, "text:price_regex", 0.72, { normalized: priceCurrentValue }),
    priceOriginalText: evidence(priceOriginalText, "text:price_regex", 0.58, { normalized: priceOriginalValue }),
    discountText: evidence(discountText, "text:discount_regex", 0.7, { normalized: discountPercent }),
    ratingScoreText: evidence(ratingScoreText, "text:rating_context", 0.68, { normalized: ratingScoreValue }),
    reviewCountText: evidence(reviewCountText, "text:review_context", 0.66, { normalized: reviewCountValue }),
    soldCountText: evidence(soldCountText, "text:sold_context", 0.66, { normalized: soldCountValue }),
    shopName: evidence(shopName, "text:seller_context", 0.64),
    categoryText: evidence(categoryText, categoryData?.source ?? "text:category", 0.64, { normalized: categoryData?.path }),
    stockText: evidence(stockText, "text:stock_context", 0.56),
    sellerLocationText: evidence(sellerLocationText, "text:seller_location_context", 0.56),
    variantsText: evidence(variantsText, "dom:variant_section", 0.58),
    descriptionText: evidence(descriptionText, "text:description_context", 0.62),
  }).filter(([, value]) => value)) as Record<string, FieldEvidence>;
  const descriptionStart = rawDomText.search(/เกี่ยวกับสินค้ารายการนี้|คำอธิบายสินค้า/i);
  const headerText = descriptionStart > 0 ? rawDomText.slice(0, descriptionStart) : rawDomText.slice(0, 12_000);
  return {
    platform: "tiktok_shop",
    sourceUrl: parsedUrl.canonicalUrl ?? parsedUrl.cleanUrl,
    originalSourceUrl: parsedUrl.originalUrl,
    cleanSourceUrl: parsedUrl.cleanUrl,
    canonicalSourceUrl: parsedUrl.canonicalUrl,
    sourceUrlFormat: parsedUrl.format,
    pageType: "product",
    externalProductId: parsedUrl.productId,
    externalShopId: null,
    pageTitle: document.title,
    productName,
    priceCurrentText,
    priceCurrentValue,
    priceOriginalText,
    priceOriginalValue,
    currency: currencyFromPrice(priceCurrentText),
    discountText,
    discountPercent,
    ratingScoreText,
    ratingScoreValue,
    reviewCountText,
    reviewCountValue,
    soldCountText,
    soldCountValue,
    shopName,
    isMall: null,
    categoryText,
    categoryPath: categoryData?.path,
    brandText: null,
    stockText,
    variantsText,
    sellerLocationText,
    descriptionText,
    specificationText: null,
    imageCandidates,
    fieldEvidence,
    fieldWarnings,
    rawDomText,
    htmlBlocks: [
      { name: "product_header", text: headerText.slice(0, 12_000), outerHTML: undefined, metadata: { adapter: "tiktok_shop", parsedUrl } },
      { name: "description", text: descriptionText.slice(0, 12_000), outerHTML: undefined, metadata: { adapter: "tiktok_shop" } },
    ],
  };
}
