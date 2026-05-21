import type { ImageCandidate, ProductCapturePayload } from "../../shared/types";
import { parseShopeeProductUrl } from "../utils/number";

function textOf(selector: string): string | null {
  const node = document.querySelector<HTMLElement>(selector);
  return node?.innerText?.trim() || null;
}

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.filter((url) => /^https?:\/\//.test(url))));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectImages(kind: ImageCandidate["kind"], root: ParentNode = document): ImageCandidate[] {
  const urls = Array.from(root.querySelectorAll<HTMLImageElement>("img[src], img[srcset]"))
    .filter((img) => {
      const rect = img.getBoundingClientRect();
      const url = img.currentSrc || img.src;
      if (/sprite|logo|avatar|icon/i.test(url)) return false;
      if (kind !== "main") return rect.width >= 40 && rect.height >= 40;
      return rect.width >= 70 && rect.height >= 70 && rect.top > -80 && rect.top < window.innerHeight * 1.4;
    })
    .sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      return (bRect.width * bRect.height) - (aRect.width * aRect.height);
    })
    .map((img) => img.currentSrc || img.src);
  return uniqueUrls(urls)
    .slice(0, kind === "main" ? 20 : 30)
    .map((url, position) => ({ url, kind, source: "dom", position, selected: kind === "main" && position < 8 }));
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
  if (!text) return true;
  if (/^(Shopee|Shopee Home|หมวดหมู่|Category|หน้าหลัก|เปิดร้านค้า|ดาวน์โหลด|ติดตามเรา|ความช่วยเหลือ)$/i.test(text)) return true;
  if (/[฿$]\s?[\d,.]+|รีวิว|ขายแล้ว|จำหน่ายไป|รายงานสินค้า|ซื้อสินค้า|เพิ่มไปยังรถเข็น/i.test(text)) return true;
  if (productName && (text === productName || productName.includes(text) || text.includes(productName.slice(0, 80)))) return true;
  return false;
}

function formatCategoryParts(parts: string[], productName: string | null): string | null {
  const unique = Array.from(new Set(parts.map(cleanCategoryPart).filter((part) => !isCategoryNoise(part, productName))));
  if (unique.length === 0) return null;
  const category = unique.join(" > ").slice(0, 500);
  if (/^(?:หมวดหมู่\s*)?Shopee$/i.test(category) || /^หมวดหมู่\s+Shopee$/i.test(category)) return null;
  return category;
}

function extractShopeeCategory(productName: string | null, bodyText: string): string | null {
  const titleNode = document.querySelector<HTMLElement>("h1");
  const titleTop = titleNode?.getBoundingClientRect().top ?? 420;
  const breadcrumbParts = Array.from(document.querySelectorAll<HTMLElement>("a[href], [role='link']"))
    .map((el) => ({ text: cleanCategoryPart(el.innerText || el.textContent || ""), rect: el.getBoundingClientRect() }))
    .filter((item) => item.text.length >= 2 && item.text.length <= 120)
    .filter((item) => item.rect.top >= 50 && item.rect.top <= Math.max(260, titleTop + 80))
    .filter((item) => !isCategoryNoise(item.text, productName))
    .map((item) => item.text);
  const fromBreadcrumb = formatCategoryParts(breadcrumbParts, productName);
  if (fromBreadcrumb && fromBreadcrumb.includes(" > ")) return fromBreadcrumb;

  const lines = bodyText.split(/\n+/).map(cleanCategoryPart).filter(Boolean);
  const labelIndex = lines.findIndex((line) => /^(หมวดหมู่|Category)$/i.test(line));
  if (labelIndex >= 0) {
    const specParts: string[] = [];
    for (const line of lines.slice(labelIndex + 1, labelIndex + 10)) {
      if (/^(คลัง|สินค้า|ส่งจาก|รายละเอียดสินค้า|ข้อมูลจำเพาะ|Description|Stock|Ships from)$/i.test(line)) break;
      specParts.push(line);
    }
    const fromSpec = formatCategoryParts(specParts, productName);
    if (fromSpec) return fromSpec;
  }

  const inline = bodyText.match(/(?:หมวดหมู่|Category)\s*[:：]?\s*([^\n\r]{1,240})/i)?.[1] ?? null;
  return inline ? formatCategoryParts(inline.split(/[>›]/), productName) : null;
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
  const markerIndex = Math.max(...detailMarkers.map((marker) => output.toLowerCase().lastIndexOf(marker.toLowerCase())));
  if (markerIndex >= 0) {
    output = output.slice(markerIndex);
  }
  output = output
    .replace(/^(?:รายละเอียดสินค้า|Product Description)\s*/i, "")
    .trim();
  const stopMatch = output.search(/\s(?:คะแนนของสินค้า|รีวิวสินค้า|ความคิดเห็น|สินค้าแนะนำ|สินค้าที่คล้ายกัน|ร้านค้าแนะนำ|ข้อมูลจำเพาะของสินค้า)\b/i);
  if (stopMatch > 80) {
    output = output.slice(0, stopMatch).trim();
  }
  return output.slice(0, 12_000);
}

