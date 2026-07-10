/**
 * Vertical Drama Series — shared, pure "full script text" formatter/parser
 * (added 2026-07-10, "ปรับปรุงบทละครให้มีความสมบูรณ์").
 *
 * Extracted BYTE-IDENTICALLY (not reimplemented) from
 * `client/src/pages/VerticalDramaSeriesDetailPage.tsx`'s
 * `formatStoryCopyEpisode`/`buildVerticalDramaStoryCopyText` — the exact text
 * the existing "คัดลอกเนื้อเรื่อง" copy button builds. That page now calls
 * these shared functions via thin adapters (mapping its own two-source data —
 * episode plan + `deepDraftItem` — onto the single `StoryScriptEpisodeInput`
 * shape below) instead of owning the formatting logic itself.
 *
 * A NEW server-side adapter (`buildStoryScriptTextFromBible`,
 * `server/services/verticalDramaImproveScript.ts`) maps
 * `StoredEpisodeBreakdownItem[]` (from `getActiveBreakdown`) onto this same
 * shape to build the whole-script input for the
 * `drama-script-evaluate-improve` skill.
 *
 * This module is also the ONE place that knows how to parse the format back
 * apart (`splitStoryScriptTextIntoEpisodeBlocks`/`parseStoryScriptEpisodeBlock`)
 * — a mechanical inverse of `formatStoryScriptEpisode`, used to read the
 * skill's revised script back into structured per-episode fields. Pure,
 * deterministic, no server/DB imports — safe for both client and server.
 */

export type StoryScriptLang = "th" | "en";

export interface StoryScriptShotDialogueLine {
  speaker: string;
  line: string;
  delivery?: string;
}

export interface StoryScriptShotDraft {
  shot_number: number;
  summary: string;
  dialogue_lines: StoryScriptShotDialogueLine[];
}

/**
 * One episode's data as consumed by `formatStoryScriptEpisode`/
 * `buildStoryScriptText` — the unified shape both the client's dual-source
 * merge (episode plan + `deepDraftItem`) and the server's single-source
 * `StoredEpisodeBreakdownItem` map onto.
 */
export interface StoryScriptEpisodeInput {
  episodeNumber: number;
  workingTitle: string;
  logline: string;
  keyBeats: string[];
  /** `null` when this episode has no deep-drafted shots yet (mirrors `readDeepDraftShotDrafts`/`readItemShotDrafts`'s own "no draft" contract). */
  shotDrafts: StoryScriptShotDraft[] | null;
  cliffhangerLine?: string;
}

/** Re-exported in place of the page's own `VD_STORY_COPY_CLIPBOARD_CHAR_LIMIT`. */
export const STORY_SCRIPT_TEXT_CHAR_LIMIT = 900_000;

function compactText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Per-episode text block (title, logline, key beats, per-shot dialogue, cliffhanger line) — byte-identical to the former `formatStoryCopyEpisode`. */
export function formatStoryScriptEpisode(lang: StoryScriptLang, episode: StoryScriptEpisodeInput): string {
  const lines: string[] = [];
  const cliffhangerLine = compactText(episode.cliffhangerLine);

  lines.push(
    lang === "th"
      ? `ตอนที่ ${episode.episodeNumber}: ${episode.workingTitle}`
      : `Episode ${episode.episodeNumber}: ${episode.workingTitle}`,
  );
  lines.push(lang === "th" ? `เรื่องย่อ: ${episode.logline}` : `Summary: ${episode.logline}`);
  if (episode.keyBeats.length > 0) {
    lines.push(lang === "th" ? "จุดดำเนินเรื่อง:" : "Key beats:");
    for (const beat of episode.keyBeats) lines.push(`- ${beat}`);
  }

  if (episode.shotDrafts && episode.shotDrafts.length > 0) {
    lines.push(lang === "th" ? "บทพูดรายช็อต:" : "Shot-by-shot dialogue:");
    for (const shot of episode.shotDrafts) {
      lines.push(
        lang === "th"
          ? `ช็อต ${shot.shot_number}: ${shot.summary}`
          : `Shot ${shot.shot_number}: ${shot.summary}`,
      );
      if (shot.dialogue_lines.length === 0) {
        lines.push(lang === "th" ? "- ไม่มีบทพูด" : "- No dialogue");
      } else {
        for (const dialogue of shot.dialogue_lines) {
          const delivery = compactText(dialogue.delivery);
          lines.push(
            delivery
              ? `- ${dialogue.speaker}: ${dialogue.line} (${delivery})`
              : `- ${dialogue.speaker}: ${dialogue.line}`,
          );
        }
      }
    }
  } else {
    lines.push(
      lang === "th" ? "บทพูดรายช็อต: ยังไม่มีร่างละเอียด" : "Shot-by-shot dialogue: no detailed draft yet",
    );
  }

  if (cliffhangerLine) {
    lines.push(lang === "th" ? `จุดค้าง: ${cliffhangerLine}` : `Cliffhanger: ${cliffhangerLine}`);
  }

  return lines.join("\n");
}

