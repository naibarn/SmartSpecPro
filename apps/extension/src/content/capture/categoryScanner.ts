import type { CategoryProductCandidate } from "../../shared/types";
import { parseDiscountPercent, parseShopeeProductUrl, parseSoldCount, parseThaiPrice } from "../utils/number";

const SHOPEE_AFFILIATE_PRODUCT_OFFER_URL = "https://affiliate.shopee.co.th/offer/product_offer";
const AFFILIATE_COMMISSION_PATTERN = /อัตรา\s*ค่า?\s*คอม|คอมมิชชัน|คอมมิชชั่น|commission/i;
const AFFILIATE_SOLD_PATTERN = /(ขายได้|sold|ขายแล้ว)/i;
const AFFILIATE_PRICE_PATTERN = /฿\s?[\d,.]+/;
const AFFILIATE_PRODUCT_OFFER_PATH_PATTERN = /^\/offer\/product_offer(?:\/(\d+))?\/?$/i;
const AFFILIATE_LINK_TEXT_PATTERN = /เอา\s*ลิงก์|get\s*link|copy\s*link/i;
const AFFILIATE_LINK_ACTION_SELECTOR = "button, a[href], [role='button'], [tabindex], [data-url], [data-link], [data-href], [data-clipboard-text], [data-copy-text], [data-affiliate-link], [data-tracking-link]";
const AFFILIATE_LINK_CLICK_DELAY_MS = 1500;
let lastShopeeAffiliateScanDiagnostics: Record<string, unknown> = {};

export interface ShopeeAffiliateLinkRequest {
  affiliateCardKey?: string | null;
  productUrl?: string | null;
  commissionCheckUrl?: string | null;
  externalProductId?: string | null;
  externalShopId?: string | null;
  title?: string | null;
  imageUrl?: string | null;
  priceText?: string | null;
  soldCountText?: string | null;
}

function rectLike(rect: DOMRect): Record<string, number> {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom };
}

function compactRecordText(value: string, max = 500) {
  const compact = compactText(value);
  return compact.length > max ? `${compact.slice(0, max)}...` : compact;
}

function closestCard(anchor: HTMLAnchorElement): HTMLElement {
  let node: HTMLElement | null = anchor;
  for (let i = 0; i < 5 && node?.parentElement; i += 1) {
    const rect = node.getBoundingClientRect();
    if (rect.width >= 120 && rect.height >= 160) return node;
    node = node.parentElement;
  }
  return anchor;
}

function scoreCandidate(input: {
  soldCountNormalized: number | null;
  priceCurrent: number | null;
  discountPercent: number | null;
  isMall: boolean;
  hasFreeShippingBadge: boolean;
  hasClearImage: boolean;
  rankOnPage: number;
  hasExtraCommissionBadge?: boolean;
  commissionRatePercent?: number | null;
  affiliateUrl?: string | null;
}) {
  let score = 0;
  const reasons: string[] = [];
  if (input.soldCountNormalized != null && input.soldCountNormalized > 0) {
    score += Math.min(25, Math.log10(input.soldCountNormalized + 1) * 6);
    reasons.push(`ยอดขาย: ${input.soldCountNormalized.toLocaleString("th-TH")}`);
  }
  if (input.discountPercent != null && input.discountPercent >= 30) {
    score += Math.min(10, (input.discountPercent / 100) * 12);
    reasons.push(`ส่วนลด ${input.discountPercent}%`);
  }
  if (input.isMall) {
    score += 10;
    reasons.push("Mall / official badge");
  }
  if (input.priceCurrent != null) {
    score += 6;
    reasons.push("ราคาอ่านได้ชัดเจน");
    const highTicketScore = Math.min(12, Math.max(0, Math.log10(input.priceCurrent + 1) * 3));
    if (highTicketScore >= 4) {
      score += highTicketScore;
      reasons.push(`ราคาสูง: ฿${input.priceCurrent.toLocaleString("th-TH")}`);
    }
  }
  if (input.hasFreeShippingBadge) {
    score += 4;
    reasons.push("มี free shipping/promotion badge");
  }
  if (input.hasClearImage) {
    score += 5;
    reasons.push("มีรูปสินค้าชัดเจน");
  }
  if (input.rankOnPage <= 10) {
    score += 3;
    reasons.push("อยู่ในอันดับบนของหน้า");
  }
  if (input.hasExtraCommissionBadge) {
    score += 15;
    reasons.push("EXTRACOMM");
  }
  if (input.commissionRatePercent != null) {
    score += Math.min(14, Math.max(4, input.commissionRatePercent));
    reasons.push(`คอมมิชชัน ${input.commissionRatePercent}%`);
  }
  if (input.priceCurrent != null && input.commissionRatePercent != null) {
    const estimatedCommission = input.priceCurrent * input.commissionRatePercent / 100;
    if (estimatedCommission > 0) {
      score += Math.min(25, Math.log10(estimatedCommission + 1) * 9);
      reasons.push(`คอมต่อออเดอร์ประมาณ ฿${Math.round(estimatedCommission).toLocaleString("th-TH")}`);
    }
  }
  if (input.affiliateUrl) {
    score += 4;
    reasons.push("พบ affiliate URL");
  }
  return { score: Math.round(Math.min(100, score)), reasons };
}

export function isShopeeAffiliateProductOfferPage() {
  return location.hostname === "affiliate.shopee.co.th" && /^\/offer\/product_offer\/?$/i.test(location.pathname);
}