function extractShopeeDescriptionText(bodyText: string, descriptionNode: HTMLElement | null): string | null {
  const fromNode = descriptionNode ? trimShopeeDescription(descriptionNode.innerText || "") : "";
  if (fromNode && !/^ข้ามไปที่เนื้อหาหลัก|Shopee Home|Main images|Description images/i.test(fromNode)) {
    return fromNode;
  }

  const bodyDescription = trimShopeeDescription(bodyText);
  return bodyDescription && !/^ข้ามไปที่เนื้อหาหลัก|Shopee Home|Main images|Description images/i.test(bodyDescription)
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
  const reviewRoots = Array.from(document.querySelectorAll<HTMLElement>("section, article, li, div"))
    .map((el) => ({ el, text: el.innerText || "", rect: el.getBoundingClientRect() }))
    .filter((item) => {
      const visible = item.rect.bottom >= -200 && item.rect.top <= window.innerHeight + 800;
      const reviewText = /คะแนนของสินค้า|ความคิดเห็น|รีวิวสินค้า|รีวิว|ratings?|reviews?|มีรูปภาพ\/วิดีโอ|ตัวเลือกสินค้า|คุณภาพ|การใช้งาน/i.test(item.text);
      const reviewShape = /[★⭐]{3,}|\b\d{4}-\d{2}-\d{2}\b/.test(item.text);
      return visible && (reviewText || reviewShape);
    })
    .sort((left, right) => (left.rect.top - right.rect.top) || (left.text.length - right.text.length))
    .slice(0, 16)
    .map((item) => item.el);
  const urls: string[] = [];
  for (const root of reviewRoots) {
    for (const img of Array.from(root.querySelectorAll<HTMLImageElement>("img[src], img[srcset]"))) {
      const rect = img.getBoundingClientRect();
      const url = img.currentSrc || img.src;
      if (rect.width >= 40 && rect.height >= 40 && !/avatar|profile|sprite|logo|icon/i.test(url)) {
        urls.push(url);
      }
    }
    for (const video of Array.from(root.querySelectorAll<HTMLVideoElement>("video[poster]"))) {
      const rect = video.getBoundingClientRect();
      const url = video.poster;
      if (rect.width >= 40 && rect.height >= 40 && /^https?:\/\//.test(url)) urls.push(url);
    }
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("[style*='background']"))) {
      const rect = el.getBoundingClientRect();
      const bg = window.getComputedStyle(el).backgroundImage;
      const url = bg.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/)?.[1];
      if (url && rect.width >= 40 && rect.height >= 40 && !/avatar|profile|sprite|logo|icon/i.test(url)) {
        urls.push(url);
      }
    }
  }
  return uniqueUrls(urls)
    .slice(0, 30)
    .map((url, position) => ({ url, kind: "review", source: "dom", position, selected: false }));
}

async function collectThumbnailImages(): Promise<ImageCandidate[]> {
  const thumbImages = Array.from(document.querySelectorAll<HTMLImageElement>("img[src], img[srcset]"))
    .filter((img) => {
      const rect = img.getBoundingClientRect();
      return rect.width >= 36 && rect.width <= 140 && rect.height >= 36 && rect.height <= 140 && rect.top < window.innerHeight * 1.2;
    })
    .slice(0, 16);
  const urls: string[] = [];
  for (const img of thumbImages) {
    img.scrollIntoView({ block: "center", inline: "center" });
    img.click();
    await delay(350);
    urls.push(...Array.from(document.querySelectorAll<HTMLImageElement>("img[src], img[srcset]"))
      .filter((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width >= 180 && rect.height >= 180 && rect.top < window.innerHeight * 1.25;
      })
      .map((candidate) => candidate.currentSrc || candidate.src));
  }
  return uniqueUrls(urls)
    .filter((url) => !/sprite|logo|avatar|icon/i.test(url))
    .slice(0, 20)
    .map((url, position) => ({ url, kind: "main", source: "dom", position, selected: position < 8 }));
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
  const categoryText = extractShopeeCategory(title, bodyText);
  const variantsText = collectVariantText();
  const thumbnailImages = interactive ? await collectThumbnailImages() : [];
  const descriptionNode = findShopeeDescriptionNode();
  if (interactive && descriptionNode) {
    descriptionNode.scrollIntoView({ block: "start" });
    await delay(700);
  }
  const descriptionText = extractShopeeDescriptionText(bodyText, descriptionNode);
  const mainImages = thumbnailImages.length > 0 ? thumbnailImages : collectImages("main");
  const imageCandidates = uniqueImageCandidates([
    ...mainImages,
    ...Array.from(descriptionNode?.querySelectorAll<HTMLImageElement>("img[src], img[srcset]") ?? [])
      .map((img, position) => ({
        url: img.currentSrc || img.src,
        kind: "description" as const,
        source: "dom" as const,
        position,
        selected: false,
      })),
    ...collectReviewImages(),
  ]);

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
    priceOriginalText: null,
    discountText: discount,
    ratingScoreText: rating,
    reviewCountText: reviewCount,
    soldCountText: sold,
    shopName: null,
    isMall: /mall|official|ร้านแนะนำ|preferred/i.test(bodyText),
    categoryText,
    stockText,
    variantsText,
    sellerLocationText,
    descriptionText,
    specificationText: null,
    imageCandidates,
    rawDomText: bodyText,
    htmlBlocks: [
      { name: "product_header", text: bodyText.slice(0, 12_000), outerHTML: document.body.innerHTML.slice(0, 20_000), metadata: { shopeeUrl } },
      { name: "description", text: descriptionText ?? "", outerHTML: descriptionNode?.outerHTML?.slice(0, 20_000), metadata: {} },
    ],
  };
}
