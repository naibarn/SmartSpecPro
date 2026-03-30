import { ARCHETYPES, INTENT_TO_ARCHETYPES, KEYWORD_INTENTS } from "./constants.mjs";
import { cleanText } from "./normalize.mjs";
import { createSeededRandom, pickOne, shuffle } from "./seeded-rng.mjs";

export function buildLayoutSpec(normalized) {
  const rng = createSeededRandom(normalized.seed);
  const parsedPages = normalized.contentMode === "manual-pages"
    ? prepareManualPages(normalized, rng)
    : autoSplitPages(normalized, rng);
  const autoUsageState = normalized.contentMode === "auto-split"
    ? createImageUsageState(normalized.globalImagePool?.images ?? [])
    : null;

  const limitedPages = enforcePageLimit(parsedPages, normalized, rng);

  const slides = limitedPages.map((page, index) => {
    const archetype = chooseArchetype(page, normalized, rng);
    const images = Array.isArray(page.images)
      ? page.images
      : selectImagesForPage({
          imagePool: normalized.globalImagePool,
          usageState: autoUsageState ?? createImageUsageState([]),
          pageIndex: index,
          pageCount: limitedPages.length,
          pageSignal: `${page.editorial?.pageTitle ?? ""}\n${page.editorial?.deck ?? ""}\n${page.text ?? ""}`,
          maxImagesOverride: resolveVisibleImageCountForArchetype(archetype),
          rng,
        });
    const variant = normalized.randomizeLayouts ? Math.floor(rng() * 3) + 1 : 1;
    const layout = layoutFromArchetype({
      page: {
        ...page,
        images,
      },
      archetype,
      normalized,
      rng,
      index,
      variant
    });
    return {
      id: `slide_${String(index + 1).padStart(2, "0")}`,
      intent: page.intent,
      archetype,
      variant,
      background: normalized.theme.background,
      notes: cleanText(page.text ?? ""),
      editorialStructure: page.editorial,
      elements: layout.elements
    };
  });

  return {
    canvas: {
      ratio: normalized.canvasRatio,
      widthIn: normalized.ratioInfo.widthIn,
      heightIn: normalized.ratioInfo.heightIn,
      family: normalized.ratioInfo.family
    },
    theme: {
      background: normalized.theme.background,
      text: normalized.theme.text,
      accent: normalized.theme.accent,
      panel: normalized.theme.panel,
      titleFont: normalized.theme.titleFont,
      bodyFont: normalized.theme.bodyFont,
      roundedCorners: normalized.theme.roundedCorners !== false
    },
    meta: {
      projectTitle: normalized.projectTitle,
      designStyle: normalized.designStyle,
      density: normalized.density,
      seed: normalized.seed,
      pageLimit: normalized.pageLimit
    },
    slides
  };
}

function prepareManualPages(normalized, rng) {
  const sharedPool = normalized.sharedImagePool ?? { images: [] };
  const sharedById = new Map((sharedPool.images ?? []).map((img) => [img.id, img]));
  const usageState = createImageUsageState(sharedPool.images ?? []);

  return normalized.pages.map((page) => {
    const editorial = parseEditorial(page.text, page.titleHint);
    const intent = page.pageIntentHint !== "auto" ? page.pageIntentHint : classifyIntent(page.text, editorial);
    const images = materializeManualPageImages(page, sharedPool, sharedById, usageState, rng, editorial, intent);
    return {
      ...page,
      images,
      intent,
      editorial
    };
  });
}

function materializeManualPageImages(page, sharedPool, sharedById, usageState, rng, editorial, intent) {
  const inlineImages = [...(page.images ?? [])];
  const refImages = (page.imageRefs ?? []).map((id) => sharedById.get(id)).filter(Boolean);
  const maxImages = Math.max(0, Math.min(3, page.maxImagesOverride ?? sharedPool.maxImagesPerPage ?? 3));
  const manual = dedupeImages([...inlineImages, ...refImages]).slice(0, maxImages);
  const selectionMode = page.imageSelectionMode ?? "manual-only";
  if (maxImages === 0) return [];
  if (selectionMode === "manual-only") return manual;
  if (selectionMode === "refs-only") return dedupeImages(refImages).slice(0, maxImages);

  const pageSignal = `${editorial.pageTitle}\n${editorial.deck}\n${page.text}\n${intent}`;
  if (selectionMode === "auto-from-shared") {
    return selectImagesForPage({
      imagePool: sharedPool,
      usageState,
      pageIndex: 0,
      pageCount: 1,
      pageSignal,
      maxImagesOverride: maxImages,
      rng
    });
  }

  const filled = [...manual];
  if (filled.length >= maxImages) return filled.slice(0, maxImages);

  const extras = selectImagesForPage({
    imagePool: sharedPool,
    usageState,
    pageIndex: 0,
    pageCount: 1,
    pageSignal,
    maxImagesOverride: maxImages,
    rng
  }).filter((img) => !filled.some((item) => item.id === img.id));

  for (const img of extras) {
    if (filled.length >= maxImages) break;
    filled.push(img);
  }
  return filled.slice(0, maxImages);
}

