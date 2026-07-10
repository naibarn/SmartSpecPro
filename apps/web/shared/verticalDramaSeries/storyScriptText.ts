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

/**
 * Compact plan-only block (ตอนชื่อ / เรื่องย่อ / จุดดำเนินเรื่อง / จุดค้าง) — the
 * SAME labels as `formatStoryScriptEpisode` but WITHOUT the per-shot dialogue
 * section. Used to inject the episode's planned scene-setting context (esp.
 * the enriched, scene-setting logline) into downstream generation prompts
 * (storyboard / start-frame image / video motion prompts) as compact,
 * reference-only context. Tolerates an empty `keyBeats` array (section
 * omitted) and a missing/empty `cliffhangerLine` (line omitted).
 */
export function formatStoryScriptEpisodePlanContext(
  lang: StoryScriptLang,
  episode: Pick<StoryScriptEpisodeInput, "episodeNumber" | "workingTitle" | "logline" | "keyBeats" | "cliffhangerLine">,
): string {
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
 * Strips a single matching leading/trailing markdown-emphasis wrapper
 * (`**...**` or `__...__`) from an already-trimmed line, tolerating the
 * "whole header/label line wrapped in bold" drift some models produce
 * (episode 2 incident, confirmed via raw LLM response inspection,
 * 2026-07-10). Only strips ONE matching pair, and only when the wrapper
 * spans the ENTIRE trimmed line (open at index 0, matching close at the
 * very end) — inline emphasis elsewhere in real content (e.g. a bolded
 * word mid-summary) is never touched because it doesn't span start-to-end.
 */
export function stripWrappingMarkdownEmphasis(line: string): string {
  const trimmed = line.trim();
  const match = trimmed.match(/^(\*\*|__)([\s\S]*)\1$/);
  if (match && match[2].trim().length > 0) return match[2].trim();
  return trimmed;
}

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
    const match = stripWrappingMarkdownEmphasis(line).match(EPISODE_HEADER_PATTERN);
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

const PLACEHOLDER_SPEAKER_LITERALS = new Set(["ผู้พูด", "speaker"]);

/** Shared delivery-suffix-stripping body, factored out of the former single-piece `parseDialogueLine` so the placeholder-literal defense-in-depth below can re-invoke it on a nested `speaker: line` pair. */
function parseDialogueLineBody(speaker: string, restInput: string): StoryScriptShotDialogueLine | null {
  let rest = restInput.trim();
  let delivery: string | undefined;
  const deliveryMatch = rest.match(/^(.*)\s\(([^()]+)\)$/);
  if (deliveryMatch) {
    rest = deliveryMatch[1].trim();
    delivery = deliveryMatch[2].trim();
  }
  const trimmedSpeaker = speaker.trim();
  if (!trimmedSpeaker || !rest) return null;
  return delivery ? { speaker: trimmedSpeaker, line: rest, delivery } : { speaker: trimmedSpeaker, line: rest };
}

/** `- speaker: line` or `- speaker: line (delivery)` -> `{speaker, line, delivery?}`; `null` when the line doesn't match the dialogue shape at all (defensive — never thrown). */
function parseDialogueLine(text: string): StoryScriptShotDialogueLine | null {
  const match = text.match(/^(.+?):\s(.+)$/);
  if (!match) return null;
  const speaker = match[1].trim();
  const rest = match[2].trim();

  // Defense-in-depth for the "model wrote the format example's literal
  // placeholder word instead of the real speaker" bug (episode 4 incident,
  // confirmed via raw LLM response, 2026-07-10): "- ผู้พูด: ใบข้าว: แม่..."
  // — the model reproduced the prompt's format example's literal word
  // "ผู้พูด" instead of substituting the real speaker. If the captured
  // speaker is exactly the known placeholder literal AND the rest itself
  // looks like a nested "speaker: line" pair, re-parse using the nested pair.
  if (PLACEHOLDER_SPEAKER_LITERALS.has(speaker.toLowerCase())) {
    const nested = rest.match(/^(.+?):\s(.+)$/);
    if (nested) {
      return parseDialogueLineBody(nested[1].trim(), nested[2].trim());
    }
  }
  return parseDialogueLineBody(speaker, rest);
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
  options?: { expectedShotCount?: number },
): StoryScriptParsedEpisodeBlock | null {
  const labels = LANG_LABELS[lang];
  const lines = block.split("\n");
  if (lines.length === 0) return null;

  const headerMatch = stripWrappingMarkdownEmphasis(lines[0]).match(labels.headerPattern);
  if (!headerMatch) return null;
  const workingTitle = headerMatch[1].trim();

  let index = 1;

  // Skip blank lines BETWEEN the block's top-level sections. Some model
  // outputs separate เรื่องย่อ / จุดดำเนินเรื่อง / บทพูดรายช็อต with a blank
  // line, and may omit จุดดำเนินเรื่อง entirely (confirmed via real whole-block
  // LLM output, 2026-07-10: a run put a blank line right after เรื่องย่อ and
  // jumped straight to บทพูดรายช็อต — previously that blank line was neither
  // the key-beats header nor the shots header, so hasShotSection stayed false
  // → null → "แยกโครงสร้างช็อตจากผลลัพธ์ไม่ได้" for every episode). The in-shots
  // loop already tolerates blank lines; this does the same between sections.
  const skipBlankLines = () => {
    while (index < lines.length && (lines[index] ?? "").trim().length === 0) index += 1;
  };

  skipBlankLines();
  let logline = "";
  if (stripWrappingMarkdownEmphasis(lines[index] ?? "").startsWith(labels.summaryPrefix)) {
    logline = stripWrappingMarkdownEmphasis(lines[index]).slice(labels.summaryPrefix.length).trim();
    index += 1;
  }

  skipBlankLines();
  const keyBeats: string[] = [];
  if (stripWrappingMarkdownEmphasis(lines[index] ?? "") === labels.keyBeatsHeader) {
    index += 1;
    skipBlankLines();
    while (index < lines.length && stripWrappingMarkdownEmphasis(lines[index]).startsWith("- ")) {
      keyBeats.push(stripWrappingMarkdownEmphasis(lines[index]).slice(2).trim());
      index += 1;
      skipBlankLines();
    }
  }

  skipBlankLines();
  const shots: StoryScriptParsedShot[] = [];
  let hasShotSection = false;

  if (stripWrappingMarkdownEmphasis(lines[index] ?? "") === labels.shotsEmptyLine) {
    hasShotSection = true;
    index += 1;
  } else if (stripWrappingMarkdownEmphasis(lines[index] ?? "") === labels.shotsHeader) {
    hasShotSection = true;
    index += 1;
    let currentShot: StoryScriptParsedShot | null = null;
    while (index < lines.length) {
      const trimmed = stripWrappingMarkdownEmphasis(lines[index]);

      if (trimmed.length === 0) {
        index += 1;
        continue;
      }

      if (trimmed.startsWith(labels.cliffhangerPrefix)) {
        const expected = options?.expectedShotCount;
        if (expected === undefined || shots.length >= expected) break;
        // Stray per-shot "จุดค้าง:" line before the episode's shots are complete
        // (episode 4 incident, confirmed via raw LLM response, 2026-07-10: the
        // model wrote "จุดค้าง: -" after every shot, not just the last one) —
        // treat as noise and keep scanning for more shot headers.
        index += 1;
        continue;
      }

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
      if (currentShot) {
        // Dialogue line. Tolerate a MISSING "- " bullet prefix — some model
        // outputs write "ผู้พูด: บทพูด" without the leading dash (confirmed via
        // real straggler output, 2026-07-10: episode 5's dialogue lines all
        // dropped the "- " prefix, so the loop hit the "unrecognized line"
        // break right after shot 1 and reported "พบ 1 ช็อต"). Only a line that
        // parses as a real "speaker: line" pair is treated as dialogue —
        // shot headers ("ช็อต N:") and the cliffhanger ("จุดค้าง:") are already
        // matched ABOVE, so they can't be misread here; anything that isn't a
        // valid speaker/line pair still falls through to the break below.
        const dialogueBody = trimmed.startsWith("- ") ? trimmed.slice(2) : trimmed;
        const dialogueLine = parseDialogueLine(dialogueBody);
        if (dialogueLine) {
          currentShot.dialogue_lines.push(dialogueLine);
          index += 1;
          continue;
        }
      }
      // Unrecognized line inside the shots section — stop scanning rather
      // than looping forever or mis-attributing trailing prose to a shot.
      break;
    }
  }

  if (!hasShotSection) return null;

  let cliffhangerLine: string | undefined;
  if (stripWrappingMarkdownEmphasis(lines[index] ?? "").startsWith(labels.cliffhangerPrefix)) {
    const value = stripWrappingMarkdownEmphasis(lines[index]).slice(labels.cliffhangerPrefix.length).trim();
    cliffhangerLine = value.length > 0 ? value : undefined;
  }

  return { workingTitle, logline, keyBeats, shots, cliffhangerLine };
}