function normalizeSpaces(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function compactText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function hasAffiliatePriceSignal(text: string) {
  return AFFILIATE_PRICE_PATTERN.test(compactText(text));
}

function hasAffiliateCommissionSignal(text: string) {
  return AFFILIATE_COMMISSION_PATTERN.test(compactText(text));
}

function hasAffiliateSoldSignal(text: string) {
  return AFFILIATE_SOLD_PATTERN.test(compactText(text));
}

function isAffiliateProductOfferUrl(parsed: URL) {
  return parsed.hostname === "affiliate.shopee.co.th" && AFFILIATE_PRODUCT_OFFER_PATH_PATTERN.test(parsed.pathname);
}

function affiliateOfferProductId(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, location.href);
    if (!isAffiliateProductOfferUrl(parsed)) return null;
    return parsed.pathname.match(AFFILIATE_PRODUCT_OFFER_PATH_PATTERN)?.[1] ?? null;
  } catch {
    return null;
  }
}

function textLines(text: string) {
  return text
    .split(/\n+/)
    .map((line) => normalizeSpaces(line))
    .filter(Boolean);
}

function elementText(element: HTMLElement) {
  return element.innerText || element.textContent || "";
}

function attributeText(element: HTMLElement) {
  return [
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("alt"),
    typeof element.className === "string" ? element.className : "",
  ].filter(Boolean).join(" ");
}

function elementSearchText(element: HTMLElement) {
  return compactText(`${elementText(element)} ${attributeText(element)}`);
}

function queryAllDeep(root: Document | ShadowRoot = document): HTMLElement[] {
  const elements = Array.from(root.querySelectorAll<HTMLElement>("*"));
  for (const element of Array.from(elements)) {
    if (element.shadowRoot) elements.push(...queryAllDeep(element.shadowRoot));
  }
  return elements;
}

function isVisibleRect(rect: DOMRect) {
  return rect.width > 1 && rect.height > 1 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight + 600 && rect.left <= window.innerWidth + 600;
}

function rectArea(rect: DOMRect) {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function elementClassName(element: HTMLElement) {
  return typeof element.className === "string" ? element.className : "";
}

function elementSummary(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const text = elementSearchText(element);
  const signals = {
    extraComm: hasExtraCommissionSignal(text),
    price: hasAffiliatePriceSignal(text),
    sold: hasAffiliateSoldSignal(text),
    commission: hasAffiliateCommissionSignal(text),
    linkButton: isAffiliateLinkButton(element),
    imageCount: element.querySelectorAll("img[src], img[srcset]").length,
  };
  return {
    tag: element.tagName.toLowerCase(),
    id: element.id || null,
    className: compactRecordText(elementClassName(element), 180),
    role: element.getAttribute("role"),
    ariaLabel: compactRecordText(element.getAttribute("aria-label") || "", 180),
    title: compactRecordText(element.getAttribute("title") || "", 180),
    rect: rectLike(rect),
    text: compactRecordText(text, 700),
    signals,
    html: compactRecordText(element.outerHTML, 900),
  };
}

function srcsetUrl(srcset: string | null | undefined): string | null {
  const candidates = (srcset || "")
    .split(",")
    .map((item) => item.trim().split(/\s+/)[0])
    .filter(Boolean);
  return candidates[candidates.length - 1] ?? null;
}

function absoluteUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value, location.href).href;
  } catch {
    return value;
  }
}

function looksTruncatedUrl(value: string | null | undefined) {
  return Boolean(value && /(?:\.\.\.|…)/.test(value));
}

function imageUrlFromElement(image: HTMLImageElement): string | null {
  return absoluteUrl(image.currentSrc || image.src || srcsetUrl(image.getAttribute("srcset")));
}

function bestCardImage(card: HTMLElement): string | null {
  const images = Array.from(card.querySelectorAll<HTMLImageElement>("img[src], img[srcset]"))
    .map((image) => ({ image, rect: image.getBoundingClientRect(), url: imageUrlFromElement(image) }))
    .filter((item) => item.url && item.rect.width >= 30 && item.rect.height >= 30)
    .sort((left, right) => (right.rect.width * right.rect.height) - (left.rect.width * left.rect.height));
  return images[0]?.url ?? null;
}

function bestCardImageText(card: HTMLElement): string | null {
  const images = Array.from(card.querySelectorAll<HTMLImageElement>("img[src], img[srcset]"))
    .map((image) => ({ image, rect: image.getBoundingClientRect(), url: imageUrlFromElement(image) }))
    .filter((item) => item.url && item.rect.width >= 30 && item.rect.height >= 30)
    .sort((left, right) => (right.rect.width * right.rect.height) - (left.rect.width * left.rect.height));
  const image = images[0]?.image;
  return normalizeSpaces(image?.alt || image?.title || "");
}

function extractUrls(value: string | null | undefined): string[] {
  const raw = value || "";
  const decodedValues = new Set([raw]);
  try {
    decodedValues.add(decodeURIComponent(raw));
  } catch {
    // Some DOM attributes contain percent-like tracking fragments that are not valid URI components.
  }
  const urls = Array.from(decodedValues).flatMap((candidate) => candidate.match(/https?:\/\/[^\s"'<>]+/g) ?? []);
  return urls
    .map((url) => url.replace(/[),.;\]]+$/g, ""))
    .filter((url) => !looksTruncatedUrl(url));
}

function urlsFromElement(element: HTMLElement) {
  const values = [
    ...collectLinkValues(element),
    ...extractUrls(elementText(element)),
  ];
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    values.push(...extractUrls(element.value));
  }
  return values;
}

function collectLinkValues(element: HTMLElement) {
  const attributes = Array.from(new Set([
    "href",
    "data-url",
    "data-link",
    "data-href",
    "data-clipboard-text",
    "data-copy-text",
    "data-affiliate-link",
    "data-tracking-link",
    "value",
    "title",
    "aria-label",
    ...element.getAttributeNames(),
  ]));
  return [
    ...attributes.flatMap((attribute) => extractUrls(element.getAttribute(attribute))),
    ...extractUrls(element.outerHTML),
  ];
}

