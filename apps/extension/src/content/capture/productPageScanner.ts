import type { FieldEvidence, ImageCandidate, ProductCapturePayload } from "../../shared/types";
import { parseDiscountPercent, parseShopeeProductUrl, parseSoldCount, parseThaiPrice } from "../utils/number";

function textOf(selector: string): string | null {
  const node = document.querySelector<HTMLElement>(selector);
  return node?.innerText?.trim() || null;
}

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.filter((url) => /^https?:\/\//.test(url))));
}

function bestUrlFromSrcset(srcset: string | null | undefined): string | null {
  if (!srcset) return null;
  const candidates = srcset
    .split(",")
    .map((part) => {
      const [url, descriptor] = part.trim().split(/\s+/, 2);
      const width = descriptor?.endsWith("w") ? Number(descriptor.slice(0, -1)) : 0;
      const density = descriptor?.endsWith("x") ? Number(descriptor.slice(0, -1)) * 1000 : 0;
      return { url, score: Number.isFinite(width + density) ? width + density : 0 };
    })
    .filter((item) => /^https?:\/\//.test(item.url))
    .sort((left, right) => right.score - left.score);
  return candidates[0]?.url ?? null;
}

function imageUrlFromElement(el: HTMLElement): string | null {
  if (el instanceof HTMLImageElement) {
    return bestUrlFromSrcset(el.srcset) || el.currentSrc || el.src || null;
  }
  if (el instanceof HTMLSourceElement) {
    return bestUrlFromSrcset(el.srcset) || null;
  }
  if (el instanceof HTMLVideoElement) {
    return el.poster || null;
  }
  const bg = window.getComputedStyle(el).backgroundImage;
  return bg.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/)?.[1] ?? null;
}