function autoSplitPages(normalized, rng) {
  const blocks = splitRawText(normalized.rawText);
  const densityUnits = normalized.density === "airy" ? 85 : normalized.density === "dense" ? 190 : 130;
  const initialPages = chunkBlocks(blocks, densityUnits);
  const maxPages = normalized.pageLimit.maxPages;
  let pages = initialPages;

  if (pages.length > maxPages) {
    if (normalized.pageLimit.overflowStrategy === "strict-error") {
      throw new Error(`Content requires ${pages.length} pages, exceeding pagination.maxPages=${maxPages}`);
    }
    if (normalized.pageLimit.overflowStrategy === "merge-tail") {
      pages = mergeBlockPagesToLimit(pages, maxPages);
    } else {
      pages = repartitionBlocksToMaxPages(blocks, maxPages, densityUnits);
    }
  }

  const titleHint = normalized.titleHint || findFirstHeading(blocks);
  const pageCount = Math.max(1, pages.length);

  return pages.map((pageBlocks, idx) => {
    const text = pageBlocks.map(blockToText).join("\n\n");
    const editorial = parseEditorial(text, idx === 0 ? titleHint : "");
    return {
      id: `page_${String(idx + 1).padStart(2, "0")}`,
      titleHint: idx === 0 ? titleHint : editorial.pageTitle,
      text,
      intent: normalized.pageIntentHint !== "auto"
        ? normalized.pageIntentHint
        : classifyIntent(text, editorial),
      editorial
    };
  });
}

function createImageUsageState(images) {
  return {
    useCount: new Map((images ?? []).map((img) => [img.id, 0]))
  };
}

function selectImagesForPage({ imagePool, usageState, pageIndex, pageCount, pageSignal, maxImagesOverride = null, rng }) {
  const pool = imagePool ?? { images: [], maxImagesPerPage: 3, minImagesPerPage: 0, reusePolicy: "avoid-repeat-until-used", selectionStrategy: "auto-diverse", coverPageImagePolicy: "auto" };
  const images = [...(pool.images ?? [])];
  if (!images.length) return [];

  const maxImages = Math.max(0, Math.min(3, maxImagesOverride ?? pool.maxImagesPerPage ?? 3));
  if (maxImages === 0) return [];
  const minImages = Math.min(maxImages, Math.max(0, pool.minImagesPerPage ?? 0));

  let candidates = images;
  const unused = images.filter((img) => (usageState.useCount.get(img.id) ?? 0) === 0);
  if (pool.reusePolicy === "avoid-repeat-until-used" && unused.length >= minImages && unused.length > 0) {
    candidates = unused;
  }
  if (pool.reusePolicy === "disallow") {
    candidates = unused;
  }

  if (pageIndex === 0 && pool.coverPageImagePolicy === "no-image") return [];
  if (!candidates.length) {
    if (pool.reusePolicy === "disallow") return [];
    candidates = images;
  }

  let ordered = rankImagesForSignal(candidates, pageSignal);

  if (pool.selectionStrategy === "shuffle") {
    ordered = shuffle(ordered, rng);
  } else if (pool.selectionStrategy === "sequential") {
    const start = (pageIndex * Math.max(1, maxImages)) % ordered.length;
    ordered = ordered.slice(start).concat(ordered.slice(0, start));
  }

  if (pageIndex === 0 && pool.coverPageImagePolicy === "prefer-hero") {
    ordered = ordered.sort((a, b) => heroWeight(b) - heroWeight(a) || rankForSignal(b, pageSignal) - rankForSignal(a, pageSignal));
  }

  const picked = [];
  for (const img of ordered) {
    if (picked.length >= maxImages) break;
    if (picked.some((item) => item.id === img.id)) continue;
    picked.push(img);
  }

  for (const img of picked) {
    usageState.useCount.set(img.id, (usageState.useCount.get(img.id) ?? 0) + 1);
  }
  return picked;
}

function rankImagesForSignal(images, pageSignal) {
  return [...images].sort((a, b) => rankForSignal(b, pageSignal) - rankForSignal(a, pageSignal));
}

function resolveVisibleImageCountForArchetype(archetype) {
  if (archetype === "vertical_workflow_steps") return 1;
  if (archetype === "executive_summary_dashboard" || archetype === "product_overview_report") return 1;
  if (archetype === "project_timeline_bands") return 1;
  return 3;
}

function rankForSignal(image, pageSignal) {
  const signal = String(pageSignal ?? "").toLowerCase();
  let score = heroWeight(image) + ((image.priority ?? 3) * 2);
  const fields = [image.alt, image.caption, ...(image.tags ?? [])].join(" ").toLowerCase();
  for (const token of fields.split(/[^a-z0-9\u0E00-\u0E7F]+/i).filter(Boolean)) {
    if (token.length >= 2 && signal.includes(token)) score += 6;
  }
  return score;
}

function heroWeight(image) {
  if (image.roleHint === "hero") return 30;
  if (image.roleHint === "module") return 12;
  if (image.roleHint === "supporting") return 8;
  if (image.roleHint === "background") return 2;
  return 5;
}

function dedupeImages(images) {
  const seen = new Set();
  const output = [];
  for (const image of images ?? []) {
    if (!image?.id || seen.has(image.id)) continue;
    seen.add(image.id);
    output.push(image);
  }
  return output;
}

function enforcePageLimit(pages, normalized, rng) {
  const maxPages = normalized.pageLimit.maxPages;
  if (pages.length <= maxPages) return pages;

  if (normalized.pageLimit.overflowStrategy === "strict-error") {
    throw new Error(`Generated ${pages.length} pages, exceeding pagination.maxPages=${maxPages}`);
  }
  if (normalized.pageLimit.overflowStrategy === "merge-tail") {
    return mergePreparedPagesToLimit(pages, maxPages);
  }
  return mergePreparedPagesToLimit(pages, maxPages);
}

