type CanvasRatio = "16:9" | "9:16" | "4:3" | "3:4" | "4:5" | "5:4" | "1:1";

export type ModernEditorialSourcePage = {
  pageNumber: number;
  titleHint: string;
  text: string;
};

export type ModernEditorialPreflightPage = {
  pageNumber: number;
  titleHint: string;
  compiledText: string;
  pageIntentHint: string;
  preferredArchetype: string;
  forceArchetype: string | null;
  archetypeMode: "forced" | "guided";
  recommendedImageCount: number;
  maxImagesOverride: number;
  warnings: string[];
  structure: {
    paragraphCount: number;
    bulletCount: number;
    workflowStepCount: number;
    timelinePhaseCount: number;
    sectionCount: number;
  };
};

export type ModernEditorialCompilation = {
  designStyle: string;
  density: "balanced";
  randomizeLayouts: false;
  seed: string;
  theme: {
    paletteMode: string;
    roundedCorners: boolean;
  };
  renderOptions: {
    pptxFileName: string;
    jsonFileName: string;
    mdFileName: string;
    pdfFileName: string;
    pdfEngine: "libreoffice";
  };
  pages: ModernEditorialPreflightPage[];
  warnings: string[];
  plannedImageCount: number;
};

type RatioFamily = "landscape_wide" | "portrait_tall" | "portrait_editorial" | "report_compact";

type PageAnalysis = {
  title: string;
  paragraphs: string[];
  overview: string;
  bullets: string[];
  explicitBulletCount: number;
  workflowSteps: string[];
  explicitWorkflowStepCount: number;
  timelinePhases: Array<{ heading: string; body: string }>;
  explicitTimelinePhaseCount: number;
  narrativeSections: Array<{ heading: string; body: string }>;
  explicitSectionCount: number;
  hasSummaryLanguage: boolean;
  hasCautionLanguage: boolean;
};

const RATIO_FAMILY: Record<CanvasRatio, RatioFamily> = {
  "16:9": "landscape_wide",
  "9:16": "portrait_tall",
  "4:3": "landscape_wide",
  "3:4": "portrait_editorial",
  "4:5": "portrait_editorial",
  "5:4": "report_compact",
  "1:1": "report_compact",
};

function cleanText(text: string): string {
  return String(text ?? "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slugifySeed(input: string): string {
  return String(input ?? "presentation")
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "presentation";
}

function truncateText(text: string, max = 180): string {
  const compact = cleanText(text).replace(/\s+/g, " ").trim();
  if (compact.length <= max) {
    return compact;
  }
  const short = compact.slice(0, Math.max(0, max - 3)).replace(/\s+\S*$/, "");
  return `${short}...`;
}

function splitParagraphs(text: string): string[] {
  return cleanText(text)
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractTitle(rawTitleHint: string, paragraphs: string[]): string {
  const hint = cleanText(rawTitleHint);
  if (hint) {
    return truncateText(hint, 72);
  }
  return truncateText(paragraphs[0] ?? "Untitled", 72);
}

function stripTitleParagraph(paragraphs: string[], title: string): string[] {
  if (paragraphs.length === 0) {
    return [];
  }
  const normalizedTitle = cleanText(title).toLowerCase();
  const first = cleanText(paragraphs[0] ?? "").toLowerCase();
  return first === normalizedTitle ? paragraphs.slice(1) : paragraphs;
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const normalized = comparableText(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(cleanText(item).replace(/\s+/g, " ").trim());
  }
  return output;
}


function extractBullets(text: string): string[] {
  const lines = cleanText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return dedupeStrings(
    lines
      .filter((line) => /^(?:[-•*]\s|[0-9]+[).\s-]+)/.test(line))
      .map((line) => line.replace(/^(?:[-•*]\s|[0-9]+[).\s-]+)\s*/, "").trim()),
  ).slice(0, 6);
}

function extractOrderedSteps(text: string): string[] {
  const lines = cleanText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return dedupeStrings(
    lines
      .filter((line) => /^[0-9]+[).\s-]+/.test(line))
      .map((line) => line.replace(/^[0-9]+[).\s-]+\s*/, "").trim()),
  ).slice(0, 6);
}