function imageElements(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("img[src], img[srcset], picture source[srcset], video[poster], [style*='background']"));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function currencyFromPrice(raw: string | null): string | null {
  if (!raw) return null;
  if (/฿/.test(raw)) return "THB";
  if (/\$/.test(raw)) return "USD";
  return null;
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

function elementDocumentTop(el: Element): number {
  return el.getBoundingClientRect().top + window.scrollY;
}

function nearestContextText(el: HTMLElement, maxDepth = 6): string {
  const chunks: string[] = [];
  let current: HTMLElement | null = el;
  for (let depth = 0; current && depth < maxDepth; depth += 1) {
    const text = (current.innerText || current.textContent || "").replace(/\s+/g, " ").trim();
    if (text && text.length <= 8_000) chunks.push(text);
    current = current.parentElement;
  }
  return chunks.join(" ");
}

function hasRelatedProductContext(el: HTMLElement): boolean {
  return /Bundle Deals|ดีลแบบแพ็ก|ซื้อ\s*\d+\s*ชิ้น\s*ลด|คุณอาจจะชอบสิ่งนี้|สินค้าที่คล้ายกัน|สินค้าแนะนำ|สินค้าที่เกี่ยวข้อง|ร้านค้าแนะนำ|ดูเพิ่มเติม|You may also like|Related products|Similar products|Recommended/i.test(nearestContextText(el));
}

const RELATED_SECTION_PATTERN = /Bundle Deals|ดีลแบบแพ็ก|ซื้อ\s*\d+\s*ชิ้น\s*ลด|คุณอาจจะชอบสิ่งนี้|สินค้าที่คล้ายกัน|สินค้าแนะนำ|สินค้าที่เกี่ยวข้อง|ร้านค้าแนะนำ|You may also like|Related products|Similar products|Recommended/i;
const REVIEW_SECTION_PATTERN = /คะแนนของสินค้า|รีวิวสินค้า|ความคิดเห็น|ratings?|reviews?/i;

function firstDocumentTopByText(pattern: RegExp): number | null {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textMatches: HTMLElement[] = [];
  let node = walker.nextNode();
  while (node) {
    const text = (node.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length > 0 && text.length <= 160 && pattern.test(text)) {
      const parent = node.parentElement;
      if (parent) textMatches.push(parent);
    }
    node = walker.nextNode();
  }
  const textMatch = textMatches.sort((left, right) => elementDocumentTop(left) - elementDocumentTop(right))[0];
  if (textMatch) return elementDocumentTop(textMatch);

  const elementMatch = Array.from(document.querySelectorAll<HTMLElement>("section, article, div, h2, h3"))
    .map((el) => ({ el, text: (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim() }))
    .filter((item) => item.text.length > 0 && item.text.length <= 4_000 && pattern.test(item.text))
    .sort((left, right) => elementDocumentTop(left.el) - elementDocumentTop(right.el))[0];
  return elementMatch ? elementDocumentTop(elementMatch.el) : null;
}

function productHeaderImageCutoff(descriptionNode: HTMLElement | null): number {
  const titleTop = document.querySelector<HTMLElement>("h1") ? elementDocumentTop(document.querySelector<HTMLElement>("h1")!) : window.scrollY;
  const descriptionTop = descriptionNode ? elementDocumentTop(descriptionNode) : null;
  const hardCutoff = titleTop + 1_250;
  return Math.min(
    descriptionTop != null ? descriptionTop - 80 : Number.POSITIVE_INFINITY,
    hardCutoff,
  );
}

function collectImages(kind: ImageCandidate["kind"], root: ParentNode = document, options: { mainCutoffTop?: number } = {}): ImageCandidate[] {
  const candidates = imageElements(root)
    .map((el) => ({ el, rect: el.getBoundingClientRect(), url: imageUrlFromElement(el) }))
    .filter((item): item is { el: HTMLElement; rect: DOMRect; url: string } => {
      const { el, rect, url } = item;
      if (!url) return false;
      if (/sprite|logo|avatar|icon/i.test(url)) return false;
      if (hasRelatedProductContext(el)) return false;
      if (kind !== "main") return rect.width >= 40 && rect.height >= 40;
      if (options.mainCutoffTop != null && elementDocumentTop(el) > options.mainCutoffTop) return false;
      return rect.width >= 70 && rect.height >= 70 && rect.top > -80 && rect.top < window.innerHeight * 1.4;
    })
    .sort((a, b) => {
      return (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height);
    })
    .map(({ el, rect, url }) => {
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      const alt = el instanceof HTMLImageElement ? el.alt : "";
      return { url, width, height, alt };
    });
  const byUrl = new Map(candidates.filter((candidate) => /^https?:\/\//.test(candidate.url)).map((candidate) => [candidate.url, candidate]));
  return uniqueUrls(candidates.map((candidate) => candidate.url))
    .slice(0, kind === "main" ? 20 : 30)
    .map((url, position) => {
      const image = byUrl.get(url);
      return {
        url,
        kind,
        source: "dom",
        evidenceId: `image.${kind}.${position}`,
        role: kind === "main" ? (position === 0 ? "primary" : "gallery") : kind,
        quality: imageQuality(image?.width, image?.height),
        position,
        width: image?.width,
        height: image?.height,
        selected: kind === "main" && position < 8,
        metadata: {
          alt: image?.alt || undefined,
          warning: kind === "main" && position === 0 && image?.width != null && image.height != null && (image.width < 300 || image.height < 300)
            ? "tiny_main_image"
            : undefined,
        },
      };
    });
}

function matchLine(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1]) return m[1].replace(/\s+/g, " ").trim().slice(0, 500);
    if (m?.[0]) return m[0].replace(/\s+/g, " ").trim().slice(0, 500);
  }
  return null;
}

function cleanCategoryPart(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[>›/]+$/g, "")
    .trim();
}

function isCategoryNoise(value: string, productName: string | null): boolean {
  const text = cleanCategoryPart(value);
  const normalizedProductName = productName ? cleanCategoryPart(productName) : "";
  if (!text) return true;
  if (/^(Shopee|Shopee Home|หมวดหมู่|Category|หน้าหลัก|เปิดร้านค้า|ดาวน์โหลด|ติดตามเรา|ความช่วยเหลือ)$/i.test(text)) return true;
  if (/[฿$]\s?[\d,.]+|รีวิว|ขายแล้ว|จำหน่ายไป|รายงานสินค้า|ซื้อสินค้า|เพิ่มไปยังรถเข็น/i.test(text)) return true;
  if (normalizedProductName && (text === normalizedProductName || text.includes(normalizedProductName.slice(0, 80)))) return true;
  return false;
}