function isLikelyAffiliateUrl(url: string, productUrl: string | null): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url, location.href);
  } catch {
    return false;
  }
  if (looksTruncatedUrl(url) || looksTruncatedUrl(parsed.href)) return false;
  if (!/^https?:$/i.test(parsed.protocol)) return false;
  if (productUrl && parsed.href === productUrl) return false;
  if (isAffiliateProductOfferUrl(parsed)) return false;
  const isShopeeHost = /(^|\.)shopee\.co\.th$/i.test(parsed.hostname) || /^shope\.ee$/i.test(parsed.hostname);
  if (!isShopeeHost) return false;
  return /affiliate|uls_trackid|af_|utm_|s\.shopee\.co\.th|shope\.ee|share|link/i.test(parsed.href) || parsed.hostname === "s.shopee.co.th";
}

function findShopeeProductUrl(card: HTMLElement): string | null {
  const anchors = Array.from(card.querySelectorAll<HTMLAnchorElement>("a[href]"));
  for (const anchor of anchors) {
    const parsed = parseShopeeProductUrl(anchor.href);
    if (parsed.itemId) return parsed.canonicalUrl ?? parsed.cleanUrl;
  }
  return null;
}

function findShopeeAffiliateOfferUrl(card: HTMLElement): string | null {
  const anchors = Array.from(card.querySelectorAll<HTMLAnchorElement>("a[href]"));
  for (const anchor of anchors) {
    const url = absoluteUrl(anchor.getAttribute("href"));
    if (affiliateOfferProductId(url)) return url;
  }
  return null;
}

function affiliateOfferProductIds(card: HTMLElement): string[] {
  const ids = Array.from(card.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .map((anchor) => affiliateOfferProductId(absoluteUrl(anchor.getAttribute("href"))))
    .filter((id): id is string => Boolean(id));
  return Array.from(new Set(ids));
}

function isAffiliateLinkButton(element: HTMLElement) {
  const text = elementSearchText(element);
  const aria = compactText(element.getAttribute("aria-label") || "");
  const title = compactText(element.getAttribute("title") || "");
  return AFFILIATE_LINK_TEXT_PATTERN.test(`${text} ${aria} ${title}`);
}

function closestActionableAffiliateElement(element: HTMLElement, card: HTMLElement): HTMLElement | null {
  const candidates = Array.from(new Set<HTMLElement>([
    element.matches(AFFILIATE_LINK_ACTION_SELECTOR) ? element : null,
    element.closest<HTMLElement>(AFFILIATE_LINK_ACTION_SELECTOR),
    element,
  ].filter((candidate): candidate is HTMLElement => Boolean(candidate && candidate !== card && card.contains(candidate)))));

  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    if (!isVisibleRect(rect) || rect.width < 8 || rect.height < 8) continue;
    const text = elementSearchText(candidate);
    if (!AFFILIATE_LINK_TEXT_PATTERN.test(text)) continue;
    const strongAction = candidate.matches("button, a[href], [role='button'], [data-url], [data-link], [data-href], [data-clipboard-text], [data-copy-text], [data-affiliate-link], [data-tracking-link]");
    const compactLength = compactText(text).length;
    const looksLikeButtonSize = rect.width <= 260 && rect.height <= 96;
    const strongActionSize = rect.width <= 420 && rect.height <= 140;
    if ((strongAction && strongActionSize && compactLength <= 240) || (looksLikeButtonSize && compactLength <= 180)) return candidate;
  }
  return null;
}

function affiliateLinkButtonRank(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const text = compactText(elementSearchText(element));
  const directAction = element.matches(AFFILIATE_LINK_ACTION_SELECTOR) ? 0 : 1000;
  const exactText = /^(เอา\s*ลิงก์|get\s*link|copy\s*link)$/i.test(text) ? 0 : 120;
  const sizePenalty = Math.max(0, rect.width - 260) + Math.max(0, rect.height - 96) * 3;
  const textPenalty = Math.max(0, text.length - 80);
  return directAction + exactText + sizePenalty + textPenalty + rect.top / 10000;
}

function findAffiliateLinkButton(card: HTMLElement): HTMLElement | null {
  const seeds = Array.from(card.querySelectorAll<HTMLElement>(`${AFFILIATE_LINK_ACTION_SELECTOR}, span, div`));
  const elements = Array.from(new Set(seeds
    .filter(isAffiliateLinkButton)
    .map((element) => closestActionableAffiliateElement(element, card))
    .filter((element): element is HTMLElement => Boolean(element))));
  return elements.sort((left, right) => affiliateLinkButtonRank(left) - affiliateLinkButtonRank(right))[0] ?? null;
}

function findAffiliateUrl(card: HTMLElement, productUrl: string | null): string | null {
  const linkButton = findAffiliateLinkButton(card);
  const elements = Array.from(new Set<HTMLElement>([
    ...(linkButton ? [linkButton] : []),
    ...Array.from(card.querySelectorAll<HTMLElement>("a[href], button, [role='button'], [data-url], [data-link], [data-href], [data-clipboard-text], [data-copy-text], [data-affiliate-link], [data-tracking-link], input, textarea")),
  ]))
    .sort((left, right) => {
      const leftText = elementSearchText(left);
      const rightText = elementSearchText(right);
      const leftScore = /เอา\s*ลิงก์|get\s*link|affiliate|copy/i.test(leftText) ? 0 : 1;
      const rightScore = /เอา\s*ลิงก์|get\s*link|affiliate|copy/i.test(rightText) ? 0 : 1;
      return leftScore - rightScore;
    });
  for (const element of elements) {
    const values = urlsFromElement(element);
    const found = values.map((value) => absoluteUrl(value)).find((url): url is string => Boolean(url && isLikelyAffiliateUrl(url, productUrl)));
    if (found) return found;
  }
  return null;
}