function splitSentenceCandidates(text: string): string[] {
  const compact = cleanText(text)
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) {
    return [];
  }
  return compact
    .split(/(?<=[.!?])\s+|(?:\s+[0-9]+[).\s-]+)|\s*[;•]\s*/g)
    .map((part) => part.trim())
    .filter((part) => part.length >= 18);
}

function stripEditorialLabel(text: string): string {
  return cleanText(text)
    .replace(/^(?:overview|context|considerations|recommended action|details|summary|key points)\s*:\s*/i, "")
    .trim();
}

function synthesizeBullets(paragraphs: string[], preferredCount = 4): string[] {
  const sentenceCandidates = dedupeStrings(paragraphs.flatMap((paragraph) => splitSentenceCandidates(paragraph)));
  if (sentenceCandidates.length > 0) {
    return sentenceCandidates.slice(0, preferredCount).map((item) => truncateText(item, 96));
  }
  return dedupeStrings(paragraphs).slice(0, preferredCount).map((item) => truncateText(item, 96));
}

function extractLabeledSections(paragraphs: string[]): Array<{ heading: string; body: string }> {
  return paragraphs
    .map((paragraph) => {
      const match = paragraph.match(/^([^\n:]{3,60}):\s*([\s\S]+)$/);
      if (!match) {
        return null;
      }
      return {
        heading: truncateText(match[1] ?? "", 40),
        body: truncateText(match[2] ?? "", 160),
      };
    })
    .filter((section): section is { heading: string; body: string } => Boolean(section && section.heading && section.body));
}

function extractTimelinePhases(paragraphs: string[], bullets: string[]): Array<{ heading: string; body: string }> {
  const labeled = extractLabeledSections(paragraphs)
    .filter((section) => /planning|development|evaluation|review|phase|planning|วางแผน|พัฒนา|ประเมิน|ทบทวน/i.test(section.heading));
  if (labeled.length >= 3) {
    return labeled.slice(0, 4);
  }
  return bullets.slice(0, 4).map((item, index) => ({
    heading: ["Planning", "Development", "Evaluation", "Review"][index] ?? `Phase ${index + 1}`,
    body: truncateText(item, 120),
  }));
}

function extractWorkflowSteps(paragraphs: string[], bullets: string[]): string[] {
  if (bullets.length >= 3) {
    return bullets.slice(0, 6);
  }
  return synthesizeBullets(paragraphs, 4);
}

function synthesizeDeckCoverPage(params: {
  topic: string;
  pages: ModernEditorialSourcePage[];
}): ModernEditorialSourcePage {
  const analyses = params.pages.map((page) => analyzePage(page));
  const titleHint = cleanText(params.pages[0]?.titleHint || params.topic || "Untitled");
  const overview = analyses
    .map((analysis) => cleanText(analysis.overview))
    .find((item) => item.length >= 40)
    ?? cleanText(params.pages[0]?.text ?? params.topic);
  const highlightPool = dedupeStrings([
    ...analyses.flatMap((analysis) => analysis.explicitBulletCount > 0
      ? analysis.bullets
      : synthesizeBullets(analysis.paragraphs, 2)),
    ...analyses.flatMap((analysis) => analysis.narrativeSections.map((section) => section.body)),
  ])
    .filter((item) => comparableText(item) !== comparableText(overview))
    .slice(0, 4)
    .map((item) => truncateText(item, 96));

  const lines = [
    titleHint || truncateText(params.topic || "Untitled", 72),
    "",
    truncateText(overview, 200),
  ];

  if (highlightPool.length > 0) {
    lines.push("", "Key Points:", ...highlightPool.map((item) => `• ${item}`));
  }

  return {
    pageNumber: 1,
    titleHint: titleHint || truncateText(params.topic || "Untitled", 72),
    text: lines.join("\n"),
  };
}