function formatCategoryPath(parts: string[], productName: string | null): string[] {
  return Array.from(new Set(parts.map(cleanCategoryPart).filter((part) => !isCategoryNoise(part, productName))))
    .filter((part) => !/^(?:หมวดหมู่\s*)?Shopee$/i.test(part) && !/^หมวดหมู่\s+Shopee$/i.test(part))
    .slice(0, 12);
}

function categoryFromParts(parts: string[], productName: string | null, source: string) {
  const path = formatCategoryPath(parts, productName);
  return path.length > 0 ? { text: path[path.length - 1], path, source } : null;
}

function extractShopeeCategoryData(productName: string | null, bodyText: string): { text: string; path: string[]; source: string } | null {
  const titleNode = document.querySelector<HTMLElement>("h1");
  const titleTop = titleNode?.getBoundingClientRect().top ?? 420;
  const breadcrumbLinks = Array.from(document.querySelectorAll<HTMLElement>("a[href], [role='link']"))
    .map((el) => ({ text: cleanCategoryPart(el.innerText || el.textContent || ""), rect: el.getBoundingClientRect() }))
    .filter((item) => item.text.length >= 2 && item.text.length <= 120)
    .filter((item) => item.rect.top >= 90 && item.rect.top <= Math.max(260, titleTop + 30));
  const rows = new Map<number, string[]>();
  for (const item of breadcrumbLinks) {
    const rowTop = Math.round(item.rect.top / 8) * 8;
    rows.set(rowTop, [...(rows.get(rowTop) ?? []), item.text]);
  }
  const breadcrumbRow = Array.from(rows.values())
    .filter((parts) => parts.some((part) => /^Shopee$/i.test(part)) && parts.length >= 3)
    .sort((a, b) => b.length - a.length)[0];
  if (breadcrumbRow) {
    const fromBreadcrumb = categoryFromParts(breadcrumbRow, productName, "dom:breadcrumb");
    if (fromBreadcrumb) return fromBreadcrumb;
  }

  const breadcrumbLine = bodyText
    .split(/\n+/)
    .map(cleanCategoryPart)
    .find((line) => /^Shopee\s*[>›]/i.test(line) && line.length <= 500);
  if (breadcrumbLine) {
    const fromLine = categoryFromParts(breadcrumbLine.split(/[>›]/), productName, "text:breadcrumb");
    if (fromLine) return fromLine;
  }

  const lines = bodyText.split(/\n+/).map(cleanCategoryPart).filter(Boolean);
  const labelIndex = lines.findIndex((line) => /^(หมวดหมู่|Category)$/i.test(line));
  if (labelIndex >= 0) {
    const specParts: string[] = [];
    for (const line of lines.slice(labelIndex + 1, labelIndex + 10)) {
      if (/^(คลัง|สินค้า|ส่งจาก|รายละเอียดสินค้า|ข้อมูลจำเพาะ|Description|Stock|Ships from)$/i.test(line)) break;
      specParts.push(line);
    }
    const fromSpec = categoryFromParts(specParts, productName, "text:category_label");
    if (fromSpec) return fromSpec;
  }

  const inline = bodyText.match(/(?:หมวดหมู่|Category)\s*[:：]?\s*([^\n\r]{1,240})/i)?.[1] ?? null;
  return inline ? categoryFromParts(inline.split(/[>›]/), productName, "text:category_inline") : null;
}