function extractCommission(rawText: string, lines: string[]) {
  const line = lines.find((item) => AFFILIATE_COMMISSION_PATTERN.test(item)) ?? "";
  const text = compactText(rawText);
  const match = line.match(/(\d+(?:\.\d+)?)\s*%/) ?? text.match(/(?:อัตรา\s*ค่า?\s*คอม|คอมมิชชัน|คอมมิชชั่น|commission)[^\d%]{0,40}(\d+(?:\.\d+)?)\s*%/i);
  const value = match ? Number(match[1]) : null;
  return {
    text: line || (value != null ? `${value}%` : null),
    value: value != null && Number.isFinite(value) ? value : null,
  };
}

function extractAffiliateSoldText(rawText: string, lines: string[]) {
  const text = compactText(rawText);
  const thai = text.match(/ขายได้\s*[\d,.]+(?:\.\d+)?\s*(?:[kKmM]\+?|พัน|หมื่น|ล้าน)?\s*ชิ้น?/i);
  if (thai) return thai[0];
  const sold = text.match(/(?:sold|ขายแล้ว)\s*[\d,.]+(?:\.\d+)?\s*(?:[kKmM]\+?|พัน|หมื่น|ล้าน)?/i);
  if (sold) return sold[0];
  return lines.find((line) => AFFILIATE_SOLD_PATTERN.test(line)) ?? null;
}

function extractAffiliatePriceText(rawText: string) {
  return compactText(rawText).match(/฿\s?[\d,.]+(?:\.\d+)?/)?.[0] ?? null;
}

function extractAffiliateTitle(card: HTMLElement, lines: string[]) {
  const noise = /EXTRA\s*COMM|฿|ขายได้|sold|อัตรา\s*ค่า?\s*คอม|คอมมิชชัน|คอมมิชชั่น|commission|เอา\s*ลิงก์|get\s*link|ลด\s*\d+%|รับสินค้า|โปรดเลือก|ร้านแนะนำ|mall|preferred/i;
  const imageText = bestCardImageText(card);
  if (imageText && imageText.length >= 8 && !noise.test(imageText)) return imageText;
  const preferred = lines
    .filter((line) => line.length >= 8 && !noise.test(line))
    .find((line) => !/^[\d\s.,%/-]+$/.test(line));
  return preferred ?? lines.filter((line) => line.length >= 8 && !noise.test(line)).sort((left, right) => right.length - left.length)[0] ?? "Shopee affiliate product";
}

function hasAffiliateCardSignals(text: string) {
  const compact = compactText(text);
  return hasAffiliatePriceSignal(compact)
    && hasAffiliateCommissionSignal(compact)
    && hasAffiliateSoldSignal(compact);
}

function hasExtraCommissionSignal(text: string) {
  return /EXTRA\s*COMM/i.test(compactText(text));
}

function affiliateSignalScore(element: HTMLElement) {
  const text = elementSearchText(element);
  const hasImage = Boolean(element.querySelector("img[src], img[srcset]"));
  const hasButton = isAffiliateLinkButton(element)
    || Array.from(element.querySelectorAll<HTMLElement>("button, a[href], [role='button'], [aria-label], [title]")).some(isAffiliateLinkButton);
  let score = 0;
  if (hasExtraCommissionSignal(text)) score += 3;
  if (hasAffiliatePriceSignal(text)) score += 2;
  if (hasAffiliateCommissionSignal(text)) score += 2;
  if (hasAffiliateSoldSignal(text)) score += 2;
  if (hasImage) score += 1;
  if (hasButton) score += 1;
  return { score, text, hasImage, hasButton };
}

function looksLikeAffiliateCard(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const signals = affiliateSignalScore(element);
  return isVisibleRect(rect)
    && rect.width >= 80
    && rect.height >= 120
    && rect.width <= 920
    && rect.height <= 1300
    && signals.text.length <= 9000
    && signals.score >= 6
    && hasAffiliateCommissionSignal(signals.text)
    && (hasAffiliateSoldSignal(signals.text) || signals.hasButton)
    && hasAffiliatePriceSignal(signals.text)
    && (signals.hasImage || signals.hasButton);
}

function closestAffiliateCard(seed: HTMLElement): HTMLElement | null {
  const fallbackCandidates: HTMLElement[] = [];
  let node: HTMLElement | null = seed;
  for (let depth = 0; depth < 20 && node && node !== document.body; depth += 1) {
    if (looksLikeAffiliateCard(node)) return node;
    const rect = node.getBoundingClientRect();
    const signals = affiliateSignalScore(node);
    if (
      isVisibleRect(rect)
      && rect.width >= 80
      && rect.height >= 120
      && rect.width <= 1000
      && rect.height <= 1500
      && signals.text.length <= 12000
      && (signals.hasImage || signals.hasButton)
      && signals.score >= 4
    ) {
      fallbackCandidates.push(node);
    }
    node = node.parentElement;
  }
  return fallbackCandidates.sort((left, right) => rectArea(left.getBoundingClientRect()) - rectArea(right.getBoundingClientRect()))[0] ?? null;
}