function mergePreparedPagesToLimit(pages, maxPages) {
  const output = pages.slice(0, maxPages - 1);
  const tail = pages.slice(maxPages - 1);
  const mergedText = tail.map((page) => page.text).join("\n\n");
  const mergedImages = dedupeImages(tail.flatMap((page) => page.images ?? [])).slice(0, 3);
  const merged = parseEditorial(mergedText, tail[0]?.titleHint ?? tail[0]?.editorial?.pageTitle ?? "");
  output.push({
    ...tail[0],
    text: mergedText,
    images: mergedImages,
    intent: tail[0]?.intent ?? classifyIntent(mergedText, merged),
    editorial: merged
  });
  return output;
}

function chunkBlocks(blocks, densityUnits) {
  const pages = [];
  let current = [];
  let score = 0;

  for (const block of blocks) {
    const blockScore = estimateBlockWeight(block);
    const projected = score + blockScore;
    const isBulletSection = Array.isArray(block.bullets) && block.bullets.length > 0;
    const shouldBreak = current.length > 0 && (
      projected > densityUnits ||
      (isBulletSection && score > densityUnits * 0.55) ||
      block.type === "heading"
    );
    if (shouldBreak) {
      pages.push(current);
      current = [];
      score = 0;
    }
    current.push(block);
    score += blockScore;
  }
  if (current.length) pages.push(current);
  return pages;
}

function mergeBlockPagesToLimit(pages, maxPages) {
  const output = pages.slice(0, maxPages - 1);
  const tail = pages.slice(maxPages - 1).flat();
  output.push(tail);
  return output;
}

function repartitionBlocksToMaxPages(blocks, maxPages, floorDensity) {
  const weights = blocks.map(estimateBlockWeight);
  const total = weights.reduce((a, b) => a + b, 0);
  const target = Math.max(floorDensity, Math.ceil(total / maxPages));
  const pages = [];
  let current = [];
  let score = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const weight = weights[i];
    const pagesLeftAfterCurrent = maxPages - pages.length - 1;
    const remainingWeight = weights.slice(i).reduce((a, b) => a + b, 0);
    const mustBreakSoon = pagesLeftAfterCurrent > 0 && current.length > 0 && score + weight > target;

    if (mustBreakSoon) {
      pages.push(current);
      current = [];
      score = 0;
    }

    current.push(block);
    score += weight;

    if (pagesLeftAfterCurrent > 0 && remainingWeight <= target * pagesLeftAfterCurrent) {
      pages.push(current);
      current = [];
      score = 0;
    }
  }

  if (current.length) pages.push(current);
  while (pages.length > maxPages) {
    const tail = pages.pop();
    pages[pages.length - 1] = [...pages[pages.length - 1], ...tail];
  }
  return pages;
}

function splitRawText(text) {
  const rawBlocks = String(text ?? "")
    .split(/\n\s*\n/g)
    .map((chunk) => cleanText(chunk))
    .filter(Boolean);

  const blocks = [];
  for (const raw of rawBlocks) {
    const lines = raw.split("\n").map(line => cleanText(line)).filter(Boolean);
    if (!lines.length) continue;

    const firstLineIsList = /^(?:[-•*]\s|[0-9]+\.)/.test(lines[0]);
    const hasFollowupListLines = lines.slice(1).some(line => /^(?:[-•*]\s|[0-9]+\.)/.test(line));
    if (firstLineIsList || hasFollowupListLines) {
      const leadingItem = stripListMarker(lines[0]);
      const proseLines = lines.slice(1).filter(line => !/^(?:[-•*]\s|[0-9]+\.)/.test(line));
      const bulletLines = lines
        .filter(line => /^(?:[-•*]\s|[0-9]+\.)/.test(line))
        .map(stripListMarker)
        .filter(Boolean);
      if (firstLineIsList && proseLines.length > 0 && bulletLines.length <= 1) {
        blocks.push({
          type: "paragraph",
          text: cleanText([leadingItem, proseLines.join("\n")].filter(Boolean).join("\n")),
        });
        continue;
      }
      const preface = !firstLineIsList ? lines[0] : "";
      blocks.push({ type: "bulletSection", heading: preface, bullets: bulletLines, text: raw });
      continue;
    }

    if (raw.length < 90 || /^[A-Z0-9ก-๙\s:&/-]{4,}$/.test(raw)) {
      blocks.push({ type: "heading", heading: raw, text: raw });
      continue;
    }

    blocks.push({ type: "paragraph", text: raw });
  }
  return blocks;
}

function estimateBlockWeight(block) {
  if (block.type === "heading") return 24;
  if (block.type === "bulletSection") return 35 + (block.bullets.length * 20);
  return Math.min(120, Math.ceil((block.text?.length ?? 0) * 0.55));
}

function blockToText(block) {
  if (block.type === "bulletSection") {
    const head = block.heading ? `${block.heading}\n` : "";
    return `${head}${block.bullets.map(item => `• ${item}`).join("\n")}`;
  }
  return block.text;
}

function findFirstHeading(blocks) {
  const h = blocks.find(block => block.type === "heading");
  return h?.heading ?? "";
}