const VARIANT_LABEL_PATTERN = /^(แพ็ค|แพค|ตัวเลือก|สี|ขนาด|ความจุ|แบบ|รุ่น|กลิ่น|รส|color|size|capacity|option|variant)(?:\s*[:：]\s*(.*)|\s*)$/i;
const VARIANT_PREFIX_OPTION_PATTERN = /^(รส|กลิ่น|สี|สีสัน)([^\s].{0,60})$/i;
const VARIANT_STOP_PATTERN = /^(จำนวน|การจัดส่ง|ซื้อเลย|เพิ่มไปยังรถเข็น|รายงานสินค้า|แชร์|Favorite|คะแนน|รีวิว|ขายแล้ว|จำหน่ายไป|หมวดหมู่|คลัง|ส่งจาก|฿|Flash Sale|รายละเอียดสินค้า|ข้อมูลจำเพาะ)/i;
const VARIANT_NOISE_PATTERN = /ShopeeSave|Main images|Variant images|Description images|Product video|Description content|powered by|Shopee Home|เปิดร้านค้า|ดาวน์โหลด|ติดตามเรา|ความงามและของใช้ส่วนตัว|ดูแลช่องปาก/i;

function collectPrefixedVariantOptions(lines: string[]): string | null {
  const byLabel = new Map<string, string[]>();
  for (const line of lines) {
    const match = line.match(VARIANT_PREFIX_OPTION_PATTERN);
    if (!match || VARIANT_STOP_PATTERN.test(line) || VARIANT_NOISE_PATTERN.test(line)) continue;
    if (/[฿$]\s?[\d,.]+|-\d+%|รีวิว|reviews?|ขายแล้ว|จำหน่ายไป|รถเข็น|สินค้าแนะนำ/i.test(line)) continue;
    const label = match[1];
    const options = byLabel.get(label) ?? [];
    options.push(line);
    byLabel.set(label, options);
  }

  const groups = Array.from(byLabel.entries())
    .map(([label, options]) => [label, Array.from(new Set(options)).slice(0, 16)] as const)
    .filter(([, options]) => options.length >= 2);
  return groups.length > 0
    ? groups.map(([label, options]) => `${label}\n- ${options.join("\n- ")}`).join("\n\n").slice(0, 2000)
    : null;
}

function collectVariantTextFromText(sourceText: string): string | null {
  const lines = sourceText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const groups: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(VARIANT_LABEL_PATTERN);
    if (!match) continue;

    const label = match[1];
    const selected = match[2]?.trim();
    const options: string[] = [];
    if (selected && selected.length <= 80 && !VARIANT_STOP_PATTERN.test(selected) && !VARIANT_NOISE_PATTERN.test(selected)) {
      options.push(selected);
    }

    for (const line of lines.slice(i + 1, i + 16)) {
      if (VARIANT_LABEL_PATTERN.test(line) || VARIANT_STOP_PATTERN.test(line)) break;
      if (VARIANT_NOISE_PATTERN.test(line)) continue;
      if (/[฿$]\s?[\d,.]+|-\d+%|รีวิว|reviews?|ขายแล้ว|จำหน่ายไป|รถเข็น|สินค้าแนะนำ/i.test(line)) break;
      if (line.length > 80) break;
      options.push(line);
    }

    const uniqueOptions = Array.from(new Set(options.filter(Boolean))).slice(0, 12);
    groups.push(uniqueOptions.length > 0 ? `${label}\n- ${uniqueOptions.join("\n- ")}` : label);
  }

  return groups.length > 0 ? groups.slice(0, 6).join("\n\n").slice(0, 2000) : collectPrefixedVariantOptions(lines);
}

function collectVariantText(): string | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("section, article, div"))
    .map((el) => ({ el, text: el.innerText || "", rect: el.getBoundingClientRect() }))
    .map((item) => ({ ...item, compactText: item.text.replace(/\s+/g, " ").trim() }))
    .filter((item) => item.compactText.length >= 10 && item.compactText.length <= 3_500)
    .filter((item) => !VARIANT_NOISE_PATTERN.test(item.compactText))
    .filter((item) => item.text.split(/\n+/).some((line) => VARIANT_LABEL_PATTERN.test(line.trim())))
    .filter((item) => /จำนวน|ซื้อเลย|เพิ่มไปยังรถเข็น|สินค้าพร้อมส่ง/i.test(item.compactText));

  for (const candidate of candidates.sort((left, right) => left.compactText.length - right.compactText.length)) {
    const parsed = collectVariantTextFromText(candidate.text);
    if (parsed) return parsed;
  }

  return null;
}