export interface BuildStoryScriptTextResult {
  text: string;
  copiedEpisodeNumbers: number[];
  omittedEpisodeNumbers: number[];
  truncated: boolean;
}

/** Joins episode blocks with the same header + char-limit truncation contract as the former `buildVerticalDramaStoryCopyText` (byte-identical logic). */
export function buildStoryScriptText(params: {
  lang: StoryScriptLang;
  title?: string | null;
  genre?: string | null;
  tone?: string | null;
  seasonArc?: string | null;
  episodes: StoryScriptEpisodeInput[];
  fromEpisode: number;
  toEpisode: number;
  maxChars?: number;
}): BuildStoryScriptTextResult {
  const maxChars = Math.max(500, params.maxChars ?? STORY_SCRIPT_TEXT_CHAR_LIMIT);
  const selectedEpisodes = params.episodes
    .filter(
      (episode) => episode.episodeNumber >= params.fromEpisode && episode.episodeNumber <= params.toEpisode,
    )
    .sort((a, b) => a.episodeNumber - b.episodeNumber);

  const headerLines = [
    params.title ? (params.lang === "th" ? `ซีรีส์: ${params.title}` : `Series: ${params.title}`) : null,
    params.genre ? (params.lang === "th" ? `แนว: ${params.genre}` : `Genre: ${params.genre}`) : null,
    params.tone ? (params.lang === "th" ? `โทน: ${params.tone}` : `Tone: ${params.tone}`) : null,
    params.seasonArc
      ? params.lang === "th"
        ? `เรื่องย่อรวม: ${params.seasonArc}`
        : `Season arc: ${params.seasonArc}`
      : null,
    params.lang === "th"
      ? `ช่วงตอนที่เลือก: ${params.fromEpisode}-${params.toEpisode}`
      : `Selected episodes: ${params.fromEpisode}-${params.toEpisode}`,
  ].filter((line): line is string => Boolean(line));

  let text = `${headerLines.join("\n")}\n\n`;
  const copiedEpisodeNumbers: number[] = [];
  let truncated = false;

  for (const episode of selectedEpisodes) {
    const episodeText = formatStoryScriptEpisode(params.lang, episode);
    const nextText = `${text}${copiedEpisodeNumbers.length > 0 ? "\n\n" : ""}${episodeText}`;
    if (nextText.length > maxChars) {
      truncated = true;
      if (copiedEpisodeNumbers.length === 0) {
        text = nextText.slice(0, maxChars);
        copiedEpisodeNumbers.push(episode.episodeNumber);
      }
      break;
    }
    text = nextText;
    copiedEpisodeNumbers.push(episode.episodeNumber);
  }

  const copied = new Set(copiedEpisodeNumbers);
  return {
    text,
    copiedEpisodeNumbers,
    omittedEpisodeNumbers: selectedEpisodes
      .map((episode) => episode.episodeNumber)
      .filter((episodeNumber) => !copied.has(episodeNumber)),
    truncated,
  };
}