function analyzePage(page: ModernEditorialSourcePage): PageAnalysis {
  const rawParagraphs = splitParagraphs(page.text);
  const title = extractTitle(page.titleHint, rawParagraphs);
  const paragraphs = stripTitleParagraph(rawParagraphs, title);
  const explicitBullets = extractBullets(page.text);
  const explicitOrderedSteps = extractOrderedSteps(page.text);
  const narrativeSections = extractLabeledSections(paragraphs);
  const explicitTimelinePhases = extractTimelinePhases(paragraphs, explicitBullets);
  const explicitWorkflowSteps = extractWorkflowSteps(paragraphs, explicitBullets);
  const overviewSource = narrativeSections.find((section) => /overview|summary|context|background|ภาพรวม|สรุป/i.test(section.heading))?.body
    ?? paragraphs.find((paragraph) => paragraph.length >= 24)
    ?? page.text;
  const hasSummaryLanguage = /overview|key points|summary|ภาพรวม|สรุป|ประเด็นสำคัญ/i.test(page.text);
  const hasCautionLanguage = /warning|caution|consider|ข้อควรระวัง|ข้อพิจารณา|ปรึกษาแพทย์|ผู้เชี่ยวชาญ/i.test(page.text);
  const bullets = explicitBullets.length > 0 ? explicitBullets : synthesizeBullets(paragraphs, 4);

  return {
    title,
    paragraphs,
    overview: truncateText(stripEditorialLabel(overviewSource), 180),
    bullets,
    explicitBulletCount: explicitBullets.length,
    workflowSteps: explicitWorkflowSteps,
    explicitWorkflowStepCount: explicitOrderedSteps.length >= 3 ? explicitOrderedSteps.length : 0,
    timelinePhases: explicitTimelinePhases,
    explicitTimelinePhaseCount: narrativeSections
      .filter((section) => /planning|development|evaluation|review|phase|วางแผน|พัฒนา|ประเมิน|ทบทวน/i.test(section.heading)).length,
    narrativeSections,
    explicitSectionCount: narrativeSections.length,
    hasSummaryLanguage,
    hasCautionLanguage,
  };
}

function inferIntent(params: {
  pageIndex: number;
  totalPages: number;
  analysis: PageAnalysis;
  sourceText: string;
}): string {
  if (params.pageIndex === 0) {
    return "editorial_cover";
  }
  if (params.analysis.explicitTimelinePhaseCount >= 3) {
    return "project_timeline";
  }
  if (params.analysis.explicitWorkflowStepCount >= 3) {
    return "workflow_infographic";
  }
  if (params.analysis.hasCautionLanguage) {
    return "case_study";
  }
  if (
    params.analysis.hasSummaryLanguage
    || params.analysis.explicitBulletCount >= 4
    || params.analysis.explicitSectionCount >= 2
  ) {
    return params.pageIndex === params.totalPages - 1 ? "executive_summary" : "strategy_overview";
  }
  if (/ทารก|นอน|เด็ก|แม่|ลูก|sleep|baby|care/i.test(params.sourceText)) {
    if (params.analysis.explicitBulletCount >= 2 || params.analysis.explicitWorkflowStepCount >= 2) {
      return "healthcare_steps";
    }
    return "strategy_overview";
  }
  if (params.pageIndex === params.totalPages - 1) {
    return "executive_summary";
  }
  return params.pageIndex % 2 === 0 ? "report_page" : "product_summary";
}

function choosePreferredArchetype(params: {
  family: RatioFamily;
  intent: string;
  pageIndex: number;
  totalPages: number;
  analysis: PageAnalysis;
}): string {
  if (params.pageIndex === 0) {
    return "editorial_cover_split";
  }
  switch (params.intent) {
    case "project_timeline":
      return "project_timeline_bands";
    case "workflow_infographic":
    case "healthcare_steps":
      return params.family === "landscape_wide" || params.family === "report_compact"
        ? "two_column_editorial"
        : (
          (params.analysis.explicitWorkflowStepCount >= 3 || params.analysis.explicitBulletCount >= 3)
          && params.analysis.overview.length <= 120
        )
          ? "vertical_workflow_steps"
          : "title_hero_split";
    case "strategy_overview":
    case "executive_summary":
      if (params.family === "portrait_tall") {
        const compactOverview = params.analysis.overview.length <= 90;
        const strongExplicitStructure = params.analysis.explicitSectionCount >= 2
          || (params.analysis.explicitBulletCount >= 4 && compactOverview);
        if (strongExplicitStructure && compactOverview) {
          return "executive_summary_dashboard";
        }
        return "portrait_large_type";
      }
      if (
        (params.family === "landscape_wide" || params.family === "report_compact")
        || (params.family === "portrait_editorial" && params.analysis.bullets.length >= 3)
      ) {
        return "executive_summary_dashboard";
      }
      return "title_hero_split";
    case "product_summary":
      return params.family === "portrait_tall"
        ? (params.analysis.bullets.length >= 3 ? "executive_summary_dashboard" : "portrait_large_type")
        : "product_overview_report";
    case "report_page":
      return params.family === "portrait_tall"
        ? (params.analysis.explicitSectionCount >= 2
          ? "two_column_editorial"
          : (params.analysis.bullets.length >= 3 ? "executive_summary_dashboard" : "portrait_large_type"))
        : "two_column_editorial";
    case "case_study":
    default:
      return params.family === "portrait_tall"
        ? "portrait_large_type"
        : "stat_card_with_image";
  }
}

