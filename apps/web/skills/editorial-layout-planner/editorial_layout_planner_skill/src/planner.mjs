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

  const debugPages = [];
  const slides = limitedPages.map((page, index) => {
    const archetypePlan = resolveArchetypePlan(page, normalized, rng);
    let archetype = archetypePlan.selectedArchetype;
    const metrics = getEffectiveEditorialMetrics(page);
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
    let layout = layoutFromArchetype({
      page: {
        ...page,
        images,
      },
      archetype,
      normalized,
      rng,
      index,
      variant,
    });
    const initialLayoutSummary = summarizeLayout(layout);
    const qualityFallback = chooseQualityFallbackArchetype({
      page: {
        ...page,
        images,
      },
      archetype,
      layout,
      normalized,
    });
    if (qualityFallback && qualityFallback !== archetype) {
      archetype = qualityFallback;
      layout = layoutFromArchetype({
        page: {
          ...page,
          images,
        },
        archetype,
        normalized,
        rng,
        index,
        variant,
      });
    }
    const finalLayoutSummary = summarizeLayout(layout);
    debugPages.push({
      pageNumber: index + 1,
      title: page.editorial?.pageTitle ?? "",
      intent: page.intent,
      forceArchetype: page.forceArchetype ?? "auto",
      selectedArchetype: archetype,
      initialSelectedArchetype: archetypePlan.selectedArchetype,
      candidateArchetypes: archetypePlan.candidates,
      fallbackCandidates: archetypePlan.fallbackCandidates,
      candidateScores: archetypePlan.candidateScores ?? [],
      rejectedCandidates: archetypePlan.rejectedCandidates ?? [],
      randomizeLayouts: normalized.randomizeLayouts,
      visibleImageCount: images.length,
      imageSources: images.map((image) => image?.source).filter(Boolean),
      structure: {
        bulletCount: metrics.bulletCount,
        explicitBulletCount: metrics.explicitBulletCount,
        workflowStepCount: page.editorial?.workflowSteps?.length ?? 0,
        timelinePhaseCount: page.editorial?.timelinePhases?.length ?? 0,
        sectionCount: metrics.sectionCount,
        explicitSectionCount: metrics.explicitSectionCount,
        titleCharCount: countChars(page.editorial?.pageTitle ?? ""),
        deckCharCount: countChars(page.editorial?.deck ?? ""),
        pageWordCount: countWords(page.text ?? ""),
        pageCharCount: countChars(page.text ?? ""),
      },
      initialLayout: initialLayoutSummary,
      qualityFallbackApplied: qualityFallback && qualityFallback !== archetypePlan.selectedArchetype ? qualityFallback : null,
      finalLayout: finalLayoutSummary,
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
      skillId: "editorial-layout-planner",
      skillName: "Editorial Layout Planner",
      projectTitle: normalized.projectTitle,
      designStyle: normalized.designStyle,
      density: normalized.density,
      seed: normalized.seed,
      pageLimit: normalized.pageLimit,
      debug: {
        generatedAt: new Date().toISOString(),
        rendererSkillId: "editorial-layout-planner",
        pages: debugPages,
      },
    },
    slides
  };
}

function summarizeLayout(layout) {
  const elements = Array.isArray(layout?.elements) ? layout.elements : [];
  const textElements = elements.filter((element) => element.kind === "text");
  const imageElements = elements.filter((element) => element.kind === "image");
  const fontSizesByRole = {};
  for (const element of textElements) {
    const role = String(element.role ?? "text");
    const fontSize = Number(element.fontSize ?? 0);
    if (!fontSize) continue;
    fontSizesByRole[role] = fontSize;
  }
  const textBottomPct = textElements.reduce((maxEdge, element) => {
    const y = Number(element.yPct ?? 0);
    const h = Number(element.hPct ?? 0);
    return Math.max(maxEdge, y + h);
  }, 0);
  const imageBottomPct = imageElements.reduce((maxEdge, element) => {
    const y = Number(element.yPct ?? 0);
    const h = Number(element.hPct ?? 0);
    return Math.max(maxEdge, y + h);
  }, 0);
  return {
    elementCount: elements.length,
    textElementCount: textElements.length,
    imageElementCount: imageElements.length,
    textBottomPct,
    imageBottomPct,
    fontSizesByRole,
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
    const inferredIntent = idx === 0
      ? "editorial_cover"
      : classifyIntent(text, editorial);
    return {
      id: `page_${String(idx + 1).padStart(2, "0")}`,
      titleHint: idx === 0 ? titleHint : editorial.pageTitle,
      text,
      intent: normalized.pageIntentHint !== "auto" && pageCount === 1 && idx > 0
        ? normalized.pageIntentHint
        : inferredIntent,
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
    const currentHasOnlyHeading = current.length === 1 && current[0]?.type === "heading";
    const shouldBreak = current.length > 0 && (
      (!currentHasOnlyHeading && projected > densityUnits) ||
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

  if (bullets.length > 0 && bullets.length < 4) {
    const synthesizedBullets = synthesizeBulletsFromBlocks([
      deck,
      ...sections.map((section) => section?.body ?? ""),
    ], 4);
    bullets = uniqueTextBlocks([...bullets, ...synthesizedBullets]).slice(0, 6);
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
  if (clean.length <= 120) return clean;
  const short = clean.slice(0, 117).replace(/\s+\S*$/, "");
  return `${short}...`;
}

function truncateBody(text, max = 160) {
  const clean = cleanText(text).replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const short = clean.slice(0, max - 3).replace(/\s+\S*$/, "");
  return `${short}...`;
}

function countWords(text) {
  return cleanText(String(text ?? ""))
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .length;
}

function countChars(text) {
  return cleanText(String(text ?? "")).replace(/\s+/g, "").length;
}

function getDeterministicPortraitVariant(index, variant, randomizeLayouts, max = 3) {
  if (randomizeLayouts) {
    return clampNumber(Number(variant ?? 1), 1, max);
  }
  return ((Number(index ?? 0) % max) + 1);
}

function getDeterministicPageSeed(page) {
  const pageNumber = Number(page?.pageNumber ?? 0);
  if (Number.isFinite(pageNumber) && pageNumber > 0) {
    return pageNumber;
  }
  const idMatch = String(page?.id ?? "").match(/(\d+)/);
  if (idMatch) {
    return Number(idMatch[1]);
  }
  const titleChars = countChars(page?.editorial?.pageTitle ?? page?.titleHint ?? "");
  return Math.max(1, titleChars || 1);
}

function scoreArchetypeFit(page, archetype, normalized) {
  const metrics = getEffectiveEditorialMetrics(page);
  const bulletCount = metrics.bulletCount;
  const explicitBulletCount = metrics.explicitBulletCount;
  const sectionCount = metrics.sectionCount;
  const explicitSectionCount = metrics.explicitSectionCount;
  const summaryBulletCount = metrics.summaryBullets.length;
  const compactCardCount = metrics.compactCardBlocks.length;
  const longNarrativeCount = metrics.longNarrativeBlocks.length;
  const deckChars = metrics.deckChars;
  const family = normalized.ratioInfo.family;
  const intent = String(page?.intent ?? "");
  const hasHero = (page.images?.length ?? 0) > 0;
  let score = 0;

  if (family === "portrait_tall") score += 2;
  if (hasHero) score += 1;

  switch (archetype) {
    case "portrait_large_type":
      score += family === "portrait_tall" ? 26 : -10;
      score += hasHero ? 8 : 2;
      score += deckChars >= 70 && deckChars <= 150 ? 8 : 0;
      score += longNarrativeCount >= 1 ? 8 : 0;
      score += summaryBulletCount >= 1 && summaryBulletCount <= 3 ? 6 : 0;
      score += explicitSectionCount <= 1 ? 5 : 0;
      score -= compactCardCount >= 3 ? 6 : 0;
      score -= (page.editorial?.workflowSteps?.length ?? 0) >= 3 ? 10 : 0;
      score -= (page.editorial?.timelinePhases?.length ?? 0) >= 3 ? 10 : 0;
      break;
    case "editorial_cover_split":
      score += 24;
      score += summaryBulletCount >= 3 ? 8 : 0;
      score += deckChars >= 110 ? 4 : 0;
      score -= deckChars > 190 ? 4 : 0;
      break;
    case "executive_summary_dashboard":
    case "product_overview_report":
      score += sectionCount >= 2 ? 14 : 0;
      score += bulletCount >= 3 ? 12 : 0;
      score += explicitBulletCount >= 2 ? 6 : 0;
      score += explicitSectionCount >= 1 ? 4 : 0;
      score += deckChars >= 85 && deckChars <= 155 ? 5 : 0;
      score -= longNarrativeCount > 2 ? 4 : 0;
      break;
    case "two_column_editorial":
      score += explicitSectionCount >= 2 ? 16 : 0;
      score += sectionCount >= 2 ? 10 : 0;
      score += explicitBulletCount >= 1 ? 4 : 0;
      score += deckChars >= 95 ? 3 : 0;
      score -= explicitSectionCount === 0 && explicitBulletCount === 0 ? 8 : 0;
      score -= longNarrativeCount > 2 ? 3 : 0;
      break;
    case "feature_story_panels":
      score += hasHero ? 8 : 0;
      score += deckChars <= 135 ? 6 : 0;
      score += summaryBulletCount >= 2 ? 4 : 0;
      score += longNarrativeCount <= 1 ? 4 : 0;
      score += explicitSectionCount === 0 ? 2 : 0;
      break;
    case "title_hero_split":
      score += hasHero ? 9 : 0;
      score += deckChars >= 100 ? 5 : 0;
      score += longNarrativeCount >= 1 ? 4 : 0;
      score += summaryBulletCount >= 2 ? 3 : 0;
      score += explicitSectionCount === 0 ? 2 : 0;
      break;
    case "stat_card_with_image":
      score += compactCardCount >= 3 ? 10 : 0;
      score += explicitBulletCount >= 3 ? 8 : 0;
      score += deckChars <= 120 ? 6 : 0;
      score -= deckChars > 135 ? 12 : 0;
      score -= longNarrativeCount * 7;
      score -= explicitSectionCount > 0 ? 4 : 0;
      break;
    case "vertical_workflow_steps":
      score += (page.editorial?.workflowSteps?.length ?? 0) >= 3 ? 18 : 0;
      score += bulletCount >= 3 ? 4 : 0;
      break;
    case "project_timeline_bands":
      score += (page.editorial?.timelinePhases?.length ?? 0) >= 3 ? 18 : 0;
      break;
    default:
      break;
  }

  if (intent === "strategy_overview") {
    if (archetype === "portrait_large_type") score += 10;
    if (archetype === "executive_summary_dashboard" || archetype === "title_hero_split") score += 4;
    if (archetype === "feature_story_panels" && summaryBulletCount >= 3) score += 2;
    if (archetype === "two_column_editorial" && explicitSectionCount < 2) score -= 3;
  }

  if (intent === "case_study") {
    if (archetype === "portrait_large_type") score += 8;
    if (archetype === "two_column_editorial") score += 8;
    if (archetype === "feature_story_panels") score += 3;
    if (archetype === "title_hero_split") score += 2;
  }

  if (intent === "editorial_cover" && archetype !== "editorial_cover_split") {
    score -= 10;
  }

  return score;
}

function selectDeterministicArchetype(candidates, page, normalized, candidateScores = []) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }
  if (normalized.randomizeLayouts) {
    return null;
  }
  const rankedCandidates = (candidateScores.length > 0
    ? candidateScores
    : candidates.map((candidate, index) => ({
        archetype: candidate,
        score: scoreArchetypeFit(page, candidate, normalized),
        order: index,
      })))
    .filter((item) => candidates.includes(item.archetype))
    .sort((a, b) => (b.score - a.score) || (a.order - b.order));

  if (rankedCandidates.length === 0) {
    return candidates[0] ?? null;
  }

  if (normalized.ratioInfo.family !== "portrait_tall") {
    return rankedCandidates[0]?.archetype ?? candidates[0] ?? null;
  }
  const intent = String(page?.intent ?? "");
  const shouldVaryPortraitStrategy = (
    intent === "strategy_overview"
    || intent === "executive_summary"
    || intent === "product_summary"
    || intent === "report_page"
    || intent === "case_study"
  );
  if (!shouldVaryPortraitStrategy) {
    return rankedCandidates[0]?.archetype ?? candidates[0] ?? null;
  }
  const bestScore = rankedCandidates[0]?.score ?? 0;
  const filteredCandidates = rankedCandidates.filter((candidate) => (
    candidate.archetype !== "editorial_cover_split"
    || intent === "editorial_cover"
    || rankedCandidates.length === 1
  ));
  const tieBand = filteredCandidates.filter((candidate) => candidate.score >= bestScore - 2);
  const pool = (tieBand.length > 0 ? tieBand : filteredCandidates).length > 0
    ? (tieBand.length > 0 ? tieBand : filteredCandidates)
    : rankedCandidates;
  const seed = getDeterministicPageSeed(page);
  return pool[(seed - 1) % pool.length]?.archetype ?? pool[0]?.archetype ?? candidates[0] ?? null;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fitTextSize({ text, widthPct, heightPct, min, max, role = "body", family = "landscape_wide" }) {
  const chars = countChars(text);
  const words = countWords(text);
  const area = Math.max(1, Number(widthPct ?? 0) * Number(heightPct ?? 0));
  const familyBoost = family === "portrait_tall" ? 1.12 : family === "portrait_editorial" ? 1.04 : 1;
  const rolePressure = role === "title"
    ? 1.02
    : role === "deck"
      ? 1.05
      : role === "bullet"
        ? 1
        : 0.96;
  const contentWeight = role === "title"
    ? ((chars * 2.2) + (words * 6))
    : role === "deck"
      ? ((chars * 1.4) + (words * 4.2))
      : ((chars * 1.1) + (words * 3.5));
  const density = contentWeight / (area * familyBoost * rolePressure);
  const normalizedDensity = clampNumber((density - 0.18) / 0.82, 0, 1);

  const charsPerLineFactor = role === "title"
    ? (family === "portrait_tall" ? 0.62 : 0.82)
    : role === "deck"
      ? (family === "portrait_tall" ? 1.05 : 1.22)
      : (family === "portrait_tall" ? 1.18 : 1.34);
  const estimatedCharsPerLine = Math.max(8, Math.round(Number(widthPct ?? 0) * charsPerLineFactor));
  const estimatedLines = Math.max(1, Math.ceil(chars / estimatedCharsPerLine));
  const allowedLines = role === "title"
    ? Math.max(2, Math.round(Number(heightPct ?? 0) / (family === "portrait_tall" ? 3.6 : 4.2)))
    : role === "deck"
      ? Math.max(2, Math.round(Number(heightPct ?? 0) / (family === "portrait_tall" ? 3.2 : 3.8)))
      : Math.max(2, Math.round(Number(heightPct ?? 0) / (family === "portrait_tall" ? 2.9 : 3.4)));
  const linePressure = clampNumber((estimatedLines - allowedLines) / Math.max(1, allowedLines), 0, 1.4);
  const weightedDensity = clampNumber(normalizedDensity + (linePressure * 0.55), 0, 1);
  return Math.round(max - ((max - min) * weightedDensity));
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
  return resolveArchetypePlan(page, normalized, rng).selectedArchetype;
}

function resolveArchetypePlan(page, normalized, rng) {
  const familyList = ARCHETYPES[normalized.ratioInfo.family] ?? ARCHETYPES.landscape_wide;
  if (page.forceArchetype && page.forceArchetype !== "auto") {
    return {
      selectedArchetype: page.forceArchetype,
      candidates: [page.forceArchetype],
      fallbackCandidates: [],
      candidateScores: [{ archetype: page.forceArchetype, score: scoreArchetypeFit(page, page.forceArchetype, normalized) }],
      familyCandidates: familyList,
    };
  }
  const metrics = getEffectiveEditorialMetrics(page);
  const bulletCount = metrics.bulletCount;
  const sectionCount = metrics.sectionCount;
  let intentList = INTENT_TO_ARCHETYPES[page.intent] ?? familyList;
  if (normalized.ratioInfo.family === "portrait_tall" && page.intent === "strategy_overview") {
    const deckChars = metrics.deckChars;
    const structuredEnoughForDashboard = metrics.explicitSectionCount >= 2 || (metrics.explicitBulletCount >= 3 && deckChars <= 90);
    intentList = structuredEnoughForDashboard
      ? ["executive_summary_dashboard", "portrait_large_type", "title_hero_split", "feature_story_panels", "two_column_editorial", "stat_card_with_image"]
      : ["portrait_large_type", "title_hero_split", "feature_story_panels", "executive_summary_dashboard", "two_column_editorial", "stat_card_with_image"];
  }
  if (normalized.ratioInfo.family === "portrait_tall" && page.intent === "case_study") {
    intentList = ["portrait_large_type", "title_hero_split", "feature_story_panels", "two_column_editorial"];
  }
  const familySet = new Set(familyList);
  const compatibilityChecks = intentList
    .filter((item) => familySet.has(item))
    .map((item) => ({
      archetype: item,
      score: scoreArchetypeFit(page, item, normalized),
      issues: getArchetypeCompatibilityIssues(page, item),
    }));
  const candidates = intentList
    .filter(item => familySet.has(item))
    .filter(item => isArchetypeCompatible(page, item));
  const fallbackCandidates = chooseFallbackArchetypes(page, normalized)
    .filter(item => familySet.has(item))
    .filter(item => item !== page.forceArchetype)
    .filter(item => isArchetypeCompatible(page, item));
  const resolvedCandidates = candidates.length ? candidates : fallbackCandidates;
  const finalCandidates = resolvedCandidates.length ? resolvedCandidates : familyList;
  const candidateScores = finalCandidates.map((item, index) => ({
    archetype: item,
    score: scoreArchetypeFit(page, item, normalized),
    order: index,
  }));
  const deterministicSelection = selectDeterministicArchetype(finalCandidates, page, normalized, candidateScores);
  return {
    selectedArchetype: normalized.randomizeLayouts
      ? pickOne(finalCandidates, rng)
      : (deterministicSelection ?? finalCandidates[0] ?? familyList[0]),
    candidates,
    fallbackCandidates,
    candidateScores: candidateScores
      .slice()
      .sort((a, b) => (b.score - a.score) || (a.order - b.order))
      .map(({ archetype, score }) => ({ archetype, score })),
    rejectedCandidates: compatibilityChecks
      .filter((item) => item.issues.length > 0)
      .map(({ archetype, issues, score }) => ({ archetype, issues, score })),
    familyCandidates: familyList,
  };
}

function getArchetypeCompatibilityIssues(page, archetype) {
  const metrics = getEffectiveEditorialMetrics(page);
  const bulletCount = metrics.bulletCount;
  const sectionCount = metrics.sectionCount;
  const deckChars = metrics.deckChars;
  const compactCardBlocks = metrics.compactCardBlocks;
  const longNarrativeBlocks = metrics.longNarrativeBlocks;
  const issues = [];
  if (archetype === "vertical_workflow_steps") {
    if ((page.editorial?.workflowSteps?.length ?? 0) <= 0 && bulletCount < 2) {
      issues.push("requires workflow steps or at least two bullets");
    }
    return issues;
  }
  if (archetype === "project_timeline_bands") {
    if ((page.editorial?.timelinePhases?.length ?? 0) <= 0) {
      issues.push("requires timeline phases");
    }
    return issues;
  }
  if (archetype === "executive_summary_dashboard" || archetype === "product_overview_report") {
    if (!(bulletCount >= 2 || sectionCount >= 2)) {
      issues.push("requires at least two bullets or two sections");
    }
    return issues;
  }
  if (archetype === "portrait_large_type") {
    if ((page.images?.length ?? 0) <= 0 && metrics.deckChars > 150) {
      issues.push("needs either a hero image or shorter narrative copy");
    }
    if ((page.editorial?.workflowSteps?.length ?? 0) >= 3) {
      issues.push("workflow pages should use step-oriented layouts");
    }
    if ((page.editorial?.timelinePhases?.length ?? 0) >= 3) {
      issues.push("timeline pages should use timeline layouts");
    }
    return issues;
  }
  if (archetype === "two_column_editorial") {
    if (metrics.explicitSectionCount >= 2) {
      return issues;
    }
    if (!(sectionCount >= 2 && (metrics.explicitBulletCount >= 1 || bulletCount >= 3))) {
      issues.push("requires two sections or a section plus supporting bullets");
    }
    if (metrics.explicitSectionCount === 0 && deckChars > 150) {
      issues.push("relies on synthesized sections while deck copy is still too long");
    }
    return issues;
  }
  if (archetype === "stat_card_with_image") {
    if (!(metrics.explicitBulletCount >= 3 || compactCardBlocks.length >= 3 || (bulletCount >= 3 && deckChars <= 130))) {
      issues.push("requires at least two compact bullet/card blocks");
    }
    if (longNarrativeBlocks.length > 0) {
      issues.push("contains too many long prose blocks for stat cards");
    }
    if (deckChars > 135) {
      issues.push("deck copy is too long for stat cards");
    }
    return issues;
  }
  return issues;
}

function isArchetypeCompatible(page, archetype) {
  return getArchetypeCompatibilityIssues(page, archetype).length === 0;
}

function chooseFallbackArchetypes(page, normalized) {
  const family = normalized.ratioInfo.family;
  if (page.intent === "workflow_infographic" || page.intent === "healthcare_steps") {
    return ["vertical_workflow_steps", "title_hero_split", "feature_story_panels", "editorial_cover_split"];
  }
  if (page.intent === "strategy_overview" || page.intent === "executive_summary" || page.intent === "product_summary" || page.intent === "report_page") {
    return family === "portrait_tall"
      ? ["portrait_large_type", "title_hero_split", "feature_story_panels", "two_column_editorial", "editorial_cover_split", "vertical_workflow_steps"]
      : ["executive_summary_dashboard", "two_column_editorial", "product_overview_report", "title_hero_split"];
  }
  if (page.intent === "project_timeline") {
    return ["project_timeline_bands", "feature_story_panels", "title_hero_split"];
  }
  if (page.intent === "case_study" && family === "portrait_tall") {
    return ["portrait_large_type", "title_hero_split", "feature_story_panels", "two_column_editorial"];
  }
  return ["title_hero_split", "feature_story_panels", "editorial_cover_split", "vertical_workflow_steps"];
}

function chooseQualityFallbackArchetype({ page, archetype, layout, normalized }) {
  const family = normalized.ratioInfo.family;
  const textElements = layout.elements.filter((element) => element.kind === "text");
  const lowestTextEdge = textElements.reduce((maxEdge, element) => {
    const y = Number(element.yPct ?? 0);
    const h = Number(element.hPct ?? 0);
    return Math.max(maxEdge, y + h);
  }, 0);
  const bulletCount = textElements.filter((element) => element.role === "bullet").length;
  const hasRightColumn = textElements.some((element) => element.role === "bodyRight");
  const textDensity = textElements
    .map((element) => String(element.text ?? "").trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .length;

  if (
    (archetype === "executive_summary_dashboard" || archetype === "product_overview_report")
    && bulletCount < 2
  ) {
    return chooseFallbackArchetypes(page, normalized).find((candidate) => candidate !== archetype && isArchetypeCompatible(page, candidate)) ?? null;
  }

  if (archetype === "two_column_editorial" && !hasRightColumn) {
    return chooseFallbackArchetypes(page, normalized).find((candidate) => candidate !== archetype && isArchetypeCompatible(page, candidate)) ?? null;
  }

  if (
    family === "portrait_tall"
    && (archetype === "executive_summary_dashboard" || archetype === "two_column_editorial")
    && lowestTextEdge > 94
    && isArchetypeCompatible(page, "portrait_large_type")
  ) {
    return "portrait_large_type";
  }

  if (
    family === "portrait_tall"
    && (archetype === "title_hero_split" || archetype === "feature_story_panels")
    && lowestTextEdge < 78
    && textDensity > 160
    && (
      (page.editorial?.workflowSteps?.length ?? 0) >= 3
      || page.intent === "workflow_infographic"
      || page.intent === "healthcare_steps"
    )
    && isArchetypeCompatible(page, "vertical_workflow_steps")
  ) {
    return "vertical_workflow_steps";
  }

  return null;
}

function stripListMarker(line) {
  return cleanText(String(line ?? "").replace(/^(?:[-•*]\s|[0-9]+\.)\s*/, ""));
}

function comparableText(text) {
  return stripListMarker(stripEditorialLabel(cleanText(String(text ?? ""))))
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

function stripEditorialLabel(text) {
  return cleanText(String(text ?? ""))
    .replace(/^(?:overview|context|considerations|recommended action|details|summary|key points)\s*:\s*/i, "")
    .trim();
}

function splitNarrativeIntoClauses(text) {
  const cleaned = stripEditorialLabel(text);
  if (!cleaned) return [];
  const paragraphParts = cleaned
    .split(/\n+/)
    .map((part) => cleanText(part))
    .filter(Boolean);
  const clauseParts = paragraphParts.flatMap((part) => part
    .split(/(?:,\s*|;\s*|\s+(?=(?:ขณะเดียวกัน|พ่อแม่(?:ควร|จำเป็นต้อง)|นอกจากนี้(?:ควร)?|รวมถึง|โดยเฉพาะ|เพื่อ|เมื่อ|หาก|ควร(?:เริ่ม|จัด|ใช้|ให้|สร้าง|ลด|สงวน)?|เช่น|พร้อมทั้ง)))/)
    .map((item) => cleanText(item))
    .filter(Boolean));
  if (clauseParts.length <= 1 && countChars(cleaned) > 90) {
    const mid = Math.floor(cleaned.length / 2);
    const splitAt = cleaned.indexOf(" ", mid);
    if (splitAt > 0) {
      return [
        cleanText(cleaned.slice(0, splitAt)),
        cleanText(cleaned.slice(splitAt + 1)),
      ].filter(Boolean);
    }
  }
  return clauseParts;
}

function synthesizeBulletsFromBlocks(blocks, maxItems = 4) {
  const candidates = [];
  for (const block of uniqueTextBlocks(blocks)) {
    const clauses = splitNarrativeIntoClauses(block);
    for (const clause of clauses) {
      const cleaned = truncateBody(stripListMarker(stripEditorialLabel(clause)), 92);
      if (countChars(cleaned) < 18) continue;
      candidates.push(cleaned);
      if (candidates.length >= maxItems * 2) break;
    }
    if (candidates.length >= maxItems * 2) break;
  }
  return uniqueTextBlocks(candidates).slice(0, maxItems);
}

function synthesizeEditorialBullets(page, maxItems = 4) {
  const explicit = uniqueTextBlocks(page.editorial?.bullets ?? []).slice(0, maxItems);
  const synthesized = synthesizeBulletsFromBlocks([
    page.editorial?.deck ?? "",
    ...(page.editorial?.sections ?? []).map((section) => section?.body ?? ""),
    page.text ?? "",
  ], maxItems);
  if (!explicit.length) return synthesized;
  return uniqueTextBlocks([...explicit, ...synthesized]).slice(0, maxItems);
}

function getPortraitNarrativeContent(page) {
  const explicitBullets = uniqueTextBlocks(page.editorial?.bullets ?? []).slice(0, 2);
  const rawSections = (page.editorial?.sections ?? [])
    .map((section) => stripEditorialLabel(section?.body ?? ""))
    .filter(Boolean);
  const deck = stripEditorialLabel(page.editorial?.deck ?? "");
  const bodyCandidates = uniqueTextBlocks([
    ...rawSections,
    ...explicitBullets,
    deck,
  ]).filter((item) => countChars(item) >= 18);

  const lead = bodyCandidates[0] ?? deck;
  const takeaway = bodyCandidates.find((item) => comparableText(item) !== comparableText(lead))
    ?? "";
  const bullets = explicitBullets.length > 0
    ? explicitBullets
        .filter((item) => comparableText(item) !== comparableText(lead))
        .filter((item) => comparableText(item) !== comparableText(takeaway))
        .slice(0, 2)
    : synthesizeBulletsFromBlocks([
        takeaway,
      ], 1).filter((item) => comparableText(item) !== comparableText(lead));

  return {
    lead,
    takeaway,
    bullets,
  };
}

function getEffectiveEditorialMetrics(page) {
  const rawSections = (page.editorial?.sections ?? [])
    .map((section) => ({
      heading: cleanText(section?.heading ?? ""),
      body: stripEditorialLabel(section?.body ?? ""),
    }))
    .filter((section) => cleanText(section.body));
  const summaryBullets = synthesizeEditorialBullets(page, 4);
  const deck = stripEditorialLabel(page.editorial?.deck ?? "");
  const narrativeBlocks = uniqueTextBlocks([
    deck,
    ...rawSections.map((section) => section.body),
    ...summaryBullets,
  ]).filter((item) => countChars(item) >= 18);
  const compactCardBlocks = narrativeBlocks.filter((item) => countChars(item) <= 70);
  const longNarrativeBlocks = narrativeBlocks.filter((item) => countChars(item) >= 95);
  const explicitBulletCount = uniqueTextBlocks((page.editorial?.bullets ?? []).map((item) => stripListMarker(item))).length;
  const explicitSectionCount = rawSections.length;
  const syntheticSectionCount = rawSections.length >= 2
    ? rawSections.length
    : (summaryBullets.length >= 2 && narrativeBlocks.length >= 2 ? 2 : rawSections.length);
  return {
    bulletCount: Math.max(explicitBulletCount, summaryBullets.length),
    explicitBulletCount,
    sectionCount: Math.max(explicitSectionCount, syntheticSectionCount),
    explicitSectionCount,
    deckChars: countChars(deck),
    compactCardBlocks,
    longNarrativeBlocks,
    summaryBullets,
    narrativeBlocks,
  };
}

function layoutFromArchetype({ page, archetype, normalized, index, variant }) {
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
  const deck = stripEditorialLabel(narrativeBlocks[0] ?? page.editorial.deck);
  const sectionA = stripEditorialLabel(narrativeBlocks[0] ?? "");
  const sectionB = stripEditorialLabel(narrativeBlocks[1] ?? bullets[0] ?? "");
  const sectionC = stripEditorialLabel(narrativeBlocks[2] ?? bullets[1] ?? "");
  const sparseNarrative = !sectionB && !sectionC && !bullets.length && Boolean(deck);
  const elements = [];
  const family = normalized.ratioInfo.family;
  const portraitVariant = getDeterministicPortraitVariant(index, variant, normalized.randomizeLayouts, 4);

  if (archetype === "portrait_large_type") {
    const portraitContent = getPortraitNarrativeContent(page);
    const leadBody = stripEditorialLabel(portraitContent.lead || sectionA || deck);
    const takeaway = stripEditorialLabel(portraitContent.takeaway || "");
    const summaryBullets = portraitContent.bullets;
    const sparsePortraitNarrative = countChars([deck, leadBody, takeaway, ...summaryBullets].join(" ")) <= 150
      && summaryBullets.length <= 1;
    const titleFont = fitTextSize({ text: title, widthPct: 82, heightPct: 11, min: 28, max: 38, role: "title", family });
    const deckFont = fitTextSize({ text: deck, widthPct: 80, heightPct: 8, min: 15, max: 18, role: "deck", family });
    const bodyFont = fitTextSize({ text: leadBody, widthPct: 80, heightPct: 8, min: 16, max: 19, role: "body", family });
    const takeawayFont = fitTextSize({ text: takeaway, widthPct: 80, heightPct: 7, min: 15, max: 18, role: "body", family });
    const bulletFont = fitTextSize({ text: summaryBullets.join(" "), widthPct: 78, heightPct: 10, min: 13, max: 16, role: "bullet", family });

    if (portraitVariant === 2 && hero) {
      const heroPanelY = sparsePortraitNarrative ? 16 : 18;
      const heroPanelH = sparsePortraitNarrative ? 36 : 30;
      const heroY = sparsePortraitNarrative ? 19 : 21;
      const heroH = sparsePortraitNarrative ? 30 : 24;
      elements.push(
        { kind: "text", role: "title", text: title, xPct: 8, yPct: 6, wPct: 80, hPct: 10, fontFace: theme.titleFont, fontSize: titleFont, color: theme.text, align: "left" },
        { kind: "shape", role: "heroPanel", shape: "roundRect", xPct: 6, yPct: heroPanelY, wPct: 88, hPct: heroPanelH, fill: theme.panel, line: theme.panel, radius: 24 },
        { kind: "image", role: "hero", source: hero.source, xPct: 10, yPct: heroY, wPct: 80, hPct: heroH, fit: "cover", cornerRadius: 20 },
        { kind: "text", role: "deck", text: deck, xPct: 10, yPct: sparsePortraitNarrative ? 57 : 53, wPct: 78, hPct: 7, fontFace: theme.bodyFont, fontSize: deckFont, color: theme.text, align: "left" },
        { kind: "text", role: "body", text: leadBody, xPct: 10, yPct: sparsePortraitNarrative ? 66 : 63, wPct: 80, hPct: 7, fontFace: theme.bodyFont, fontSize: bodyFont, color: theme.text, align: "left" },
      );
      summaryBullets.slice(0, 2).forEach((item, idx) => {
        elements.push({
          kind: "text",
          role: "bullet",
          text: `• ${item}`,
          xPct: 10,
          yPct: (sparsePortraitNarrative ? 75 : 72) + idx * 5.2,
          wPct: 78,
          hPct: 4.5,
          fontFace: theme.bodyFont,
          fontSize: bulletFont,
          color: theme.text,
          align: "left",
        });
      });
      return { elements };
    }

    if (portraitVariant === 3 && hero) {
      const heroPanelH = sparsePortraitNarrative ? 44 : 36;
      const heroH = sparsePortraitNarrative ? 38 : 30;
      elements.push(
        { kind: "text", role: "title", text: title, xPct: 8, yPct: 6, wPct: 46, hPct: 12, fontFace: theme.titleFont, fontSize: fitTextSize({ text: title, widthPct: 46, heightPct: 12, min: 24, max: 34, role: "title", family }), color: theme.text, align: "left" },
        { kind: "text", role: "deck", text: deck, xPct: 8, yPct: 20, wPct: 40, hPct: 10, fontFace: theme.bodyFont, fontSize: fitTextSize({ text: deck, widthPct: 40, heightPct: 10, min: 13, max: 16, role: "deck", family }), color: theme.text, align: "left" },
        { kind: "shape", role: "heroPanel", shape: "roundRect", xPct: 54, yPct: 8, wPct: 36, hPct: heroPanelH, fill: theme.panel, line: theme.panel, radius: 18 },
        { kind: "image", role: "hero", source: hero.source, xPct: 57, yPct: 11, wPct: 30, hPct: heroH, fit: "cover", cornerRadius: 16 },
        { kind: "text", role: "body", text: leadBody, xPct: 8, yPct: sparsePortraitNarrative ? 57 : 49, wPct: 82, hPct: 7, fontFace: theme.bodyFont, fontSize: bodyFont, color: theme.text, align: "left" },
      );
      if (takeaway) {
        elements.push({
          kind: "text",
          role: "body",
          text: takeaway,
          xPct: 8,
          yPct: sparsePortraitNarrative ? 66 : 58,
          wPct: 82,
          hPct: 6,
          fontFace: theme.bodyFont,
          fontSize: takeawayFont,
          color: theme.text,
          align: "left",
        });
      }
      summaryBullets.slice(0, 2).forEach((item, idx) => {
        elements.push({
          kind: "text",
          role: "bullet",
          text: `• ${item}`,
          xPct: 8,
          yPct: (sparsePortraitNarrative ? (takeaway ? 75 : 66) : (takeaway ? 67 : 58)) + idx * 5.4,
          wPct: 82,
          hPct: 4.5,
          fontFace: theme.bodyFont,
          fontSize: bulletFont,
          color: theme.text,
          align: "left",
        });
      });
      return { elements };
    }

    if (portraitVariant === 4 && hero) {
      const heroPanelY = sparsePortraitNarrative ? 46 : 52;
      const heroPanelH = sparsePortraitNarrative ? 36 : 28;
      const heroY = sparsePortraitNarrative ? 49 : 55;
      const heroH = sparsePortraitNarrative ? 30 : 22;
      elements.push(
        { kind: "text", role: "title", text: title, xPct: 8, yPct: 6, wPct: 80, hPct: 11, fontFace: theme.titleFont, fontSize: titleFont, color: theme.text, align: "left" },
        { kind: "text", role: "deck", text: deck, xPct: 8, yPct: 18, wPct: 78, hPct: 7, fontFace: theme.bodyFont, fontSize: deckFont, color: theme.text, align: "left" },
        { kind: "text", role: "body", text: leadBody, xPct: 10, yPct: 29, wPct: 80, hPct: 7, fontFace: theme.bodyFont, fontSize: bodyFont, color: theme.text, align: "left" },
      );
      summaryBullets.slice(0, 2).forEach((item, idx) => {
        elements.push({
          kind: "text",
          role: "bullet",
          text: `• ${item}`,
          xPct: 10,
          yPct: 38 + idx * 5.2,
          wPct: 78,
          hPct: 4.5,
          fontFace: theme.bodyFont,
          fontSize: bulletFont,
          color: theme.text,
          align: "left",
        });
      });
      elements.push(
        { kind: "shape", role: "heroPanel", shape: "roundRect", xPct: 6, yPct: heroPanelY, wPct: 88, hPct: heroPanelH, fill: theme.panel, line: theme.panel, radius: 22 },
        { kind: "image", role: "hero", source: hero.source, xPct: 10, yPct: heroY, wPct: 80, hPct: heroH, fit: "cover", cornerRadius: 18 },
      );
      return { elements };
    }

    const defaultHeroPanelY = 28.5;
    const defaultHeroPanelH = sparsePortraitNarrative ? 30 : 24;
    const defaultHeroY = 31.5;
    const defaultHeroH = sparsePortraitNarrative ? 24 : 18;
    elements.push(
      { kind: "text", role: "title", text: title, xPct: 8, yPct: 6, wPct: 80, hPct: 11, fontFace: theme.titleFont, fontSize: titleFont, color: theme.text, align: "left" },
      { kind: "text", role: "deck", text: deck, xPct: 8, yPct: 17.5, wPct: 78, hPct: 8, fontFace: theme.bodyFont, fontSize: deckFont, color: theme.text, align: "left" },
    );

    if (hero) {
      elements.push(
        { kind: "shape", role: "heroPanel", shape: "roundRect", xPct: 8, yPct: defaultHeroPanelY, wPct: 84, hPct: defaultHeroPanelH, fill: theme.panel, line: theme.panel, radius: 22 },
        { kind: "image", role: "hero", source: hero.source, xPct: 12, yPct: defaultHeroY, wPct: 76, hPct: defaultHeroH, fit: "cover", cornerRadius: 18 },
      );
    }

    const textStartY = hero ? (sparsePortraitNarrative ? 61.5 : 56.5) : 29;
    elements.push({
      kind: "text",
      role: "body",
      text: leadBody,
      xPct: 10,
      yPct: textStartY,
      wPct: 80,
      hPct: takeaway ? 6.4 : 7.5,
      fontFace: theme.bodyFont,
      fontSize: bodyFont,
      color: theme.text,
      align: "left",
    });

    if (takeaway) {
      elements.push({
        kind: "text",
        role: "body",
        text: takeaway,
        xPct: 10,
        yPct: textStartY + 8.2,
        wPct: 80,
        hPct: 6.2,
        fontFace: theme.bodyFont,
        fontSize: takeawayFont,
        color: theme.text,
        align: "left",
      });
    }

    summaryBullets.slice(0, 2).forEach((item, idx) => {
      elements.push({
        kind: "text",
        role: "bullet",
        text: `• ${item}`,
        xPct: 10,
        yPct: textStartY + (takeaway ? 16.2 : 9.4) + idx * 5.4,
        wPct: 78,
        hPct: 4.6,
        fontFace: theme.bodyFont,
        fontSize: bulletFont,
        color: theme.text,
        align: "left",
      });
    });

    return { elements };
  }

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
    if (family === "portrait_tall") {
      const summaryBullets = getEffectiveEditorialMetrics(page).summaryBullets
        .filter((item) => comparableText(item) !== comparableText(deck));
      const overviewBody = truncateBody(deck, 132);
      const titleFont = fitTextSize({ text: title, widthPct: 74, heightPct: 9, min: 28, max: 38, role: "title", family });
      const deckFont = fitTextSize({ text: deck, widthPct: 76, heightPct: 8, min: 13, max: 17, role: "deck", family });
      const overviewFont = fitTextSize({ text: overviewBody, widthPct: 30, heightPct: 10, min: 12, max: 15, role: "body", family });
      const bulletFont = fitTextSize({ text: summaryBullets.join(" "), widthPct: 30, heightPct: 18, min: 11, max: 14, role: "bullet", family });
      if (portraitVariant === 2) {
        elements.push(
          { kind: "text", role: "title", text: title, xPct: 8, yPct: 6, wPct: 74, hPct: 9, fontFace: theme.titleFont, fontSize: titleFont, color: theme.text, align: "left" },
          { kind: "text", role: "deck", text: deck, xPct: 8, yPct: 16, wPct: 76, hPct: 8, fontFace: theme.bodyFont, fontSize: deckFont, color: theme.text, align: "left" },
          { kind: "shape", role: "summaryPanel", shape: "roundRect", xPct: 8, yPct: 28, wPct: 84, hPct: 24, fill: "FFFFFF", line: theme.panel, radius: 20 },
          { kind: "text", role: "sectionHeading", text: "Context", xPct: 12, yPct: 31, wPct: 30, hPct: 4, fontFace: theme.bodyFont, fontSize: 14, bold: true, color: theme.accent, align: "left" },
          { kind: "text", role: "body", text: overviewBody, xPct: 12, yPct: 36, wPct: 68, hPct: 6, fontFace: theme.bodyFont, fontSize: fitTextSize({ text: overviewBody, widthPct: 68, heightPct: 6, min: 12, max: 15, role: "body", family }), color: theme.text, align: "left" },
        );
        summaryBullets.slice(0, 2).forEach((item, idx) => {
          elements.push({ kind: "text", role: "bullet", text: `• ${item}`, xPct: 12, yPct: 42.5 + idx * 5.4, wPct: 68, hPct: 4, fontFace: theme.bodyFont, fontSize: bulletFont, color: theme.text, align: "left" });
        });
        if (hero) {
          elements.push(
            { kind: "shape", role: "heroPanel", shape: "roundRect", xPct: 0, yPct: 57, wPct: 100, hPct: 43, fill: theme.panel, line: theme.panel, radius: 0 },
            { kind: "image", role: "hero", source: hero.source, xPct: 0, yPct: 58, wPct: 100, hPct: 42, fit: "cover", cornerRadius: 0 },
          );
        }
      } else {
        elements.push(
          { kind: "text", role: "title", text: title, xPct: 8, yPct: 6, wPct: 74, hPct: 9, fontFace: theme.titleFont, fontSize: titleFont, color: theme.text, align: "left" },
          { kind: "text", role: "deck", text: deck, xPct: 8, yPct: 16, wPct: 76, hPct: 8, fontFace: theme.bodyFont, fontSize: deckFont, color: theme.text, align: "left" },
        );
        if (hero) {
          elements.push(
            { kind: "shape", role: "heroPanel", shape: "roundRect", xPct: 8, yPct: 26, wPct: 84, hPct: 26, fill: theme.panel, line: theme.panel, radius: 20 },
            { kind: "image", role: "hero", source: hero.source, xPct: 12, yPct: 29, wPct: 76, hPct: 20, fit: "cover", cornerRadius: 16 },
          );
        }
        elements.push(
          { kind: "shape", role: "summaryPanel", shape: "roundRect", xPct: 8, yPct: 56, wPct: 84, hPct: 30, fill: "FFFFFF", line: theme.panel, radius: 20 },
          { kind: "text", role: "sectionHeading", text: "Overview", xPct: 12, yPct: 60, wPct: 30, hPct: 4, fontFace: theme.bodyFont, fontSize: 14, bold: true, color: theme.text, align: "left" },
          { kind: "text", role: "body", text: overviewBody, xPct: 12, yPct: 65, wPct: 30, hPct: 10, fontFace: theme.bodyFont, fontSize: overviewFont, color: theme.text, align: "left" },
          { kind: "text", role: "sectionHeading", text: "Key Points", xPct: 52, yPct: 60, wPct: 28, hPct: 4, fontFace: theme.bodyFont, fontSize: 14, bold: true, color: theme.text, align: "left" },
        );
        summaryBullets.slice(0, 4).forEach((item, idx) => {
          elements.push({ kind: "text", role: "bullet", text: `• ${item}`, xPct: 52, yPct: 65 + idx * 4.6, wPct: 30, hPct: 4, fontFace: theme.bodyFont, fontSize: bulletFont, color: theme.text, align: "left" });
        });
      }
      return { elements };
    }

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
      const coverBullets = synthesizeEditorialBullets(page, 4);
      const coverTitleFont = family === "portrait_tall"
        ? fitTextSize({ text: title, widthPct: 84, heightPct: 18, min: 24, max: 34, role: "title", family })
        : 30;
      const coverDeckFont = family === "portrait_tall"
        ? fitTextSize({ text: deck, widthPct: 76, heightPct: 6, min: 12, max: 14, role: "deck", family })
        : 13;
      const useSummaryCard = family === "portrait_tall" && coverBullets.length >= 2;
      if (hero) {
        elements.push(
          { kind: "shape", role: "heroPanel", shape: "roundRect", xPct: 8, yPct: useSummaryCard ? 28 : 30, wPct: 84, hPct: useSummaryCard ? 20 : 24, fill: theme.panel, line: theme.panel, radius: 24 },
          { kind: "image", role: "hero", source: hero.source, xPct: 12, yPct: useSummaryCard ? 31 : 33, wPct: 76, hPct: useSummaryCard ? 14 : 18, fit: "cover", cornerRadius: 18 },
        );
      }
      elements.push(
        { kind: "text", role: "title", text: title, xPct: 8, yPct: 4, wPct: 84, hPct: 18, fontFace: theme.titleFont, fontSize: coverTitleFont, color: theme.text, align: "center" },
        { kind: "text", role: "deck", text: deck, xPct: 12, yPct: 20, wPct: 76, hPct: 6, fontFace: theme.bodyFont, fontSize: coverDeckFont, color: theme.text, align: "center" },
      );
      if (useSummaryCard) {
        elements.push(
          { kind: "text", role: "sectionHeading", text: "Key Points", xPct: 12, yPct: 50, wPct: 30, hPct: 4, fontFace: theme.bodyFont, fontSize: 17, bold: true, color: theme.accent, align: "left" },
          { kind: "shape", role: "summaryPanel", shape: "roundRect", xPct: 8, yPct: 54, wPct: 84, hPct: 24, fill: "FFFFFF", line: theme.panel, radius: 20 },
        );
        coverBullets.forEach((item, idx) => {
          const coverBulletFont = fitTextSize({ text: item, widthPct: 72, heightPct: 3.5, min: 12, max: 15, role: "bullet", family });
          elements.push({
            kind: "text",
            role: "bullet",
            text: `✓ ${item}`,
            xPct: 12,
            yPct: 56.5 + idx * 4.6,
            wPct: 72,
            hPct: 4,
            fontFace: theme.bodyFont,
            fontSize: coverBulletFont,
            color: theme.text,
            align: "left",
          });
        });
      } else if (sectionB) {
        elements.push({ kind: "text", role: "body", text: sectionB, xPct: 12, yPct: 58, wPct: 68, hPct: 14, fontFace: theme.bodyFont, fontSize: 16, color: theme.text, align: "center" });
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
    if (family === "portrait_tall") {
      const synthesizedSummaryBullets = getEffectiveEditorialMetrics(page).summaryBullets;
      const titleFont = fitTextSize({ text: title, widthPct: 74, heightPct: 11, min: 28, max: 38, role: "title", family });
      const deckFont = fitTextSize({ text: deck, widthPct: 72, heightPct: 8, min: 14, max: 17, role: "deck", family });
      if (sparseNarrative) {
        elements.push(
          { kind: "text", role: "title", text: title, xPct: 8, yPct: 6, wPct: 78, hPct: 12, fontFace: theme.titleFont, fontSize: fitTextSize({ text: title, widthPct: 78, heightPct: 12, min: 30, max: 40, role: "title", family }), color: theme.text, align: "left" },
          { kind: "text", role: "body", text: deck, xPct: 8, yPct: 20, wPct: 78, hPct: 11, fontFace: theme.bodyFont, fontSize: fitTextSize({ text: deck, widthPct: 78, heightPct: 11, min: 14, max: 18, role: "body", family }), color: theme.text, align: "left" },
        );
        if (hero) {
          elements.push(
            { kind: "shape", role: "panel", shape: "roundRect", xPct: 6, yPct: 35, wPct: 88, hPct: 48, fill: theme.panel, line: theme.panel, radius: 24 },
            { kind: "image", role: "hero", source: hero.source, xPct: 10, yPct: 38, wPct: 80, hPct: 42, fit: "cover", cornerRadius: 20 },
          );
        }
        supporting.forEach((img, idx) => {
          elements.push({ kind: "image", role: "supporting", source: img.source, xPct: 10 + idx * 38, yPct: 86, wPct: 32, hPct: 10, fit: "cover", cornerRadius: 12 });
        });
        return { elements };
      }

      if (synthesizedSummaryBullets.length >= 2 && portraitVariant === 2) {
        const summaryBulletFont = fitTextSize({ text: synthesizedSummaryBullets.join(" "), widthPct: 72, heightPct: 12, min: 12, max: 14, role: "bullet", family });
        elements.push(
          { kind: "text", role: "title", text: title, xPct: 10, yPct: 6, wPct: 74, hPct: 10, fontFace: theme.titleFont, fontSize: titleFont, color: theme.text, align: "left" },
          { kind: "text", role: "deck", text: deck, xPct: 10, yPct: 17, wPct: 72, hPct: 7, fontFace: theme.bodyFont, fontSize: deckFont, color: theme.text, align: "left" },
          { kind: "shape", role: "summaryPanel", shape: "roundRect", xPct: 8, yPct: 28, wPct: 84, hPct: 22, fill: "FFFFFF", line: theme.panel, radius: 18 },
          { kind: "text", role: "sectionHeading", text: "Key Points", xPct: 12, yPct: 31, wPct: 30, hPct: 4, fontFace: theme.bodyFont, fontSize: 17, bold: true, color: theme.accent, align: "left" },
        );
        synthesizedSummaryBullets.slice(0, 3).forEach((item, idx) => {
          elements.push({
            kind: "text",
            role: "bullet",
            text: `✓ ${item}`,
            xPct: 12,
            yPct: 36 + idx * 4.3,
            wPct: 72,
            hPct: 3.8,
            fontFace: theme.bodyFont,
            fontSize: summaryBulletFont,
            color: theme.text,
            align: "left",
          });
        });
        if (hero) {
          elements.push(
            { kind: "shape", role: "panel", shape: "roundRect", xPct: 0, yPct: 56, wPct: 100, hPct: 44, fill: theme.panel, line: theme.panel, radius: 0 },
            { kind: "image", role: "hero", source: hero.source, xPct: 0, yPct: 57, wPct: 100, hPct: 43, fit: "cover", cornerRadius: 0 },
          );
        }
        return { elements };
      }

      if (synthesizedSummaryBullets.length >= 2 && portraitVariant === 3) {
        const summaryBulletFont = fitTextSize({ text: synthesizedSummaryBullets.join(" "), widthPct: 38, heightPct: 18, min: 11, max: 13, role: "bullet", family });
        elements.push(
          { kind: "text", role: "title", text: title, xPct: 8, yPct: 6, wPct: 42, hPct: 12, fontFace: theme.titleFont, fontSize: fitTextSize({ text: title, widthPct: 42, heightPct: 12, min: 24, max: 34, role: "title", family }), color: theme.text, align: "left" },
          { kind: "text", role: "deck", text: deck, xPct: 8, yPct: 19, wPct: 38, hPct: 12, fontFace: theme.bodyFont, fontSize: fitTextSize({ text: deck, widthPct: 38, heightPct: 12, min: 12, max: 15, role: "deck", family }), color: theme.text, align: "left" },
        );
        if (hero) {
          elements.push(
            { kind: "shape", role: "panel", shape: "roundRect", xPct: 54, yPct: 8, wPct: 36, hPct: 36, fill: theme.panel, line: theme.panel, radius: 18 },
            { kind: "image", role: "hero", source: hero.source, xPct: 57, yPct: 11, wPct: 30, hPct: 30, fit: "cover", cornerRadius: 16 },
          );
        }
        elements.push(
          { kind: "shape", role: "summaryPanel", shape: "roundRect", xPct: 8, yPct: 47, wPct: 84, hPct: 24, fill: "FFFFFF", line: theme.panel, radius: 18 },
          { kind: "text", role: "sectionHeading", text: "Key Points", xPct: 12, yPct: 50, wPct: 30, hPct: 4, fontFace: theme.bodyFont, fontSize: 16, bold: true, color: theme.accent, align: "left" },
        );
        synthesizedSummaryBullets.slice(0, 4).forEach((item, idx) => {
          const columnX = idx < 2 ? 12 : 52;
          const rowY = idx < 2 ? 55 + idx * 5 : 55 + (idx - 2) * 5;
          elements.push({
            kind: "text",
            role: "bullet",
            text: `• ${item}`,
            xPct: columnX,
            yPct: rowY,
            wPct: 28,
            hPct: 4,
            fontFace: theme.bodyFont,
            fontSize: summaryBulletFont,
            color: theme.text,
            align: "left",
          });
        });
        return { elements };
      }

      if (synthesizedSummaryBullets.length >= 2 && portraitVariant === 4) {
        const compactTitleFont = fitTextSize({ text: title, widthPct: 38, heightPct: 12, min: 24, max: 34, role: "title", family });
        const compactDeckFont = fitTextSize({ text: deck, widthPct: 34, heightPct: 10, min: 12, max: 15, role: "deck", family });
        const summaryBulletFont = fitTextSize({ text: synthesizedSummaryBullets.join(" "), widthPct: 28, heightPct: 17, min: 11, max: 13, role: "bullet", family });
        if (hero) {
          elements.push(
            { kind: "shape", role: "panel", shape: "roundRect", xPct: 8, yPct: 20, wPct: 38, hPct: 39, fill: theme.panel, line: theme.panel, radius: 18 },
            { kind: "image", role: "hero", source: hero.source, xPct: 11, yPct: 23, wPct: 32, hPct: 33, fit: "cover", cornerRadius: 16 },
          );
        }
        elements.push(
          { kind: "text", role: "title", text: title, xPct: 50, yPct: 7, wPct: 38, hPct: 12, fontFace: theme.titleFont, fontSize: compactTitleFont, color: theme.text, align: "left" },
          { kind: "text", role: "deck", text: deck, xPct: 50, yPct: 21, wPct: 34, hPct: 10, fontFace: theme.bodyFont, fontSize: compactDeckFont, color: theme.text, align: "left" },
          { kind: "shape", role: "summaryPanel", shape: "roundRect", xPct: 50, yPct: 35, wPct: 38, hPct: 24, fill: "FFFFFF", line: theme.panel, radius: 18 },
          { kind: "text", role: "sectionHeading", text: "Key Points", xPct: 54, yPct: 38, wPct: 26, hPct: 4, fontFace: theme.bodyFont, fontSize: 16, bold: true, color: theme.accent, align: "left" },
        );
        synthesizedSummaryBullets.slice(0, 3).forEach((item, idx) => {
          elements.push({
            kind: "text",
            role: "bullet",
            text: `• ${item}`,
            xPct: 54,
            yPct: 43 + idx * 4.9,
            wPct: 28,
            hPct: 4,
            fontFace: theme.bodyFont,
            fontSize: summaryBulletFont,
            color: theme.text,
            align: "left",
          });
        });
        if (sectionB) {
          elements.push({
            kind: "text",
            role: "body",
            text: sectionB,
            xPct: 8,
            yPct: 64,
            wPct: 80,
            hPct: 12,
            fontFace: theme.bodyFont,
            fontSize: fitTextSize({ text: sectionB, widthPct: 80, heightPct: 12, min: 12, max: 15, role: "body", family }),
            color: theme.text,
            align: "left",
          });
        }
        return { elements };
      }

      if (synthesizedSummaryBullets.length >= 2) {
        const summaryBulletFont = fitTextSize({ text: synthesizedSummaryBullets.join(" "), widthPct: 72, heightPct: 14, min: 12, max: 14, role: "bullet", family });
        elements.push(
          { kind: "text", role: "title", text: title, xPct: 10, yPct: 6, wPct: 74, hPct: 10, fontFace: theme.titleFont, fontSize: titleFont, color: theme.text, align: "left" },
          { kind: "text", role: "deck", text: deck, xPct: 10, yPct: 17, wPct: 72, hPct: 7, fontFace: theme.bodyFont, fontSize: deckFont, color: theme.text, align: "left" },
        );
        if (hero) {
          elements.push(
            { kind: "shape", role: "panel", shape: "roundRect", xPct: 8, yPct: 28, wPct: 84, hPct: 30, fill: theme.panel, line: theme.panel, radius: 22 },
            { kind: "image", role: "hero", source: hero.source, xPct: 12, yPct: 31, wPct: 76, hPct: 24, fit: "cover", cornerRadius: 18 },
          );
        }
        elements.push(
          { kind: "text", role: "sectionHeading", text: "Key Points", xPct: 10, yPct: 61, wPct: 30, hPct: 4, fontFace: theme.bodyFont, fontSize: 17, bold: true, color: theme.accent, align: "left" },
          { kind: "shape", role: "summaryPanel", shape: "roundRect", xPct: 8, yPct: 65, wPct: 84, hPct: 20, fill: "FFFFFF", line: theme.panel, radius: 18 },
        );
        synthesizedSummaryBullets.forEach((item, idx) => {
          elements.push({
            kind: "text",
            role: "bullet",
            text: `✓ ${item}`,
            xPct: 12,
            yPct: 68 + idx * 4.1,
            wPct: 72,
            hPct: 3.5,
            fontFace: theme.bodyFont,
            fontSize: summaryBulletFont,
            color: theme.text,
            align: "left",
          });
        });
        return { elements };
      }

      elements.push(
        { kind: "text", role: "title", text: title, xPct: 10, yPct: 6, wPct: 74, hPct: 11, fontFace: theme.titleFont, fontSize: titleFont, color: theme.text, align: "left" },
        { kind: "text", role: "deck", text: deck, xPct: 10, yPct: 18, wPct: 72, hPct: 8, fontFace: theme.bodyFont, fontSize: deckFont, color: theme.text, align: "left" },
      );
      if (hero) {
        elements.push(
          { kind: "shape", role: "panel", shape: "roundRect", xPct: 8, yPct: 31, wPct: 84, hPct: 36, fill: theme.panel, line: theme.panel, radius: 22 },
          { kind: "image", role: "hero", source: hero.source, xPct: 12, yPct: 34, wPct: 76, hPct: 30, fit: "cover", cornerRadius: 18 },
        );
      }
      if (sectionB) {
        elements.push({ kind: "text", role: "body", text: sectionB, xPct: 10, yPct: 70, wPct: 72, hPct: 14, fontFace: theme.bodyFont, fontSize: fitTextSize({ text: sectionB, widthPct: 72, heightPct: 14, min: 13, max: 16, role: "body", family }), color: theme.text, align: "left" });
      }
      supporting.forEach((img, idx) => {
        elements.push({ kind: "image", role: "supporting", source: img.source, xPct: 10 + idx * 38, yPct: 85, wPct: 32, hPct: 11, fit: "cover", cornerRadius: 12 });
      });
      return { elements };
    }

    if (family === "portrait_editorial") {
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
    if (family === "portrait_tall") {
      const titleFont = fitTextSize({ text: title, widthPct: 72, heightPct: 10, min: 26, max: 33, role: "title", family });
      const deckFont = fitTextSize({ text: deck, widthPct: 70, heightPct: 8, min: 13, max: 16, role: "deck", family });
      if (sparseNarrative) {
        elements.push(
          { kind: "text", role: "title", text: title, xPct: 8, yPct: 6, wPct: 76, hPct: 10, fontFace: theme.titleFont, fontSize: titleFont, color: theme.text, align: "left" },
          { kind: "text", role: "body", text: deck, xPct: 8, yPct: 18, wPct: 78, hPct: 10, fontFace: theme.bodyFont, fontSize: fitTextSize({ text: deck, widthPct: 78, heightPct: 10, min: 13, max: 16, role: "body", family }), color: theme.text, align: "left" },
        );
        if (hero) {
          elements.push(
            { kind: "shape", role: "heroPanel", shape: "roundRect", xPct: 6, yPct: 31, wPct: 88, hPct: 53, fill: theme.panel, line: theme.panel, radius: 24 },
            { kind: "image", role: "hero", source: hero.source, xPct: 10, yPct: 34, wPct: 80, hPct: 47, fit: "cover", cornerRadius: 20 },
          );
        }
        supporting.forEach((img, idx) => {
          elements.push({ kind: "image", role: "supporting", source: img.source, xPct: 10 + idx * 38, yPct: 86, wPct: 32, hPct: 10, fit: "cover", cornerRadius: 14 });
        });
        return { elements };
      }

      if (hero) {
        elements.push(
          { kind: "shape", role: "heroPanel", shape: "roundRect", xPct: 8, yPct: 6, wPct: 84, hPct: 34, fill: theme.panel, line: theme.panel, radius: 22 },
          { kind: "image", role: "hero", source: hero.source, xPct: 12, yPct: 9, wPct: 76, hPct: 28, fit: "cover", cornerRadius: 18 },
        );
      }
      elements.push(
        { kind: "text", role: "title", text: title, xPct: 10, yPct: 43, wPct: 72, hPct: 9, fontFace: theme.titleFont, fontSize: titleFont, color: theme.text, align: "left" },
        { kind: "text", role: "deck", text: deck, xPct: 10, yPct: 54, wPct: 70, hPct: 7, fontFace: theme.bodyFont, fontSize: deckFont, color: theme.text, align: "left" },
      );
      if (sectionB) {
        elements.push({ kind: "text", role: "body", text: sectionB, xPct: 10, yPct: 63, wPct: 72, hPct: 16, fontFace: theme.bodyFont, fontSize: fitTextSize({ text: sectionB, widthPct: 72, heightPct: 16, min: 12, max: 15, role: "body", family }), color: theme.text, align: "left" });
      }
      supporting.forEach((img, idx) => {
        elements.push({ kind: "image", role: "supporting", source: img.source, xPct: 10 + idx * 38, yPct: 82, wPct: 32, hPct: 12, fit: "cover", cornerRadius: 14 });
      });
      return { elements };
    }

    if (family === "portrait_editorial") {
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
    if (family === "portrait_tall") {
      const portraitRightBody = rightBody || bullets[0] || "";
      const titleFont = fitTextSize({ text: title, widthPct: 72, heightPct: 9, min: 26, max: 34, role: "title", family });
      const deckFont = fitTextSize({ text: deck, widthPct: 74, heightPct: 8, min: 13, max: 16, role: "deck", family });
      const leftFont = fitTextSize({ text: leftBody, widthPct: 68, heightPct: 7, min: 11, max: 13, role: "body", family });
      const rightFont = fitTextSize({ text: portraitRightBody, widthPct: 68, heightPct: 7, min: 11, max: 13, role: "body", family });
      if (portraitVariant === 2 && hero) {
        elements.push(
          { kind: "text", role: "title", text: title, xPct: 8, yPct: 6, wPct: 72, hPct: 9, fontFace: theme.titleFont, fontSize: titleFont, color: theme.text, align: "left" },
          { kind: "text", role: "deck", text: deck, xPct: 8, yPct: 16, wPct: 74, hPct: 8, fontFace: theme.bodyFont, fontSize: deckFont, color: theme.text, align: "left" },
          { kind: "shape", role: "heroPanel", shape: "roundRect", xPct: 8, yPct: 27, wPct: 84, hPct: 22, fill: theme.panel, line: theme.panel, radius: 18 },
          { kind: "image", role: "hero", source: hero.source, xPct: 12, yPct: 30, wPct: 76, hPct: 16, fit: "cover", cornerRadius: 14 },
          { kind: "shape", role: "panelLeft", shape: "roundRect", xPct: 8, yPct: 53, wPct: 40, hPct: 20, fill: theme.panel, line: theme.panel, radius: 18 },
          { kind: "text", role: "sectionHeading", text: "Overview", xPct: 12, yPct: 56, wPct: 26, hPct: 4, fontFace: theme.bodyFont, fontSize: 14, bold: true, color: theme.text, align: "left" },
          { kind: "text", role: "bodyLeft", text: leftBody, xPct: 12, yPct: 61, wPct: 32, hPct: 9, fontFace: theme.bodyFont, fontSize: leftFont, color: theme.text, align: "left" },
          { kind: "shape", role: "panelRight", shape: "roundRect", xPct: 52, yPct: 53, wPct: 40, hPct: 20, fill: "FFFFFF", line: theme.panel, radius: 18 },
          { kind: "text", role: "sectionHeading", text: "Details", xPct: 56, yPct: 56, wPct: 26, hPct: 4, fontFace: theme.bodyFont, fontSize: 14, bold: true, color: theme.text, align: "left" },
          { kind: "text", role: "bodyRight", text: portraitRightBody, xPct: 56, yPct: 61, wPct: 32, hPct: 9, fontFace: theme.bodyFont, fontSize: rightFont, color: theme.text, align: "left" },
        );
      } else {
        elements.push(
          { kind: "text", role: "title", text: title, xPct: 8, yPct: 6, wPct: 72, hPct: 9, fontFace: theme.titleFont, fontSize: titleFont, color: theme.text, align: "left" },
          { kind: "text", role: "deck", text: deck, xPct: 8, yPct: 16, wPct: 74, hPct: 8, fontFace: theme.bodyFont, fontSize: deckFont, color: theme.text, align: "left" },
          { kind: "shape", role: "panelLeft", shape: "roundRect", xPct: 8, yPct: 28, wPct: 84, hPct: 17, fill: theme.panel, line: theme.panel, radius: 18 },
          { kind: "text", role: "sectionHeading", text: "Overview", xPct: 12, yPct: 31, wPct: 26, hPct: 4, fontFace: theme.bodyFont, fontSize: 14, bold: true, color: theme.text, align: "left" },
          { kind: "text", role: "bodyLeft", text: leftBody, xPct: 12, yPct: 36, wPct: 68, hPct: 7, fontFace: theme.bodyFont, fontSize: leftFont, color: theme.text, align: "left" },
          { kind: "shape", role: "panelRight", shape: "roundRect", xPct: 8, yPct: 49, wPct: 84, hPct: 17, fill: "FFFFFF", line: theme.panel, radius: 18 },
          { kind: "text", role: "sectionHeading", text: "Details", xPct: 12, yPct: 52, wPct: 26, hPct: 4, fontFace: theme.bodyFont, fontSize: 14, bold: true, color: theme.text, align: "left" },
          { kind: "text", role: "bodyRight", text: portraitRightBody, xPct: 12, yPct: 57, wPct: 68, hPct: 7, fontFace: theme.bodyFont, fontSize: rightFont, color: theme.text, align: "left" },
        );
        if (hero) {
          elements.push(
            { kind: "shape", role: "heroPanel", shape: "roundRect", xPct: 8, yPct: 70, wPct: 84, hPct: 21, fill: theme.panel, line: theme.panel, radius: 18 },
            { kind: "image", role: "hero", source: hero.source, xPct: 12, yPct: 73, wPct: 76, hPct: 15, fit: "cover", cornerRadius: 14 },
          );
        }
      }
      return { elements };
    }

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
    const cardItems = uniqueTextBlocks([sectionA, sectionB, sectionC, ...bullets]).slice(0, 3);
    if (family === "portrait_tall" || family === "portrait_editorial") {
      const titleFont = fitTextSize({ text: title, widthPct: 40, heightPct: 11, min: 26, max: 34, role: "title", family });
      const deckFont = fitTextSize({ text: deck, widthPct: 38, heightPct: 14, min: 13, max: 16, role: "deck", family });
      elements.push(
        { kind: "text", role: "title", text: title, xPct: 8, yPct: 8, wPct: 40, hPct: 11, fontFace: theme.titleFont, fontSize: titleFont, color: theme.text, align: "left" },
        { kind: "text", role: "deck", text: deck, xPct: 8, yPct: 20, wPct: 38, hPct: 14, fontFace: theme.bodyFont, fontSize: deckFont, color: theme.text, align: "left" },
        ...(hero ? [
          { kind: "shape", role: "heroPanel", shape: "roundRect", xPct: 54, yPct: 8, wPct: 36, hPct: 34, fill: theme.panel, line: theme.panel, radius: 18 },
          { kind: "image", role: "hero", source: hero.source, xPct: 57, yPct: 11, wPct: 30, hPct: 28, fit: "cover", cornerRadius: 14 },
        ] : []),
      );
      cardItems.forEach((item, idx) => {
        const x = 8 + (idx % 2) * 44;
        const y = 46 + Math.floor(idx / 2) * 14;
        const cardWidth = idx % 2 === 0 ? 38 : 38;
        const cardHeight = 10;
        elements.push(
          { kind: "shape", role: "statCard", shape: "roundRect", xPct: x, yPct: y, wPct: cardWidth, hPct: cardHeight, fill: theme.panel, line: theme.panel, radius: 14 },
          {
            kind: "text",
            role: "statBody",
            text: item,
            xPct: x + 2,
            yPct: y + 2,
            wPct: cardWidth - 4,
            hPct: cardHeight - 3,
            fontFace: theme.bodyFont,
            fontSize: fitTextSize({ text: item, widthPct: cardWidth - 4, heightPct: cardHeight - 3, min: 12, max: 15, role: "body", family }),
            color: theme.text,
            align: "left",
          },
        );
      });
      return { elements };
    }

    elements.push(
      { kind: "text", role: "title", text: title, xPct: 8, yPct: 8, wPct: 42, hPct: 10, fontFace: theme.titleFont, fontSize: 28, color: theme.text, align: "left" },
      { kind: "text", role: "deck", text: deck, xPct: 8, yPct: 20, wPct: 36, hPct: 12, fontFace: theme.bodyFont, fontSize: 12, color: theme.text, align: "left" },
      ...(hero ? [
        { kind: "shape", role: "heroPanel", shape: "roundRect", xPct: 54, yPct: 8, wPct: 36, hPct: 34, fill: theme.panel, line: theme.panel, radius: 18 },
        { kind: "image", role: "hero", source: hero.source, xPct: 57, yPct: 11, wPct: 30, hPct: 28, fit: "cover", cornerRadius: 14 },
      ] : []),
    );
    cardItems.forEach((item, idx) => {
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