function parseEditorial(text, titleHint = "") {
  const cleaned = cleanText(text);
  const lines = cleaned.split("\n").map(line => cleanText(line)).filter(Boolean);

  let pageTitle = cleanText(titleHint || "");
  let deck = "";
  let bullets = [];
  const sections = [];
  let kicker = "";

  if (!pageTitle && lines.length) {
    pageTitle = lines[0].length <= 90 ? lines[0] : "";
  }

  const bulletLines = lines.filter(line => /^(?:[-•*]\s|[0-9]+\.)/.test(line))
    .map(stripListMarker);
  if (bulletLines.length) bullets = bulletLines.slice(0, 6);

  const nonBulletLines = lines.filter(line => !/^(?:[-•*]\s|[0-9]+\.)/.test(line));
  if (!pageTitle && nonBulletLines.length) pageTitle = truncateTitle(nonBulletLines[0]);

  if (nonBulletLines.length > 1) {
    deck = truncateBody(nonBulletLines[1], 180);
  } else if (cleaned.length > 80) {
    deck = truncateBody(cleaned, 180);
  }

  const paragraphs = cleaned.split(/\n\s*\n/g).map(p => p.trim()).filter(Boolean);
  const deckComparable = comparableText(deck);
  for (const para of paragraphs.slice(0, 5)) {
    if (para === pageTitle) continue;
    const paragraphComparable = comparableText(para);
    if (
      deckComparable
      && paragraphComparable
      && (
        paragraphComparable === deckComparable
        || paragraphComparable.startsWith(deckComparable)
        || deckComparable.startsWith(paragraphComparable)
      )
    ) {
      continue;
    }
    const sectionHeading = extractSectionHeading(para);
    if (sectionHeading) {
      sections.push({
        heading: truncateTitle(sectionHeading.heading),
        body: truncateBody(sectionHeading.body, 180),
        bullets: []
      });
    } else if (para !== deck) {
      sections.push({
        heading: "",
        body: truncateBody(para, 220),
        bullets: []
      });
    }
  }

  if (pageTitle && pageTitle.includes(":")) {
    const [left, right] = pageTitle.split(":").map(part => part.trim());
    if (left && right) {
      kicker = left;
      pageTitle = truncateTitle(right);
    }
  }

  return {
    kicker,
    pageTitle: truncateTitle(pageTitle || "Untitled"),
    deck,
    sections,
    bullets,
    stats: extractStats(cleaned),
    workflowSteps: extractEnumeratedSteps(cleaned),
    timelinePhases: extractPhases(cleaned)
  };
}

function extractSectionHeading(text) {
  const match = text.match(/^([^\n:]{3,60}):\s*(.+)$/s);
  if (!match) return null;
  return { heading: match[1].trim(), body: match[2].trim() };
}

function extractStats(text) {
  const stats = [];
  const regex = /([0-9]+(?:\.[0-9]+)?%?)/g;
  const matches = [...String(text).matchAll(regex)].slice(0, 4);
  for (const m of matches) {
    stats.push({ value: m[1], label: "Key figure" });
  }
  return stats;
}

function extractEnumeratedSteps(text) {
  const lines = cleanText(text).split("\n").map(line => cleanText(line)).filter(Boolean);
  const explicit = lines
    .filter(line => /^(?:[-•*]\s|[0-9]+\.)/.test(line))
    .map(stripListMarker)
    .slice(0, 8);

  if (explicit.length >= 3) {
    return explicit.map((item, idx) => ({
      step: idx + 1,
      heading: truncateTitle(item),
      body: ""
    }));
  }
  return [];
}

function extractPhases(text) {
  const lines = cleanText(text).split("\n").map(line => cleanText(line)).filter(Boolean);
  return lines
    .filter(line => /\b(?:phase|launch|review|initiation|development|planning|evaluation)\b/i.test(line))
    .slice(0, 6)
    .map((line, idx) => ({ phase: idx + 1, heading: truncateTitle(line), body: "" }));
}

function truncateTitle(text) {
  const clean = cleanText(text).replace(/\s+/g, " ").trim();
  if (clean.length <= 70) return clean;
  const short = clean.slice(0, 67).replace(/\s+\S*$/, "");
  return `${short}...`;
}

function truncateBody(text, max = 160) {
  const clean = cleanText(text).replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const short = clean.slice(0, max - 3).replace(/\s+\S*$/, "");
  return `${short}...`;
}

function classifyIntent(text, editorial) {
  const source = `${editorial.pageTitle}\n${editorial.deck}\n${text}`.toLowerCase();
  for (const rule of KEYWORD_INTENTS) {
    if (rule.words.some(word => source.includes(word.toLowerCase()))) {
      return rule.intent;
    }
  }
  if (editorial.workflowSteps.length >= 3) return "workflow_infographic";
  if (editorial.timelinePhases.length >= 3) return "project_timeline";
  if ((editorial.sections.length >= 3 || editorial.bullets.length >= 4) && editorial.pageTitle) return "executive_summary";
  return "case_study";
}

function chooseArchetype(page, normalized, rng) {
  if (page.forceArchetype && page.forceArchetype !== "auto") return page.forceArchetype;
  const familyList = ARCHETYPES[normalized.ratioInfo.family] ?? ARCHETYPES.landscape_wide;
  const intentList = INTENT_TO_ARCHETYPES[page.intent] ?? familyList;
  const candidates = familyList
    .filter(item => intentList.includes(item))
    .filter(item => isArchetypeCompatible(page, item));
  return normalized.randomizeLayouts
    ? pickOne(candidates.length ? candidates : familyList, rng)
    : (candidates[0] ?? familyList[0]);
}