/* -------------------------------------------------------------------------- */
/* Inverse parser — mechanical inverse of `formatStoryScriptEpisode`          */
/* -------------------------------------------------------------------------- */

export interface StoryScriptParsedShot {
  shot_number: number;
  summary: string;
  dialogue_lines: StoryScriptShotDialogueLine[];
}

export interface StoryScriptParsedEpisodeBlock {
  workingTitle: string;
  logline: string;
  keyBeats: string[];
  shots: StoryScriptParsedShot[];
  cliffhangerLine?: string;
}

const EPISODE_HEADER_PATTERN = /^(?:ตอนที่|Episode)\s+(\d+):/;

/**
 * Splits a full (already score/summary-stripped) script body into per-episode
 * text blocks, keyed by episode number — the mechanical inverse of joining
 * `formatStoryScriptEpisode` blocks with a blank-line separator in
 * `buildStoryScriptText`. Matches EITHER header spelling (`ตอนที่ N:`/
 * `Episode N:`) regardless of `lang`, since a long LLM response occasionally
 * drifts on this — `lang` is accepted (and used by `parseStoryScriptEpisodeBlock`
 * below) purely for symmetry with the formatter and to select the correct
 * field-label patterns when parsing each block's body.
 *
 * A header line appearing more than once is NOT specially detected here (the
 * later block simply overwrites the earlier one in the returned `Map`) —
 * callers that need a fail-closed "no duplicate episode headers" check (e.g.
 * `runImproveScriptJob`'s verification gate) must scan the raw text
 * separately for duplicate header occurrences before/instead of relying on
 * this map's key set alone.
 */
export function splitStoryScriptTextIntoEpisodeBlocks(
  _lang: StoryScriptLang,
  fullText: string,
): Map<number, string> {
  const lines = fullText.split("\n");
  const blocks = new Map<number, string>();
  let currentEpisodeNumber: number | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentEpisodeNumber !== null) {
      blocks.set(currentEpisodeNumber, currentLines.join("\n").trim());
    }
  };

  for (const line of lines) {
    const match = line.match(EPISODE_HEADER_PATTERN);
    if (match) {
      flush();
      currentEpisodeNumber = Number(match[1]);
      currentLines = [line];
    } else if (currentEpisodeNumber !== null) {
      currentLines.push(line);
    }
  }
  flush();

  return blocks;
}

interface StoryScriptLangLabels {
  headerPattern: RegExp;
  summaryPrefix: string;
  keyBeatsHeader: string;
  shotsHeader: string;
  shotsEmptyLine: string;
  shotHeaderPattern: RegExp;
  noDialogueLine: string;
  cliffhangerPrefix: string;
}

const LANG_LABELS: Record<StoryScriptLang, StoryScriptLangLabels> = {
  th: {
    headerPattern: /^ตอนที่\s+\d+:\s*(.*)$/,
    summaryPrefix: "เรื่องย่อ: ",
    keyBeatsHeader: "จุดดำเนินเรื่อง:",
    shotsHeader: "บทพูดรายช็อต:",
    shotsEmptyLine: "บทพูดรายช็อต: ยังไม่มีร่างละเอียด",
    shotHeaderPattern: /^ช็อต\s+(\d+):\s*(.*)$/,
    noDialogueLine: "- ไม่มีบทพูด",
    cliffhangerPrefix: "จุดค้าง: ",
  },
  en: {
    headerPattern: /^Episode\s+\d+:\s*(.*)$/,
    summaryPrefix: "Summary: ",
    keyBeatsHeader: "Key beats:",
    shotsHeader: "Shot-by-shot dialogue:",
    shotsEmptyLine: "Shot-by-shot dialogue: no detailed draft yet",
    shotHeaderPattern: /^Shot\s+(\d+):\s*(.*)$/,
    noDialogueLine: "- No dialogue",
    cliffhangerPrefix: "Cliffhanger: ",
  },
};