function extractShopeeRating(bodyText: string): string | null {
  const ratingNearReviews = bodyText.match(/(?:^|\s)([1-5](?:\.\d)?)\s*(?:★|⭐|ดาว|\s+[\d.,]+[kKmM]?\s*รีวิว|\s+reviews?)/i)?.[1];
  if (ratingNearReviews) return ratingNearReviews;
  const lines = bodyText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^[1-5](?:\.\d+)?$/.test(lines[i])) continue;
    const nearby = lines.slice(i, i + 4).join(" ");
    if (/รีวิว|reviews?|คะแนน|★|⭐/i.test(nearby)) return lines[i];
  }
  return null;
}

function extractShopeeReviewCount(bodyText: string): string | null {
  return matchLine(bodyText, [
    /[1-5](?:\.\d+)?\s+([\d.,]+[kKmM]?)\s*รีวิว/i,
    /รีวิว\s*([\d.,]+[kKmM]?)/i,
    /([\d.,]+[kKmM]?)\s*(?:reviews?|ratings?)/i,
  ]);
}

function findShopeeDescriptionNode(): HTMLElement | null {
  const markers = [/รายละเอียดสินค้า/i, /Product Description/i];
  const sections = Array.from(document.querySelectorAll<HTMLElement>("section, article, div"))
    .map((el) => ({ el, text: el.innerText?.replace(/\s+/g, " ").trim() || "", rect: el.getBoundingClientRect() }))
    .filter((item) => item.text.length >= 80 && item.text.length <= 18_000)
    .filter((item) => item.rect.width >= 240 || item.rect.height >= 80)
    .filter((item) => !/ShopeeSave|Main images|Variant images|Description images|Product video|Description content|powered by/i.test(item.text))
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

function trimShopeeDescription(text: string): string {
  let output = text.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const detailMarkers = ["รายละเอียดสินค้า", "Product Description"];
  const markerIndex = detailMarkers
    .map((marker) => output.toLowerCase().indexOf(marker.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? -1;
  if (markerIndex >= 0) {
    output = output.slice(markerIndex);
  }
  output = output
    .replace(/^(?:รายละเอียดสินค้า|Product Description)\s*/i, "")
    .trim();
  const stopMatch = output.search(/\s(?:รายละเอียดสินค้าสร้างโดย AI|AI-generated product description|Product description generated by AI|คะแนนของสินค้า|รีวิวสินค้า|ความคิดเห็น|สินค้าแนะนำ|สินค้าที่คล้ายกัน|ร้านค้าแนะนำ|ข้อมูลจำเพาะของสินค้า)\b/i);
  if (stopMatch > 80) {
    output = output.slice(0, stopMatch).trim();
  }
  return output.slice(0, 12_000);
}

function isUsableShopeeDescription(value: string): boolean {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length < 20) return false;
  if (/\{rppd_link\}|rppd_link/i.test(text)) return false;
  return !/^ข้ามไปที่เนื้อหาหลัก|Shopee Home|Main images|Description images/i.test(text);
}

function extractShopeeDescriptionText(bodyText: string, descriptionNode: HTMLElement | null): string | null {
  const fromNode = descriptionNode ? trimShopeeDescription(descriptionNode.innerText || "") : "";
  if (fromNode && isUsableShopeeDescription(fromNode)) {
    return fromNode;
  }

  const bodyDescription = trimShopeeDescription(bodyText);
  return bodyDescription && isUsableShopeeDescription(bodyDescription)
    ? bodyDescription
    : null;
}

function uniqueImageCandidates(candidates: ImageCandidate[]): ImageCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}

function collectReviewImages(): ImageCandidate[] {
  const reviewTop = firstDocumentTopByText(REVIEW_SECTION_PATTERN);
  const relatedTop = firstDocumentTopByText(RELATED_SECTION_PATTERN);
  const isBeforeRelated = (el: HTMLElement) => relatedTop == null || elementDocumentTop(el) < relatedTop - 24;
  const reviewRoots = Array.from(document.querySelectorAll<HTMLElement>("section, article, li, div"))
    .map((el) => ({ el, text: el.innerText || "", rect: el.getBoundingClientRect() }))
    .filter((item) => {
      const visible = item.rect.bottom >= -200 && item.rect.top <= window.innerHeight + 800;
      const reviewText = /คะแนนของสินค้า|ความคิดเห็น|รีวิวสินค้า|รีวิว|ratings?|reviews?|มีรูปภาพ\/วิดีโอ|ตัวเลือกสินค้า|คุณภาพ|การใช้งาน/i.test(item.text);
      const reviewShape = /[★⭐]{3,}|\b\d{4}-\d{2}-\d{2}\b/.test(item.text);
      const top = elementDocumentTop(item.el);
      const inReviewBand = reviewTop == null || top >= reviewTop - 220;
      return visible && inReviewBand && isBeforeRelated(item.el) && !hasRelatedProductContext(item.el) && (reviewText || reviewShape);
    })
    .sort((left, right) => (left.rect.top - right.rect.top) || (left.text.length - right.text.length))
    .slice(0, 16)
    .map((item) => item.el);
  const candidates: Array<{ url: string; width: number; height: number }> = [];
  for (const root of reviewRoots) {
    for (const img of Array.from(root.querySelectorAll<HTMLImageElement>("img[src], img[srcset]"))) {
      const rect = img.getBoundingClientRect();
      const url = imageUrlFromElement(img) || img.currentSrc || img.src;
      if (isBeforeRelated(img) && !hasRelatedProductContext(img) && rect.width >= 40 && rect.height >= 40 && !/avatar|profile|sprite|logo|icon/i.test(url)) {
        candidates.push({ url, width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    }
    for (const video of Array.from(root.querySelectorAll<HTMLVideoElement>("video[poster]"))) {
      const rect = video.getBoundingClientRect();
      const url = video.poster;
      if (isBeforeRelated(video) && !hasRelatedProductContext(video) && rect.width >= 40 && rect.height >= 40 && /^https?:\/\//.test(url)) {
        candidates.push({ url, width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    }
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("[style*='background']"))) {
      const rect = el.getBoundingClientRect();
      const bg = window.getComputedStyle(el).backgroundImage;
      const url = bg.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/)?.[1];
      if (url && isBeforeRelated(el) && !hasRelatedProductContext(el) && rect.width >= 40 && rect.height >= 40 && !/avatar|profile|sprite|logo|icon/i.test(url)) {
        candidates.push({ url, width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    }
  }
  const byUrl = new Map(candidates.map((candidate) => [candidate.url, candidate]));
  return uniqueUrls(candidates.map((candidate) => candidate.url))
    .slice(0, 30)
    .map((url, position) => {
      const image = byUrl.get(url);
      return {
        url,
        kind: "review",
        source: "dom",
        evidenceId: `image.review.${position}`,
        role: "review",
        quality: imageQuality(image?.width, image?.height),
        position,
        width: image?.width,
        height: image?.height,
        selected: false,
      };
    });
}

async function collectThumbnailImages(mainCutoffTop: number): Promise<ImageCandidate[]> {
  const thumbImages = imageElements(document)
    .filter((el) => {
      const rect = el.getBoundingClientRect();
      const url = imageUrlFromElement(el);
      if (!url || /sprite|logo|avatar|icon/i.test(url)) return false;
      if (elementDocumentTop(el) > mainCutoffTop) return false;
      if (hasRelatedProductContext(el)) return false;
      return rect.width >= 36 && rect.width <= 140 && rect.height >= 36 && rect.height <= 140 && rect.top < window.innerHeight * 1.2;
    })
    .slice(0, 30);
  const candidates: Array<{ url: string; width: number; height: number }> = [];
  for (const img of thumbImages) {
    img.scrollIntoView({ block: "center", inline: "center" });
    img.click();
    await delay(350);
    candidates.push(...imageElements(document)
      .map((candidate) => ({ candidate, rect: candidate.getBoundingClientRect(), url: imageUrlFromElement(candidate) }))
      .filter((item): item is { candidate: HTMLElement; rect: DOMRect; url: string } => {
        const { candidate, rect, url } = item;
        if (!url || /sprite|logo|avatar|icon/i.test(url)) return false;
        if (elementDocumentTop(candidate) > mainCutoffTop) return false;
        if (hasRelatedProductContext(candidate)) return false;
        return rect.width >= 180 && rect.height >= 180 && rect.top < window.innerHeight * 1.25;
      })
      .map(({ rect, url }) => ({ url, width: Math.round(rect.width), height: Math.round(rect.height) })));
  }
  const byUrl = new Map(candidates.map((candidate) => [candidate.url, candidate]));
  return uniqueUrls(candidates.map((candidate) => candidate.url))
    .filter((url) => !/sprite|logo|avatar|icon/i.test(url))
    .slice(0, 20)
    .map((url, position) => {
      const image = byUrl.get(url);
      return {
        url,
        kind: "main",
        source: "dom",
        evidenceId: `image.main.${position}`,
        role: position === 0 ? "primary" : "gallery",
        quality: imageQuality(image?.width, image?.height),
        position,
        width: image?.width,
        height: image?.height,
        selected: position < 8,
        metadata: {
          warning: position === 0 && image?.width != null && image.height != null && (image.width < 300 || image.height < 300)
            ? "tiny_main_image"
            : undefined,
        },
      };
    });
}

export async function scanShopeeProductPage(options: { interactive?: boolean } = {}): Promise<ProductCapturePayload> {
  const interactive = options.interactive ?? true;
  const shopeeUrl = parseShopeeProductUrl(location.href);
  const sourceUrl = shopeeUrl.canonicalUrl ?? shopeeUrl.cleanUrl;
  const bodyText = document.body.innerText.slice(0, 80_000);
  const title = textOf("h1") || document.title.replace(/\|.*$/, "").trim() || null;
  const price = bodyText.match(/฿\s?[\d,.]+/)?.[0] ?? null;
  const discount = bodyText.match(/-\d+%/)?.[0] ?? null;
  const sold = bodyText.match(/(?:ขายแล้ว|sold)\s?[^\n\r|]+/i)?.[0] ?? null;
  const rating = extractShopeeRating(bodyText);
  const reviewCount = extractShopeeReviewCount(bodyText);
  const stockText = matchLine(bodyText, [/(?:คลัง|สต็อก|stock)\s*[:：]?\s*[^\n\r]{1,80}/i, /(?:เหลือ|available)\s*\d+[^\n\r]{0,40}/i]);
  const sellerLocationText = matchLine(bodyText, [/(?:ส่งจาก|ships from|location)\s*[:：]?\s*[^\n\r]{1,120}/i]);
  const categoryData = extractShopeeCategoryData(title, bodyText);
  const categoryText = categoryData?.text ?? null;
  const variantsText = collectVariantText();
  const descriptionNode = findShopeeDescriptionNode();
  const mainImageCutoffTop = productHeaderImageCutoff(descriptionNode);
  const thumbnailImages = interactive ? await collectThumbnailImages(mainImageCutoffTop) : [];
  if (interactive && descriptionNode) {
    descriptionNode.scrollIntoView({ block: "start" });
    await delay(700);
  }
  const descriptionText = extractShopeeDescriptionText(bodyText, descriptionNode);
  const mainImages = thumbnailImages.length > 0 ? thumbnailImages : collectImages("main", document, { mainCutoffTop: mainImageCutoffTop });
  const imageCandidates = uniqueImageCandidates([
    ...mainImages,
    ...imageElements(descriptionNode ?? document.createElement("div"))
      .map((img) => ({ img, url: imageUrlFromElement(img), rect: img.getBoundingClientRect() }))
      .filter((item): item is { img: HTMLElement; url: string; rect: DOMRect } => Boolean(item.url) && !hasRelatedProductContext(item.img))
      .map(({ img, url, rect }, position) => {
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        return {
          url,
          kind: "description" as const,
          source: "dom" as const,
          evidenceId: `image.description.${position}`,
          role: "description" as const,
          quality: imageQuality(width, height),
          position,
          width,
          height,
          selected: false,
          metadata: { alt: img instanceof HTMLImageElement ? img.alt || undefined : undefined },
        };
      }),
    ...collectReviewImages(),
  ]);
  const priceCurrentValue = parseThaiPrice(price);
  const priceOriginalText = null;
  const priceOriginalValue = parseThaiPrice(priceOriginalText);
  const discountPercent = parseDiscountPercent(discount);
  const ratingScoreValue = parseRatingValue(rating);
  const reviewCountValue = parseSoldCount(reviewCount);
  const soldCountValue = parseSoldCount(sold);
  const selectedMainImage = imageCandidates.find((candidate) => candidate.kind === "main" && candidate.selected);
  const fieldWarnings = [tinyMainImageWarning(selectedMainImage)].filter(Boolean) as string[];
  const fieldEvidence = Object.fromEntries(Object.entries({
    productName: evidence(title, "dom:h1", 0.9, { selector: "h1" }),
    priceCurrentText: evidence(price, "text:price_regex", 0.76, { normalized: priceCurrentValue }),
    discountText: evidence(discount, "text:discount_regex", 0.74, { normalized: discountPercent }),
    ratingScoreText: evidence(rating, "text:rating_context", 0.72, { normalized: ratingScoreValue }),
    reviewCountText: evidence(reviewCount, "text:review_context", 0.72, { normalized: reviewCountValue }),
    soldCountText: evidence(sold, "text:sold_context", 0.7, { normalized: soldCountValue }),
    categoryText: evidence(categoryText, categoryData?.source ?? "text:category", 0.72, { normalized: categoryData?.path }),
    stockText: evidence(stockText, "text:stock_context", 0.62),
    sellerLocationText: evidence(sellerLocationText, "text:seller_location_context", 0.62),
    variantsText: evidence(variantsText, "dom:variant_section", 0.62),
    descriptionText: evidence(descriptionText, descriptionNode ? "dom:description_section" : "text:description_context", descriptionNode ? 0.76 : 0.58),
  }).filter(([, value]) => value)) as Record<string, FieldEvidence>;

  return {
    platform: "shopee",
    sourceUrl,
    originalSourceUrl: shopeeUrl.originalUrl,
    cleanSourceUrl: shopeeUrl.cleanUrl,
    canonicalSourceUrl: shopeeUrl.canonicalUrl,
    sourceUrlFormat: shopeeUrl.format,
    pageType: "product",
    externalProductId: shopeeUrl.itemId,
    externalShopId: shopeeUrl.shopId,
    pageTitle: document.title,
    productName: title,
    priceCurrentText: price,
    priceCurrentValue,
    priceOriginalText,
    priceOriginalValue,
    currency: currencyFromPrice(price),
    discountText: discount,
    discountPercent,
    ratingScoreText: rating,
    ratingScoreValue,
    reviewCountText: reviewCount,
    reviewCountValue,
    soldCountText: sold,
    soldCountValue,
    shopName: null,
    isMall: /mall|official|ร้านแนะนำ|preferred/i.test(bodyText),
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
    rawDomText: bodyText,
    htmlBlocks: [
      { name: "product_header", text: bodyText.slice(0, 12_000), outerHTML: document.body.innerHTML.slice(0, 20_000), metadata: { shopeeUrl } },
      { name: "description", text: descriptionText ?? "", outerHTML: descriptionNode?.outerHTML?.slice(0, 20_000), metadata: {} },
    ],
  };
}