function shouldForceArchetype(params: {
  pageIndex: number;
  totalPages: number;
  intent: string;
  family: RatioFamily;
  analysis: PageAnalysis;
}): boolean {
  if (params.pageIndex === 0) {
    return true;
  }
  if (params.intent === "project_timeline") {
    return true;
  }
  if (
    (params.intent === "workflow_infographic" || params.intent === "healthcare_steps")
    && params.analysis.explicitWorkflowStepCount >= 4
  ) {
    return true;
  }
  if (
    params.pageIndex === params.totalPages - 1
    && (params.family === "landscape_wide" || params.family === "report_compact")
    && (params.analysis.explicitBulletCount >= 2 || params.analysis.explicitSectionCount >= 2)
  ) {
    return true;
  }
  return false;
}

function recommendedImageCount(params: {
  archetype: string;
  family: RatioFamily;
  intent: string;
  analysis: PageAnalysis;
}): number {
  const { archetype, family, intent, analysis } = params;
  const isSparseNarrative = (
    analysis.explicitBulletCount <= 1
    && analysis.explicitSectionCount <= 1
    && analysis.explicitWorkflowStepCount === 0
    && analysis.explicitTimelinePhaseCount === 0
  );

  if (family === "portrait_tall") {
    if (intent === "editorial_cover") {
      return 1;
    }
    if (
      isSparseNarrative
      && (
        archetype === "portrait_large_type"
        || archetype === "title_hero_split"
        || archetype === "two_column_editorial"
        || archetype === "executive_summary_dashboard"
        || archetype === "product_overview_report"
      )
    ) {
      return 1;
    }
    if (
      archetype === "stat_card_with_image" && analysis.explicitBulletCount < 2 && analysis.explicitSectionCount < 2
    ) {
      return 1;
    }
  }

  switch (archetype) {
    case "portrait_large_type":
      return 1;
    case "editorial_cover_split":
      return family === "portrait_tall" || family === "portrait_editorial" ? 1 : 3;
    case "two_column_editorial":
      return family === "portrait_tall" && isSparseNarrative ? 1 : 3;
    case "feature_story_panels":
      return family === "portrait_tall" && isSparseNarrative ? 1 : 3;
    case "title_hero_split":
      return family === "portrait_tall" ? 1 : 2;
    case "stat_card_with_image":
      return family === "portrait_tall" ? 1 : 2;
    case "executive_summary_dashboard":
    case "product_overview_report":
      return 1;
    case "vertical_workflow_steps":
    case "project_timeline_bands":
      return 1;
    default:
      return family === "portrait_tall" ? 1 : 2;
  }
}