function affiliateCardKey(card: HTMLElement) {
  const rect = card.getBoundingClientRect();
  const text = elementText(card);
  const imageUrl = bestCardImage(card) ?? "";
  const title = extractAffiliateTitle(card, textLines(text));
  const productUrl = findShopeeProductUrl(card) ?? "";
  const offerUrl = findShopeeAffiliateOfferUrl(card) ?? "";
  const priceText = extractAffiliatePriceText(text) ?? "";
  const soldCountText = extractAffiliateSoldText(text, textLines(text)) ?? "";
  const positionFallback = `${Math.round(rect.left + window.scrollX)}:${Math.round(rect.top + window.scrollY)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
  const basis = [productUrl, offerUrl, imageUrl, title, priceText, soldCountText].filter(Boolean).join("|") || positionFallback;
  let hash = 0;
  for (let index = 0; index < basis.length; index += 1) {
    hash = ((hash << 5) - hash + basis.charCodeAt(index)) | 0;
  }
  return `affiliate-card-${Math.abs(hash)}`;
}

function findAffiliateOfferCards(limit: number) {
  const elements = queryAllDeep();
  const cards = new Map<string, HTMLElement>();
  const linkButtonSeeds = elements.filter(isAffiliateLinkButton);
  const imageSeeds = Array.from(document.querySelectorAll<HTMLImageElement>("img[src], img[srcset]"))
    .filter((image) => {
      const rect = image.getBoundingClientRect();
      return isVisibleRect(rect) && rect.width >= 70 && rect.height >= 70;
    });
  const seeds = elements.filter((element) => {
    if (isAffiliateLinkButton(element)) return true;
    const signals = affiliateSignalScore(element);
    return hasAffiliateCardSignals(signals.text) || signals.score >= 7;
  });

  for (const seed of [...linkButtonSeeds, ...seeds, ...imageSeeds]) {
    const card = closestAffiliateCard(seed) ?? (looksLikeAffiliateCard(seed) ? seed : null);
    if (!card) continue;
    const text = elementSearchText(card);
    if (!hasAffiliateCommissionSignal(text) && !hasAffiliateSoldSignal(text) && !isAffiliateLinkButton(seed)) continue;
    cards.set(affiliateCardKey(card), card);
    if (cards.size >= limit * 3) break;
  }

  const sortedCards = Array.from(cards.values())
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return leftRect.top - rightRect.top || leftRect.left - rightRect.left;
    })
    .slice(0, Math.max(limit * 2, limit));

  lastShopeeAffiliateScanDiagnostics = {
    inspectedElements: elements.length,
    imageSeedCount: imageSeeds.length,
    linkButtonSeedCount: linkButtonSeeds.length,
    seedCount: seeds.length,
    cardCount: sortedCards.length,
    sampleCards: sortedCards.slice(0, 12).map(elementSummary),
    sampleLinkButtons: linkButtonSeeds.slice(0, 12).map(elementSummary),
    sampleImages: imageSeeds.slice(0, 12).map(elementSummary),
  };

  return sortedCards;
}

function requestProductMatch(input: ShopeeAffiliateLinkRequest) {
  const urls = [input.productUrl, input.commissionCheckUrl].map((value) => absoluteUrl(value)).filter(Boolean) as string[];
  const shopeeProducts = urls.map((url) => parseShopeeProductUrl(url)).filter((parsed) => Boolean(parsed.itemId));
  const offerProductIds = urls.map(affiliateOfferProductId).filter(Boolean) as string[];
  const externalProductId = compactText(input.externalProductId || "");
  const externalShopId = compactText(input.externalShopId || "");
  return { shopeeProducts, offerProductIds, externalProductId, externalShopId };
}

function cardMatchesRequestedProduct(card: HTMLElement, input: ShopeeAffiliateLinkRequest) {
  const match = requestProductMatch(input);
  const cardProduct = parseShopeeProductUrl(findShopeeProductUrl(card) ?? "");
  const cardOfferIds = affiliateOfferProductIds(card);
  if (match.externalProductId) {
    if (cardProduct.itemId === match.externalProductId && (!match.externalShopId || cardProduct.shopId === match.externalShopId)) return true;
    if (cardOfferIds.includes(match.externalProductId)) return true;
  }
  if (match.shopeeProducts.some((requested) => requested.itemId === cardProduct.itemId && (!requested.shopId || !cardProduct.shopId || requested.shopId === cardProduct.shopId))) {
    return true;
  }
  return match.offerProductIds.some((requestedId) => cardOfferIds.includes(requestedId));
}

function findAffiliateCardByRequest(input: ShopeeAffiliateLinkRequest): HTMLElement | null {
  const cards = findAffiliateOfferCards(160);
  if (input.affiliateCardKey) {
    const exact = cards.find((card) => affiliateCardKey(card) === input.affiliateCardKey);
    if (exact) return exact;
  }
  const byProduct = cards.find((card) => cardMatchesRequestedProduct(card, input));
  if (byProduct) return byProduct;
  const imageUrl = input.imageUrl?.trim();
  if (imageUrl) {
    const byImage = cards.find((card) => bestCardImage(card) === imageUrl);
    if (byImage) return byImage;
  }
  const title = compactText(input.title || "").toLowerCase();
  const price = compactText(input.priceText || "");
  const sold = compactText(input.soldCountText || "");
  return cards.find((card) => {
    const text = compactText(elementText(card)).toLowerCase();
    return (!title || text.includes(title.slice(0, 48)))
      && (!price || text.includes(price.toLowerCase()))
      && (!sold || text.includes(sold.toLowerCase()));
  }) ?? null;
}

async function findAffiliateCardByRequestWithScroll(input: ShopeeAffiliateLinkRequest): Promise<{ card: HTMLElement | null; scrollAttempts: number; scrolled: boolean }> {
  const initial = findAffiliateCardByRequest(input);
  if (initial) return { card: initial, scrollAttempts: 0, scrolled: false };

  const startY = window.scrollY;
  let previousY = window.scrollY;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    window.scrollBy({ top: Math.max(480, Math.floor(window.innerHeight * 0.75)), behavior: "smooth" });
    await sleep(650);
    const card = findAffiliateCardByRequest(input);
    if (card) return { card, scrollAttempts: attempt, scrolled: true };
    if (Math.abs(window.scrollY - previousY) < 8) break;
    previousY = window.scrollY;
  }
  if (Math.abs(window.scrollY - startY) > 8) {
    window.scrollTo({ top: startY, behavior: "smooth" });
  }
  return { card: null, scrollAttempts: 12, scrolled: Math.abs(window.scrollY - startY) > 8 };
}

function allAffiliateUrls(productUrl: string | null) {
  return Array.from(document.querySelectorAll<HTMLElement>("a[href], button, [role='button'], input, textarea, [data-url], [data-link], [data-href], [data-clipboard-text], [data-copy-text], [data-affiliate-link], [data-tracking-link]"))
    .flatMap(urlsFromElement)
    .map((value) => absoluteUrl(value))
    .filter((url): url is string => Boolean(url && isLikelyAffiliateUrl(url, productUrl)));
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function clickAffiliateButton(button: HTMLElement) {
  button.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  await sleep(AFFILIATE_LINK_CLICK_DELAY_MS);
  const rect = button.getBoundingClientRect();
  button.focus?.({ preventScroll: true });
  const init: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: Math.round(rect.left + rect.width / 2),
    clientY: Math.round(rect.top + rect.height / 2),
    button: 0,
    buttons: 1,
  };
  if (typeof PointerEvent !== "undefined") {
    button.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    button.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0 }));
  }
  button.dispatchEvent(new MouseEvent("mousedown", init));
  button.dispatchEvent(new MouseEvent("mouseup", { ...init, buttons: 0 }));
  button.dispatchEvent(new MouseEvent("click", { ...init, buttons: 0 }));
  button.click();
}

function affiliateDetailElementCount() {
  return Array.from(document.querySelectorAll<HTMLElement>("[role='dialog'], [role='alertdialog'], [class*='modal'], [class*='dialog'], [class*='popover'], [class*='drawer'], [class*='tooltip']"))
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      if (!isVisibleRect(rect)) return false;
      const text = elementSearchText(element);
      return /รายละเอียด|คอมมิชชัน|คอมมิชชั่น|commission|affiliate|เอา\s*ลิงก์|get\s*link|copy\s*link/i.test(text)
        && (/\bmodal\b|\bdialog\b|\bpopover\b|\bdrawer\b|ant-modal|shopee/i.test(elementClassName(element)) || element.getAttribute("role") === "dialog");
    })
    .length;
}

async function waitForAffiliateUrl(productUrl: string | null, card: HTMLElement, before: Set<string>) {
  const startedAt = Date.now();
  let attempts = 0;
  let lastSeenCount = 0;
  let modalSignalCount = 0;
  while (Date.now() - startedAt < 12000) {
    attempts += 1;
    await sleep(attempts < 5 ? 180 : 350);
    modalSignalCount = Math.max(modalSignalCount, affiliateDetailElementCount());
    const after = allAffiliateUrls(productUrl);
    lastSeenCount = after.length;
    const next = after.find((url) => !before.has(url)) ?? findAffiliateUrl(card, productUrl) ?? after[0];
    if (next) {
      return {
        affiliateUrl: next,
        diagnostics: {
          attempts,
          waitedMs: Date.now() - startedAt,
          seenAffiliateUrlCount: lastSeenCount,
          modalSignalCount,
        },
      };
    }
  }
  return {
    affiliateUrl: null,
    diagnostics: {
      attempts,
      waitedMs: Date.now() - startedAt,
      seenAffiliateUrlCount: lastSeenCount,
      modalSignalCount,
    },
  };
}

export async function resolveShopeeAffiliateLink(input: ShopeeAffiliateLinkRequest): Promise<{ affiliateUrl: string | null; diagnostics: Record<string, unknown> }> {
  if (!isShopeeAffiliateProductOfferPage()) {
    return { affiliateUrl: null, diagnostics: { reason: "not_affiliate_product_offer_page" } };
  }
  const found = await findAffiliateCardByRequestWithScroll(input);
  const card = found.card;
  if (!card) {
    return { affiliateUrl: null, diagnostics: { reason: "card_not_found", requestedKey: input.affiliateCardKey ?? null, scrollAttempts: found.scrollAttempts } };
  }
  const productUrl = findShopeeProductUrl(card);
  const existing = findAffiliateUrl(card, productUrl);
  if (existing) {
    return { affiliateUrl: existing, diagnostics: { reason: "link_already_available", requestedKey: input.affiliateCardKey ?? null, cardKey: affiliateCardKey(card), scrollAttempts: found.scrollAttempts, scrolled: found.scrolled } };
  }
  const button = findAffiliateLinkButton(card);
  if (!button) {
    return { affiliateUrl: null, diagnostics: { reason: "link_button_not_found", cardKey: affiliateCardKey(card), scrollAttempts: found.scrollAttempts, scrolled: found.scrolled } };
  }
  const before = new Set(allAffiliateUrls(productUrl));
  await clickAffiliateButton(button);
  const resolved = await waitForAffiliateUrl(productUrl, card, before);
  if (resolved.affiliateUrl) {
    return {
      affiliateUrl: resolved.affiliateUrl,
      diagnostics: {
        reason: "link_resolved_after_click",
        cardKey: affiliateCardKey(card),
        scrollAttempts: found.scrollAttempts,
        scrolled: found.scrolled,
        ...resolved.diagnostics,
      },
    };
  }
  return {
    affiliateUrl: null,
    diagnostics: {
      reason: "link_not_exposed_after_click",
      cardKey: affiliateCardKey(card),
      scrollAttempts: found.scrollAttempts,
      scrolled: found.scrolled,
      buttonText: compactText(elementText(button)).slice(0, 80),
      ...resolved.diagnostics,
    },
  };
}

function scanShopeeAffiliateOfferPage(limit = 60): CategoryProductCandidate[] {
  const cardNodes = findAffiliateOfferCards(limit)
    .map((node) => {
      const rect = node.getBoundingClientRect();
      const text = elementText(node);
      const searchText = elementSearchText(node);
      return {
        node,
        text,
        searchText,
        rect,
        area: rect.width * rect.height,
        hasImage: Boolean(node.querySelector("img[src], img[srcset]")),
      };
    })
    .sort((left, right) => Number(right.hasImage) - Number(left.hasImage) || left.rect.top - right.rect.top || left.rect.left - right.rect.left);

  const seen = new Set<string>();
  const candidates: CategoryProductCandidate[] = [];
  let skippedNoCommissionSignal = 0;
  let missingExtraCommCount = 0;
  let missingSoldCount = 0;
  let lowSoldCount = 0;
  let skippedMultiOfferContainer = 0;
  let genericOfferUrlFallbackCount = 0;

  for (const item of cardNodes) {
    const scanText = item.searchText || item.text;
    const lines = textLines(item.text || scanText);
    const { text: commissionRateText, value: commissionRatePercent } = extractCommission(scanText, lines);
    const hasExtraCommission = hasExtraCommissionSignal(scanText);
    if (!hasExtraCommission) missingExtraCommCount += 1;
    if (!hasExtraCommission && !commissionRateText && !hasAffiliateCommissionSignal(scanText)) {
      skippedNoCommissionSignal += 1;
      continue;
    }

    const soldCountText = extractAffiliateSoldText(scanText, lines);
    const soldCountValue = parseSoldCount(soldCountText);
    if (soldCountValue == null) missingSoldCount += 1;
    if (soldCountValue != null && soldCountValue <= 100) lowSoldCount += 1;

    const title = extractAffiliateTitle(item.node, lines);
    const priceText = extractAffiliatePriceText(scanText);
    const discountText = scanText.match(/-\d+%/)?.[0] ?? null;
    const productUrl = findShopeeProductUrl(item.node);
    const offerUrl = findShopeeAffiliateOfferUrl(item.node);
    const offerProductIds = affiliateOfferProductIds(item.node);
    if (offerProductIds.length > 1) {
      skippedMultiOfferContainer += 1;
      continue;
    }
    const affiliateUrl = findAffiliateUrl(item.node, productUrl);
    const imageUrl = bestCardImage(item.node);
    const shopeeUrl = parseShopeeProductUrl(productUrl ?? "");
    const offerProductId = affiliateOfferProductId(offerUrl) ?? offerProductIds[0] ?? null;
    const offerSpecificUrl = offerProductId ? (offerUrl ?? `${SHOPEE_AFFILIATE_PRODUCT_OFFER_URL}/${offerProductId}`) : null;
    if (!productUrl && !offerSpecificUrl && !affiliateUrl) genericOfferUrlFallbackCount += 1;
    const candidateUrl = productUrl ?? offerSpecificUrl ?? affiliateUrl ?? `${SHOPEE_AFFILIATE_PRODUCT_OFFER_URL}#product-${candidates.length + 1}`;
    const key = [productUrl, offerSpecificUrl, affiliateUrl, imageUrl, title, priceText, soldCountText].filter(Boolean).join("|");
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const score = scoreCandidate({
      soldCountNormalized: soldCountValue,
      priceCurrent: parseThaiPrice(priceText),
      discountPercent: parseDiscountPercent(discountText),
      isMall: false,
      hasFreeShippingBadge: /ส่งฟรี|free shipping|โค้ดส่งฟรี|voucher|รับสินค้ารีวิวฟรี/i.test(scanText),
      hasClearImage: Boolean(imageUrl),
      rankOnPage: candidates.length + 1,
      hasExtraCommissionBadge: hasExtraCommission,
      commissionRatePercent,
      affiliateUrl,
    });

    candidates.push({
      platform: "shopee",
      sourceUrl: location.href,
      externalProductId: shopeeUrl.itemId ?? offerProductId,
      externalShopId: shopeeUrl.shopId,
      title,
      url: candidateUrl,
      priceText,
      discountText,
      soldCountText,
      soldCountValue,
      commissionRatePercent,
      commissionRateText,
      affiliateUrl,
      commissionCheckUrl: offerSpecificUrl,
      affiliateLinkAvailable: Boolean(findAffiliateLinkButton(item.node)),
      affiliateCardKey: affiliateCardKey(item.node),
      imageUrl,
      badges: [hasExtraCommission ? "extra_comm" : "", findAffiliateLinkButton(item.node) ? "get_link_button" : "", affiliateUrl ? "affiliate_url" : ""].filter(Boolean),
      position: candidates.length,
      boundingBox: rectLike(item.rect),
      score: score.score,
      scoreReasons: score.reasons,
      originalUrl: productUrl ?? offerSpecificUrl ?? affiliateUrl ?? candidateUrl,
      cleanUrl: productUrl ?? offerSpecificUrl ?? affiliateUrl ?? candidateUrl,
      canonicalUrl: shopeeUrl.canonicalUrl ?? offerSpecificUrl,
      urlFormat: shopeeUrl.format,
    });

    if (candidates.length >= limit) break;
  }

  lastShopeeAffiliateScanDiagnostics = {
    ...lastShopeeAffiliateScanDiagnostics,
    rawCardCount: cardNodes.length,
    candidateCount: candidates.length,
    skippedNoExtraComm: 0,
    skippedNoCommissionSignal,
    missingExtraCommCount,
    missingSoldCount,
    lowSoldCount,
    skippedMultiOfferContainer,
    genericOfferUrlFallbackCount,
    soldGateDisabled: true,
    minSoldFilter: null,
  };

  return candidates.sort((a, b) => b.score - a.score);
}