function isArchetypeCompatible(page, archetype) {
  if (archetype === "vertical_workflow_steps") {
    return (page.editorial?.workflowSteps?.length ?? 0) > 0 || (page.editorial?.bullets?.length ?? 0) >= 2;
  }
  if (archetype === "project_timeline_bands") {
    return (page.editorial?.timelinePhases?.length ?? 0) > 0;
  }
  return true;
}

function stripListMarker(line) {
  return cleanText(String(line ?? "").replace(/^(?:[-•*]\s|[0-9]+\.)\s*/, ""));
}

function comparableText(text) {
  return cleanText(String(text ?? ""))
    .replace(/\.\.\.$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function uniqueTextBlocks(items) {
  const seen = new Set();
  const blocks = [];
  for (const item of items ?? []) {
    const text = cleanText(String(item ?? ""));
    const key = comparableText(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    blocks.push(text);
  }
  return blocks;
}

function layoutFromArchetype({ page, archetype, normalized, variant }) {
  const images = page.images ?? [];
  const hero = images[0] ?? null;
  const supporting = images.slice(1, 3);
  const theme = normalized.theme;
  const title = page.editorial.pageTitle;
  const bullets = uniqueTextBlocks(page.editorial.bullets);
  const narrativeBlocks = uniqueTextBlocks([
    page.editorial.deck,
    page.editorial.sections[0]?.body ?? "",
    page.editorial.sections[1]?.body ?? "",
    page.editorial.sections[2]?.body ?? "",
  ]);
  const deck = narrativeBlocks[0] ?? page.editorial.deck;
  const sectionA = narrativeBlocks[0] ?? "";
  const sectionB = narrativeBlocks[1] ?? bullets[0] ?? "";
  const sectionC = narrativeBlocks[2] ?? bullets[1] ?? "";
  const elements = [];
  const family = normalized.ratioInfo.family;

  if (archetype === "vertical_workflow_steps") {
    elements.push(
      { kind: "text", role: "title", text: title, xPct: 9, yPct: 5, wPct: 58, hPct: 10, fontFace: theme.titleFont, fontSize: family === "portrait_tall" ? 26 : 24, color: theme.text, align: "left" },
      { kind: "text", role: "deck", text: deck, xPct: 9, yPct: 15, wPct: 55, hPct: 6, fontFace: theme.bodyFont, fontSize: 12, color: theme.text, align: "left" }
    );
    if (hero) elements.push({ kind: "image", role: "hero", source: hero.source, xPct: 66, yPct: 4, wPct: 26, hPct: 17, fit: "cover", cornerRadius: 22 });
    const steps = page.editorial.workflowSteps.length ? page.editorial.workflowSteps : bullets.map((item, idx) => ({ step: idx + 1, heading: item, body: "" }));
    steps.slice(0, 6).forEach((step, idx) => {
      const y = 28 + idx * 11;
      elements.push(
        { kind: "shape", role: "divider", shape: "line", xPct: 11, yPct: y + 8.3, wPct: 60, hPct: 0.2, line: theme.panel },
        { kind: "text", role: "stepNumber", text: String(step.step).padStart(2, "0"), xPct: 11, yPct: y, wPct: 10, hPct: 6, fontFace: theme.titleFont, fontSize: 24, color: theme.accent, align: "left" },
        { kind: "text", role: "stepHeading", text: step.heading, xPct: 24, yPct: y, wPct: 46, hPct: 4, fontFace: theme.bodyFont, fontSize: 16, bold: true, color: theme.text, align: "left" },
        { kind: "text", role: "stepBody", text: step.body || "", xPct: 24, yPct: y + 4, wPct: 44, hPct: 4, fontFace: theme.bodyFont, fontSize: 11, color: theme.text, align: "left" }
      );
    });
    return { elements };
  }

  if (archetype === "executive_summary_dashboard" || archetype === "product_overview_report") {
    elements.push(
      { kind: "shape", role: "headerBand", shape: "rect", xPct: 0, yPct: 0, wPct: 100, hPct: 20, fill: theme.accent },
      { kind: "text", role: "title", text: title, xPct: 7, yPct: 6, wPct: 60, hPct: 8, fontFace: theme.titleFont, fontSize: 28, color: "#FFFFFF", align: "left" },
      { kind: "text", role: "sectionHeading", text: page.editorial.sections[0]?.heading || "Overview", xPct: 7, yPct: 26, wPct: 36, hPct: 4, fontFace: theme.bodyFont, fontSize: 15, bold: true, color: theme.text, align: "left" },
      { kind: "text", role: "body", text: sectionA, xPct: 7, yPct: 31, wPct: 38, hPct: 22, fontFace: theme.bodyFont, fontSize: 12, color: theme.text, align: "left" },
      { kind: "text", role: "sectionHeading", text: page.editorial.sections[1]?.heading || "Key Points", xPct: 52, yPct: 26, wPct: 34, hPct: 4, fontFace: theme.bodyFont, fontSize: 15, bold: true, color: theme.text, align: "left" }
    );
    bullets.slice(0, 4).forEach((item, idx) => {
      elements.push({ kind: "text", role: "bullet", text: `• ${item}`, xPct: 52, yPct: 31 + idx * 6, wPct: 35, hPct: 5, fontFace: theme.bodyFont, fontSize: 12, color: theme.text, align: "left" });
    });
    if (hero) elements.push({ kind: "image", role: "hero", source: hero.source, xPct: 52, yPct: 58, wPct: 38, hPct: 28, fit: "cover", cornerRadius: 16 });
    return { elements };
  }

  if (archetype === "project_timeline_bands") {
    elements.push(
      { kind: "text", role: "title", text: title, xPct: 8, yPct: 6, wPct: 70, hPct: 8, fontFace: theme.titleFont, fontSize: 30, color: theme.text, align: "left" }
    );
    const phases = page.editorial.timelinePhases.length ? page.editorial.timelinePhases : bullets.slice(0, 5).map((item, idx) => ({ phase: idx + 1, heading: item, body: "" }));
    phases.slice(0, 5).forEach((phase, idx) => {
      const y = 20 + idx * 14;
      elements.push(
        { kind: "shape", role: "band", shape: "roundRect", xPct: 6, yPct: y, wPct: 64, hPct: 9, fill: idx % 2 === 0 ? theme.panel : "FFFFFF", line: theme.panel, radius: 18 },
        { kind: "text", role: "phaseHeading", text: `${phase.phase}. ${phase.heading}`, xPct: 10, yPct: y + 2, wPct: 50, hPct: 3, fontFace: theme.bodyFont, fontSize: 15, bold: true, color: theme.text, align: "left" },
        { kind: "text", role: "phaseBody", text: phase.body || sectionA, xPct: 10, yPct: y + 5, wPct: 52, hPct: 3, fontFace: theme.bodyFont, fontSize: 10, color: theme.text, align: "left" }
      );
    });
    if (hero) elements.push({ kind: "image", role: "hero", source: hero.source, xPct: 74, yPct: 22, wPct: 18, hPct: 18, fit: "contain" });
    return { elements };
  }

  if (archetype === "editorial_cover_split") {
    if (family === "portrait_tall" || family === "portrait_editorial") {
      if (hero) {
        elements.push(
          { kind: "shape", role: "heroPanel", shape: "roundRect", xPct: 8, yPct: 8, wPct: 84, hPct: 40, fill: theme.panel, line: theme.panel, radius: 24 },
          { kind: "image", role: "hero", source: hero.source, xPct: 12, yPct: 11, wPct: 76, hPct: 34, fit: "cover", cornerRadius: 18 },
        );
      }
      elements.push(
        { kind: "text", role: "title", text: title, xPct: 10, yPct: hero ? 52 : 12, wPct: 74, hPct: 12, fontFace: theme.titleFont, fontSize: 28, color: theme.text, align: "left" },
        { kind: "text", role: "deck", text: deck, xPct: 10, yPct: hero ? 66 : 28, wPct: 72, hPct: 10, fontFace: theme.bodyFont, fontSize: 13, color: theme.text, align: "left" },
      );
      if (sectionB) {
        elements.push({ kind: "text", role: "body", text: sectionB, xPct: 10, yPct: 79, wPct: 72, hPct: 9, fontFace: theme.bodyFont, fontSize: 11, color: theme.text, align: "left" });
      }
      supporting.forEach((img, idx) => {
        elements.push({ kind: "image", role: "supporting", source: img.source, xPct: 10 + idx * 38, yPct: 89, wPct: 32, hPct: 8, fit: "cover", cornerRadius: 12 });
      });
      return { elements };
    }

    elements.push(
      { kind: "shape", role: "heroPanel", shape: "roundRect", xPct: 52, yPct: 6, wPct: 40, hPct: 82, fill: theme.panel, line: theme.panel, radius: 24 },
      ...(hero ? [{ kind: "image", role: "hero", source: hero.source, xPct: 56, yPct: 10, wPct: 32, hPct: 74, fit: "cover", cornerRadius: 18 }] : []),
      { kind: "text", role: "title", text: title, xPct: 8, yPct: 12, wPct: 38, hPct: 16, fontFace: theme.titleFont, fontSize: 30, color: theme.text, align: "left" },
      { kind: "text", role: "deck", text: deck, xPct: 8, yPct: 32, wPct: 36, hPct: 14, fontFace: theme.bodyFont, fontSize: 13, color: theme.text, align: "left" },
    );
    if (sectionB) {
      elements.push({ kind: "text", role: "body", text: sectionB, xPct: 8, yPct: 52, wPct: 36, hPct: 16, fontFace: theme.bodyFont, fontSize: 12, color: theme.text, align: "left" });
    }
    supporting.forEach((img, idx) => {
      elements.push({ kind: "image", role: "supporting", source: img.source, xPct: 8 + idx * 18, yPct: 74, wPct: 15, hPct: 12, fit: "cover", cornerRadius: 12 });
    });
    return { elements };
  }

  if (archetype === "title_hero_split") {
    if (family === "portrait_tall" || family === "portrait_editorial") {
      elements.push(
        { kind: "text", role: "title", text: title, xPct: 10, yPct: 8, wPct: 72, hPct: 11, fontFace: theme.titleFont, fontSize: 28, color: theme.text, align: "left" },
        { kind: "text", role: "deck", text: deck, xPct: 10, yPct: 22, wPct: 70, hPct: 9, fontFace: theme.bodyFont, fontSize: 13, color: theme.text, align: "left" },
      );
      if (hero) {
        elements.push(
          { kind: "shape", role: "panel", shape: "roundRect", xPct: 8, yPct: 35, wPct: 84, hPct: 34, fill: theme.panel, line: theme.panel, radius: 22 },
          { kind: "image", role: "hero", source: hero.source, xPct: 12, yPct: 38, wPct: 76, hPct: 28, fit: "cover", cornerRadius: 18 },
        );
      }
      if (sectionB) {
        elements.push({ kind: "text", role: "body", text: sectionB, xPct: 10, yPct: 73, wPct: 72, hPct: 10, fontFace: theme.bodyFont, fontSize: 11, color: theme.text, align: "left" });
      }
      supporting.forEach((img, idx) => {
        elements.push({ kind: "image", role: "supporting", source: img.source, xPct: 10 + idx * 38, yPct: 86, wPct: 32, hPct: 10, fit: "cover", cornerRadius: 12 });
      });
      return { elements };
    }
  }

  if (archetype === "feature_story_panels") {
    if (family === "portrait_tall" || family === "portrait_editorial") {
      if (hero) {
        elements.push(
          { kind: "shape", role: "heroPanel", shape: "roundRect", xPct: 8, yPct: 8, wPct: 84, hPct: 30, fill: theme.panel, line: theme.panel, radius: 22 },
          { kind: "image", role: "hero", source: hero.source, xPct: 12, yPct: 11, wPct: 76, hPct: 24, fit: "cover", cornerRadius: 18 },
        );
      }
      elements.push(
        { kind: "text", role: "title", text: title, xPct: 10, yPct: 42, wPct: 72, hPct: 10, fontFace: theme.titleFont, fontSize: 27, color: theme.text, align: "left" },
        { kind: "text", role: "deck", text: deck, xPct: 10, yPct: 54, wPct: 70, hPct: 8, fontFace: theme.bodyFont, fontSize: 12, color: theme.text, align: "left" },
      );
      if (sectionB) {
        elements.push({ kind: "text", role: "body", text: sectionB, xPct: 10, yPct: 65, wPct: 72, hPct: 10, fontFace: theme.bodyFont, fontSize: 11, color: theme.text, align: "left" });
      }
      supporting.forEach((img, idx) => {
        elements.push({ kind: "image", role: "supporting", source: img.source, xPct: 10 + idx * 38, yPct: 79, wPct: 32, hPct: 16, fit: "cover", cornerRadius: 14 });
      });
      return { elements };
    }

    elements.push(
      { kind: "text", role: "title", text: title, xPct: 8, yPct: 8, wPct: 42, hPct: 10, fontFace: theme.titleFont, fontSize: 28, color: theme.text, align: "left" },
      { kind: "text", role: "deck", text: deck, xPct: 8, yPct: 21, wPct: 40, hPct: 10, fontFace: theme.bodyFont, fontSize: 12, color: theme.text, align: "left" },
      ...(hero ? [
        { kind: "shape", role: "heroPanel", shape: "roundRect", xPct: 54, yPct: 8, wPct: 36, hPct: 38, fill: theme.panel, line: theme.panel, radius: 20 },
        { kind: "image", role: "hero", source: hero.source, xPct: 57, yPct: 11, wPct: 30, hPct: 32, fit: "cover", cornerRadius: 16 },
      ] : []),
    );
    if (sectionB) {
      elements.push({ kind: "text", role: "body", text: sectionB, xPct: 8, yPct: 36, wPct: 40, hPct: 18, fontFace: theme.bodyFont, fontSize: 11, color: theme.text, align: "left" });
    }
    supporting.forEach((img, idx) => {
      elements.push({ kind: "image", role: "supporting", source: img.source, xPct: 8 + idx * 22, yPct: 62, wPct: 18, hPct: 18, fit: "cover", cornerRadius: 12 });
    });
    if (sectionC) {
      elements.push({ kind: "text", role: "caption", text: sectionC, xPct: 54, yPct: 52, wPct: 34, hPct: 16, fontFace: theme.bodyFont, fontSize: 11, color: theme.text, align: "left" });
    }
    return { elements };
  }

  if (archetype === "two_column_editorial") {
    const leftBody = sectionA;
    const rightBody = sectionB || sectionC;
    elements.push(
      { kind: "text", role: "title", text: title, xPct: 8, yPct: 8, wPct: 72, hPct: 10, fontFace: theme.titleFont, fontSize: 28, color: theme.text, align: "left" },
      { kind: "text", role: "deck", text: deck, xPct: 8, yPct: 20, wPct: 76, hPct: 8, fontFace: theme.bodyFont, fontSize: 12, color: theme.text, align: "left" },
    );
    if (hero) {
      elements.push({ kind: "image", role: "hero", source: hero.source, xPct: family === "report_compact" ? 68 : 70, yPct: 8, wPct: 20, hPct: 16, fit: "cover", cornerRadius: 14 });
    }
    if (leftBody) {
      elements.push({ kind: "text", role: "bodyLeft", text: leftBody, xPct: 8, yPct: 34, wPct: 34, hPct: 30, fontFace: theme.bodyFont, fontSize: 11, color: theme.text, align: "left" });
    }
    if (rightBody) {
      elements.push({ kind: "text", role: "bodyRight", text: rightBody, xPct: 48, yPct: 34, wPct: 34, hPct: 30, fontFace: theme.bodyFont, fontSize: 11, color: theme.text, align: "left" });
    }
    supporting.forEach((img, idx) => {
      elements.push({ kind: "image", role: "supporting", source: img.source, xPct: 8 + idx * 24, yPct: 72, wPct: 20, hPct: 15, fit: "cover", cornerRadius: 12 });
    });
    return { elements };
  }

  if (archetype === "stat_card_with_image") {
    elements.push(
      { kind: "text", role: "title", text: title, xPct: 8, yPct: 8, wPct: 42, hPct: 10, fontFace: theme.titleFont, fontSize: 28, color: theme.text, align: "left" },
      { kind: "text", role: "deck", text: deck, xPct: 8, yPct: 20, wPct: 36, hPct: 12, fontFace: theme.bodyFont, fontSize: 12, color: theme.text, align: "left" },
      ...(hero ? [
        { kind: "shape", role: "heroPanel", shape: "roundRect", xPct: 54, yPct: 8, wPct: 36, hPct: 34, fill: theme.panel, line: theme.panel, radius: 18 },
        { kind: "image", role: "hero", source: hero.source, xPct: 57, yPct: 11, wPct: 30, hPct: 28, fit: "cover", cornerRadius: 14 },
      ] : []),
    );
    uniqueTextBlocks([sectionA, sectionB, sectionC, ...bullets]).slice(0, 3).forEach((item, idx) => {
      const x = 8 + (idx % 2) * 22;
      const y = 42 + Math.floor(idx / 2) * 18;
      elements.push(
        { kind: "shape", role: "statCard", shape: "roundRect", xPct: x, yPct: y, wPct: 18, hPct: 12, fill: theme.panel, line: theme.panel, radius: 14 },
        { kind: "text", role: "statBody", text: item, xPct: x + 2, yPct: y + 2, wPct: 14, hPct: 8, fontFace: theme.bodyFont, fontSize: 10, color: theme.text, align: "left" },
      );
    });
    supporting.forEach((img, idx) => {
      elements.push({ kind: "image", role: "supporting", source: img.source, xPct: 54 + idx * 16, yPct: 48, wPct: 14, hPct: 18, fit: "cover", cornerRadius: 12 });
    });
    return { elements };
  }

  elements.push(
    { kind: "text", role: "title", text: title, xPct: 8, yPct: family === "portrait_tall" || family === "portrait_editorial" ? 10 : 8, wPct: hero ? 46 : 70, hPct: 12, fontFace: theme.titleFont, fontSize: 28, color: theme.text, align: "left" },
    { kind: "text", role: "deck", text: deck, xPct: 8, yPct: family === "portrait_tall" || family === "portrait_editorial" ? 24 : 22, wPct: family === "portrait_tall" || family === "portrait_editorial" ? 54 : 40, hPct: 9, fontFace: theme.bodyFont, fontSize: 13, color: theme.text, align: "left" }
  );
  if (hero) {
    elements.push(
      { kind: "shape", role: "panel", shape: "roundRect", xPct: family === "portrait_tall" || family === "portrait_editorial" ? 58 : 56, yPct: 7, wPct: family === "portrait_tall" || family === "portrait_editorial" ? 34 : 36, hPct: family === "portrait_tall" || family === "portrait_editorial" ? 34 : 42, fill: theme.panel, line: theme.panel, radius: 22 },
      { kind: "image", role: "hero", source: hero.source, xPct: family === "portrait_tall" || family === "portrait_editorial" ? 61 : 59, yPct: 10, wPct: family === "portrait_tall" || family === "portrait_editorial" ? 28 : 30, hPct: family === "portrait_tall" || family === "portrait_editorial" ? 28 : 36, fit: "cover", cornerRadius: 16 }
    );
  }
  if (bullets.length) {
    bullets.slice(0, 4).forEach((item, idx) => {
      elements.push({ kind: "text", role: "bullet", text: `• ${item}`, xPct: 8, yPct: (family === "portrait_tall" || family === "portrait_editorial" ? 44 : 38) + idx * 7, wPct: hero ? 42 : 70, hPct: 5, fontFace: theme.bodyFont, fontSize: 12, color: theme.text, align: "left" });
    });
  } else if (sectionB) {
    elements.push({ kind: "text", role: "body", text: sectionB, xPct: 8, yPct: family === "portrait_tall" || family === "portrait_editorial" ? 46 : 40, wPct: hero ? 42 : 70, hPct: 18, fontFace: theme.bodyFont, fontSize: 12, color: theme.text, align: "left" });
  }
  supporting.forEach((img, idx) => {
    elements.push({ kind: "image", role: "supporting", source: img.source, xPct: 8 + idx * 20, yPct: family === "portrait_tall" || family === "portrait_editorial" ? 78 : 72, wPct: 18, hPct: family === "portrait_tall" || family === "portrait_editorial" ? 14 : 16, fit: "cover", cornerRadius: 12 });
  });

  if (variant === 2) {
    elements.push({ kind: "shape", role: "accentLine", shape: "line", xPct: 8, yPct: 33, wPct: 30, hPct: 0.2, line: theme.accent });
  }
  if (variant === 3) {
    elements.push({ kind: "shape", role: "accentOrb", shape: "ellipse", xPct: 86, yPct: 6, wPct: 8, hPct: 8, fill: theme.panel, line: theme.panel });
  }
  return { elements };
}