function buildCompiledText(intent: string, analysis: PageAnalysis, family: RatioFamily): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  const lines: string[] = [analysis.title];
  const portraitTall = family === "portrait_tall";
  const bulletLimit = portraitTall
    ? (intent === "editorial_cover" ? 4 : intent === "case_study" ? 2 : 3)
    : 4;
  const bullets = analysis.bullets
    .slice(0, bulletLimit)
    .map((item) => truncateText(stripEditorialLabel(item), portraitTall ? 72 : 96));
  const overview = truncateText(stripEditorialLabel(analysis.overview), portraitTall ? 110 : 180);

  if (intent === "editorial_cover") {
    lines.push("", truncateText(analysis.overview, portraitTall ? 150 : 200));
    if (bullets.length >= 2) {
      lines.push("", "Key Points:", ...bullets.slice(0, portraitTall ? 4 : 4).map((item) => `• ${item}`));
    }
    return { text: lines.join("\n"), warnings };
  }

  if (intent === "project_timeline") {
    lines.push("", portraitTall ? overview : `Overview: ${overview}`);
    const phases = analysis.timelinePhases.slice(0, 4);
    if (phases.length < 3) {
      warnings.push("Synthesized timeline phases from prose because the page did not contain enough explicit phases.");
    }
    for (const phase of phases) {
      lines.push("", `${phase.heading}: ${phase.body}`);
    }
    return { text: lines.join("\n"), warnings };
  }

  if (intent === "workflow_infographic" || intent === "healthcare_steps") {
    lines.push("", portraitTall ? overview : `Overview: ${overview}`);
    const steps = analysis.workflowSteps.slice(0, 4);
    if (steps.length < 3) {
      warnings.push("Synthesized workflow steps from prose because the page did not contain enough explicit steps.");
    }
    lines.push("", ...steps.map((item, index) => `${index + 1}. ${truncateText(item, 96)}`));
    return { text: lines.join("\n"), warnings };
  }

  if (intent === "strategy_overview" || intent === "executive_summary" || intent === "product_summary" || intent === "report_page") {
    if (portraitTall) {
      const portraitOverview = truncateText(analysis.overview, 104);
      const portraitSupport = analysis.paragraphs
        .map((paragraph) => stripEditorialLabel(paragraph))
        .find((paragraph) => comparableText(paragraph) !== comparableText(analysis.overview))
        ?? analysis.narrativeSections[0]?.body
        ?? "";
      const portraitSupportText = truncateText(stripEditorialLabel(portraitSupport), 84);
      const portraitBullets = (analysis.explicitBulletCount > 0
        ? analysis.bullets
        : dedupePortraitBullets([
            truncateText(portraitSupport, 72),
          ]))
        .filter((item) => comparableText(item) !== comparableText(portraitOverview))
        .filter((item) => comparableText(item) !== comparableText(portraitSupportText))
        .slice(0, analysis.explicitBulletCount > 0 ? 3 : 1)
        .map((item) => truncateText(item, 72));

      lines.push("", portraitOverview);
      if (portraitSupportText && comparableText(portraitSupportText) !== comparableText(portraitOverview)) {
        lines.push("", portraitSupportText);
      }
      if (portraitBullets.length > 0) {
        if (analysis.explicitBulletCount === 0) {
          warnings.push("Condensed key points from prose for portrait layout because the page did not contain explicit bullets.");
        }
        lines.push("", ...portraitBullets.map((item) => `• ${item}`));
      }
      return { text: lines.join("\n"), warnings };
    }
    lines.push("", `Overview: ${overview}`);
    if (analysis.explicitBulletCount === 0) {
      warnings.push("Synthesized key points from prose because the page did not contain explicit bullets.");
    }
    lines.push("", "Key Points:", ...bullets.map((item) => `• ${item}`));
    if (!portraitTall && analysis.narrativeSections.length > 0) {
      const extraSection = analysis.narrativeSections.find((section) => !/overview|summary|key points/i.test(section.heading));
      if (extraSection?.body) {
        lines.push("", `${extraSection.heading}: ${extraSection.body}`);
      }
    }
    return { text: lines.join("\n"), warnings };
  }

  if (portraitTall) {
    const portraitOverview = truncateText(analysis.overview, 104);
    const recommendation = stripEditorialLabel(analysis.narrativeSections[0]?.body ?? bullets[0] ?? analysis.overview);
    const portraitBullets = (analysis.explicitBulletCount > 0
      ? analysis.bullets
      : dedupePortraitBullets([
          truncateText(recommendation, 72),
        ]))
      .filter((item) => comparableText(item) !== comparableText(portraitOverview))
      .slice(0, analysis.explicitBulletCount > 0 ? 2 : 1)
      .map((item) => truncateText(item, 72));
    lines.push("", portraitOverview);
    if (portraitBullets.length > 0) {
      lines.push("", ...portraitBullets.map((item) => `• ${item}`));
    }
    const recommendationText = truncateText(recommendation, 84);
    if (recommendationText && comparableText(recommendationText) !== comparableText(portraitOverview)) {
      lines.push("", recommendationText);
    }
    return { text: lines.join("\n"), warnings };
  }

  lines.push("", `Context: ${overview}`);
  if (bullets.length > 0) {
    lines.push("", "Considerations:", ...bullets.slice(0, 3).map((item) => `• ${item}`));
  }
    const recommendation = stripEditorialLabel(analysis.narrativeSections[0]?.body ?? bullets[0] ?? analysis.overview);
  lines.push("", `Recommended Action: ${truncateText(recommendation, 140)}`);
  return { text: lines.join("\n"), warnings };
}