export function getLastShopeeAffiliateScanDiagnostics() {
  return lastShopeeAffiliateScanDiagnostics;
}

export function captureShopeeAffiliateDomDiagnostics() {
  const elements = queryAllDeep();
  const textSignalElements = elements
    .map((element) => ({ element, text: elementSearchText(element), rect: element.getBoundingClientRect() }))
    .filter((item) => isVisibleRect(item.rect))
    .filter((item) => /EXTRA\s*COMM|เอา\s*ลิงก์|฿\s?[\d,.]+|ขายได้|อัตรา\s*ค่า?\s*คอม|คอมมิชชัน|คอมมิชชั่น/i.test(item.text));
  const linkButtons = elements.filter(isAffiliateLinkButton);
  const images = Array.from(document.querySelectorAll<HTMLImageElement>("img[src], img[srcset]"))
    .filter((image) => isVisibleRect(image.getBoundingClientRect()))
    .sort((left, right) => rectArea(right.getBoundingClientRect()) - rectArea(left.getBoundingClientRect()));
  const cards = findAffiliateOfferCards(80);
  return {
    url: location.href,
    title: document.title,
    host: location.hostname,
    path: location.pathname,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
    counts: {
      elements: elements.length,
      visibleTextSignalElements: textSignalElements.length,
      linkButtons: linkButtons.length,
      visibleImages: images.length,
      candidateCards: cards.length,
    },
    scanner: lastShopeeAffiliateScanDiagnostics,
    samples: {
      textSignals: textSignalElements.slice(0, 20).map((item) => elementSummary(item.element)),
      linkButtons: linkButtons.slice(0, 20).map(elementSummary),
      images: images.slice(0, 20).map(elementSummary),
      cards: cards.slice(0, 20).map(elementSummary),
    },
  };
}