/** `- speaker: line` or `- speaker: line (delivery)` -> `{speaker, line, delivery?}`; `null` when the line doesn't match the dialogue shape at all (defensive — never thrown). */
function parseDialogueLine(text: string): StoryScriptShotDialogueLine | null {
  const match = text.match(/^(.+?):\s(.+)$/);
  if (!match) return null;
  const speaker = match[1].trim();
  let rest = match[2].trim();
  let delivery: string | undefined;
  const deliveryMatch = rest.match(/^(.*)\s\(([^()]+)\)$/);
  if (deliveryMatch) {
    rest = deliveryMatch[1].trim();
    delivery = deliveryMatch[2].trim();
  }
  if (!speaker || !rest) return null;
  return delivery ? { speaker, line: rest, delivery } : { speaker, line: rest };
}

/**
 * Mechanical inverse of `formatStoryScriptEpisode`: title / logline / key
 * beats / per-shot summary+dialogue lines / cliffhanger. Returns `null` on a
 * STRUCTURAL miss — no header line at all, or no recognizable shot section
 * (neither the "has shots" header nor the "no draft yet" line was found) —
 * never throws. A block that HAS a shot section but not exactly 9 shots (or
 * has other content drift) still parses successfully here; verifying the
 * exact shot count/numbering is the caller's job (`runImproveScriptJob`'s
 * fail-closed verification gate), not this pure parser's.
 */
export function parseStoryScriptEpisodeBlock(
  lang: StoryScriptLang,
  block: string,
): StoryScriptParsedEpisodeBlock | null {
  const labels = LANG_LABELS[lang];
  const lines = block.split("\n");
  if (lines.length === 0) return null;

  const headerMatch = lines[0].match(labels.headerPattern);
  if (!headerMatch) return null;
  const workingTitle = headerMatch[1].trim();

  let index = 1;
  let logline = "";
  if (lines[index]?.startsWith(labels.summaryPrefix)) {
    logline = lines[index].slice(labels.summaryPrefix.length).trim();
    index += 1;
  }

  const keyBeats: string[] = [];
  if (lines[index]?.trim() === labels.keyBeatsHeader) {
    index += 1;
    while (index < lines.length && lines[index].startsWith("- ")) {
      keyBeats.push(lines[index].slice(2).trim());
      index += 1;
    }
  }

  const shots: StoryScriptParsedShot[] = [];
  let hasShotSection = false;

  if (lines[index]?.trim() === labels.shotsEmptyLine) {
    hasShotSection = true;
    index += 1;
  } else if (lines[index]?.trim() === labels.shotsHeader) {
    hasShotSection = true;
    index += 1;
    let currentShot: StoryScriptParsedShot | null = null;
    while (index < lines.length) {
      const trimmed = lines[index].trim();
      if (trimmed.startsWith(labels.cliffhangerPrefix)) break;

      const shotHeaderMatch = trimmed.match(labels.shotHeaderPattern);
      if (shotHeaderMatch) {
        currentShot = {
          shot_number: Number(shotHeaderMatch[1]),
          summary: shotHeaderMatch[2].trim(),
          dialogue_lines: [],
        };
        shots.push(currentShot);
        index += 1;
        continue;
      }
      if (currentShot && trimmed === labels.noDialogueLine) {
        index += 1;
        continue;
      }
      if (currentShot && trimmed.startsWith("- ")) {
        const dialogueLine = parseDialogueLine(trimmed.slice(2));
        if (dialogueLine) currentShot.dialogue_lines.push(dialogueLine);
        index += 1;
        continue;
      }
      // Unrecognized line inside the shots section — stop scanning rather
      // than looping forever or mis-attributing trailing prose to a shot.
      break;
    }
  }

  if (!hasShotSection) return null;

  let cliffhangerLine: string | undefined;
  if (lines[index]?.trim().startsWith(labels.cliffhangerPrefix)) {
    const value = lines[index].trim().slice(labels.cliffhangerPrefix.length).trim();
    cliffhangerLine = value.length > 0 ? value : undefined;
  }

  return { workingTitle, logline, keyBeats, shots, cliffhangerLine };
}