function dedupePortraitBullets(items: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const cleaned = truncateText(item, 60);
    const key = comparableText(cleaned);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(cleaned);
  }
  return output;
}

function comparableText(text: string): string {
  return cleanText(text)
    .replace(/\.\.\.$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function estimateIdealPageCount(params: {
  pages: ModernEditorialSourcePage[];
  family: RatioFamily;
  maxPages: number;
}): number {
  const totalCharacters = params.pages.reduce((sum, page) => sum + cleanText(`${page.titleHint}\n${page.text}`).length, 0);
  const targetCharsPerPage = params.family === "portrait_tall"
    ? 520
    : params.family === "portrait_editorial"
      ? 620
      : params.family === "report_compact"
        ? 700
        : 780;
  const estimated = Math.max(1, Math.ceil(totalCharacters / targetCharsPerPage));
  return Math.max(1, Math.min(params.maxPages, params.pages.length, estimated));
}

function isLowDensityMergeCandidate(page: ModernEditorialSourcePage, family: RatioFamily): boolean {
  const analysis = analyzePage(page);
  const textLength = cleanText(`${page.titleHint}\n${page.text}`).length;
  const densityThreshold = family === "portrait_tall"
    ? 150
    : family === "portrait_editorial"
      ? 180
      : 220;
  const hasStrongStructure = (
    analysis.explicitBulletCount >= 2
    || analysis.explicitWorkflowStepCount >= 2
    || analysis.explicitTimelinePhaseCount >= 2
    || analysis.explicitSectionCount >= 2
  );
  return !hasStrongStructure && textLength <= densityThreshold;
}

function condenseSourcePages(params: {
  pages: ModernEditorialSourcePage[];
  family: RatioFamily;
  maxPages: number;
}): { pages: ModernEditorialSourcePage[]; mergedCount: number } {
  const targetPageCount = estimateIdealPageCount(params);
  const output = params.pages.map((page, index) => ({
    ...page,
    pageNumber: index + 1,
  }));
  let mergedCount = 0;

  while (output.length > targetPageCount) {
    let bestIndex = output.length > 2 ? 2 : 1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let index = output.length > 2 ? 2 : 1; index < output.length; index += 1) {
      const prev = output[index - 1];
      const current = output[index];
      if (!isLowDensityMergeCandidate(prev, params.family) || !isLowDensityMergeCandidate(current, params.family)) {
        continue;
      }
      const combinedLength = cleanText(`${prev.titleHint}\n${prev.text}\n${current.titleHint}\n${current.text}`).length;
      const score = combinedLength + Math.abs(cleanText(prev.text).length - cleanText(current.text).length);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    if (!Number.isFinite(bestScore)) {
      break;
    }

    const previous = output[bestIndex - 1];
    const current = output[bestIndex];
    const mergedTitleHint = [previous.titleHint, current.titleHint]
      .map((item) => cleanText(item))
      .filter(Boolean)
      .filter((item, index, all) => all.indexOf(item) === index)
      .slice(0, 2)
      .join(" / ")
      .slice(0, 120);
    output.splice(bestIndex - 1, 2, {
      pageNumber: previous.pageNumber,
      titleHint: mergedTitleHint || previous.titleHint || current.titleHint,
      text: [previous.text, current.text].filter(Boolean).join("\n\n"),
    });
    mergedCount += 1;
  }

  return {
    pages: output.map((page, index) => ({
      ...page,
      pageNumber: index + 1,
    })),
    mergedCount,
  };
}

export function compileModernEditorialDeck(params: {
  topic: string;
  canvasRatio: CanvasRatio;
  maxPages: number;
  pages: ModernEditorialSourcePage[];
}): ModernEditorialCompilation {
  const family = RATIO_FAMILY[params.canvasRatio] ?? "landscape_wide";
  const seedBase = `${slugifySeed(params.topic)}-${params.canvasRatio.replace(":", "x")}-${params.maxPages}`;
  const warnings: string[] = [];
  const condensed = condenseSourcePages({
    pages: params.pages,
    family,
    maxPages: params.maxPages,
  });
  if (condensed.mergedCount > 0) {
    warnings.push(`Condensed ${condensed.mergedCount} low-density page pair(s) before sending content to the skill.`);
  }

  const sourcePages = condensed.pages.length > 1
    ? [
        synthesizeDeckCoverPage({
          topic: params.topic,
          pages: condensed.pages,
        }),
        ...condensed.pages.slice(1),
      ]
    : condensed.pages;
  if (sourcePages.length > 1) {
    warnings.push("Synthesized a dedicated editorial cover page from the overall deck summary.");
  }

  const pages = sourcePages.map((page, index) => {
    const analysis = analyzePage(page);
    const intent = inferIntent({
      pageIndex: index,
      totalPages: sourcePages.length,
      analysis,
      sourceText: page.text,
    });
    const preferredArchetype = choosePreferredArchetype({
      family,
      intent,
      pageIndex: index,
      totalPages: sourcePages.length,
      analysis,
    });
    const forceArchetype = shouldForceArchetype({
      pageIndex: index,
      totalPages: sourcePages.length,
      intent,
      family,
      analysis,
    })
      ? preferredArchetype
      : null;
    const compiled = buildCompiledText(intent, analysis, family);
    const pageWarnings = compiled.warnings.slice();
    if (analysis.paragraphs.length <= 1 && analysis.bullets.length <= 1) {
      pageWarnings.push("This page still has very little structure and may render airy if the layout expects richer content.");
    }
    if (preferredArchetype === "feature_story_panels" && analysis.bullets.length === 0 && analysis.narrativeSections.length < 2) {
      pageWarnings.push("Feature story layouts work better with at least two distinct narrative blocks; the compiler filled them from prose.");
    }

    return {
      pageNumber: page.pageNumber,
      titleHint: analysis.title,
      compiledText: compiled.text,
      pageIntentHint: intent,
      preferredArchetype,
      forceArchetype,
      archetypeMode: forceArchetype ? "forced" as const : "guided" as const,
      recommendedImageCount: recommendedImageCount({
        archetype: preferredArchetype,
        family,
        intent,
        analysis,
      }),
      maxImagesOverride: recommendedImageCount({
        archetype: preferredArchetype,
        family,
        intent,
        analysis,
      }),
      warnings: pageWarnings,
      structure: {
        paragraphCount: analysis.paragraphs.length,
        bulletCount: analysis.bullets.length,
        workflowStepCount: analysis.workflowSteps.length,
        timelinePhaseCount: analysis.timelinePhases.length,
        sectionCount: analysis.narrativeSections.length,
      },
    };
  });

  const plannedImageCount = pages.reduce((total, page) => total + page.recommendedImageCount, 0);
  if (pages.some((page) => page.warnings.length > 0)) {
    warnings.push("Some pages required synthesized structure before sending them to the skill. Review the preflight panel before running.");
  }

  return {
    designStyle: "soft-wellness",
    density: "balanced",
    randomizeLayouts: false,
    seed: seedBase,
    theme: {
      paletteMode: "soft-pastel",
      roundedCorners: true,
    },
    renderOptions: {
      pptxFileName: `${slugifySeed(params.topic)}.pptx`,
      jsonFileName: `${slugifySeed(params.topic)}.layout.json`,
      mdFileName: `${slugifySeed(params.topic)}.md`,
      pdfFileName: `${slugifySeed(params.topic)}.pdf`,
      pdfEngine: "libreoffice",
    },
    pages,
    warnings,
    plannedImageCount,
  };
}