export function scanShopeeCategoryPage(limit = 60): CategoryProductCandidate[] {
  if (isShopeeAffiliateProductOfferPage()) return scanShopeeAffiliateOfferPage(limit);

  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .filter((a) => /i\.\d+\.\d+/.test(a.href) || /\/product\/\d+\/\d+/.test(a.href))
    .slice(0, limit);
  const seen = new Set<string>();
  const candidates: CategoryProductCandidate[] = [];

  for (const anchor of anchors) {
    const shopeeUrl = parseShopeeProductUrl(anchor.href);
    const canonicalUrl = shopeeUrl.canonicalUrl ?? shopeeUrl.cleanUrl;
    if (seen.has(canonicalUrl)) continue;
    seen.add(canonicalUrl);
    const card = closestCard(anchor);
    const text = card.innerText || anchor.innerText || "";
    const title = text.split("\n").map((line) => line.trim()).find((line) => line.length > 8 && !line.startsWith("฿")) || anchor.title || anchor.href;
    const priceText = text.match(/฿\s?[\d,.]+/)?.[0] ?? null;
    const soldCountText = text.match(/(?:ขายแล้ว|sold)\s?[^\n\r|]+/i)?.[0] ?? null;
    const discountText = text.match(/-\d+%/)?.[0] ?? null;
    const originalPriceText = text.match(/฿\s?[\d,.]+(?=.*฿\s?[\d,.]+)/)?.[0] ?? null;
    const ratingText = text.match(/\b\d(?:\.\d)?\b(?=\s*(?:ดาว|stars?|rating)?)/i)?.[0] ?? null;
    const image = card.querySelector<HTMLImageElement>("img[src], img[srcset]");
    const imageUrl = image?.currentSrc || image?.src || null;
    const isMall = /mall|official|ร้านแนะนำ|preferred/i.test(text);
    const hasFreeShippingBadge = /ส่งฟรี|free shipping|โค้ดส่งฟรี|voucher/i.test(text);
    const isSponsored = /โฆษณา|sponsored/i.test(text);
    const score = scoreCandidate({
      soldCountNormalized: parseSoldCount(soldCountText),
      priceCurrent: parseThaiPrice(priceText),
      discountPercent: parseDiscountPercent(discountText),
      isMall,
      hasFreeShippingBadge,
      hasClearImage: Boolean(imageUrl),
      rankOnPage: candidates.length + 1,
    });

    candidates.push({
      platform: "shopee",
      sourceUrl: location.href,
      externalProductId: shopeeUrl.itemId,
      externalShopId: shopeeUrl.shopId,
      title,
      url: canonicalUrl,
      priceText,
      originalPriceText,
      discountText,
      soldCountText,
      ratingText,
      imageUrl,
      badges: [
        isMall ? "mall_or_official" : "",
        hasFreeShippingBadge ? "free_shipping_or_promotion" : "",
        isSponsored ? "sponsored" : "",
      ].filter(Boolean),
      position: candidates.length,
      boundingBox: rectLike(card.getBoundingClientRect()),
      score: score.score,
      scoreReasons: score.reasons,
      originalUrl: shopeeUrl.originalUrl,
      cleanUrl: shopeeUrl.cleanUrl,
      canonicalUrl: shopeeUrl.canonicalUrl,
      urlFormat: shopeeUrl.format,
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}
