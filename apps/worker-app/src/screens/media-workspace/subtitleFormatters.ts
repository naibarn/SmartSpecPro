export interface SubtitleWordTiming {
  word: string;
  startMs: number;
  endMs: number;
}

export interface SubtitleSegmentItem {
  id?: string | number;
  startMs: number;
  endMs: number;
  text: string;
  words?: SubtitleWordTiming[];
}

export interface AssStyleOptions {
  fontName?: string;
  fontSize?: number;
  primaryColorHex?: string;
  outlineColorHex?: string;
  backColorHex?: string;
  stylePreset?: string;
}

/**
 * Format milliseconds into SRT timestamp: HH:MM:SS,mmm
 */
export function formatSrtTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const millis = Math.max(0, Math.floor(ms % 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const mmm = String(millis).padStart(3, "0");

  return `${hh}:${mm}:${ss},${mmm}`;
}

/**
 * Format milliseconds into WebVTT timestamp: HH:MM:SS.mmm
 */
export function formatVttTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const millis = Math.max(0, Math.floor(ms % 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const mmm = String(millis).padStart(3, "0");

  return `${hh}:${mm}:${ss}.${mmm}`;
}

/**
 * Format milliseconds into ASS centisecond timestamp: H:MM:SS.cs (e.g. 0:01:23.45)
 */
export function formatAssTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const centis = Math.max(0, Math.floor((ms % 1000) / 10));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const h = String(hours);
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const cs = String(centis).padStart(2, "0");

  return `${h}:${mm}:${ss}.${cs}`;
}

/**
 * Convert HTML hex color (e.g. #FFD700 or #FFFFFF) to ASS BGR Hex color (&H00BBGGRR)
 */
export function hexToAssColor(hexStr: string, alphaHex = "00"): string {
  const clean = hexStr.replace("#", "").trim();
  let r = "FF";
  let g = "FF";
  let b = "FF";

  if (clean.length === 6) {
    r = clean.substring(0, 2);
    g = clean.substring(2, 4);
    b = clean.substring(4, 6);
  } else if (clean.length === 3) {
    r = clean[0] + clean[0];
    g = clean[1] + clean[1];
    b = clean[2] + clean[2];
  }

  // ASS format uses BGR order: &H[AA][BB][GG][RR]
  return `&H${alphaHex}${b}${g}${r}`.toUpperCase();
}

/**
 * Generate SubRip (.srt) subtitle string
 */
export function generateSrt(segments: SubtitleSegmentItem[]): string {
  if (!segments || segments.length === 0) return "";

  const lines: string[] = [];
  segments.forEach((seg, idx) => {
    const text = seg.text.trim();
    if (!text) return;

    lines.push(String(idx + 1));
    lines.push(`${formatSrtTime(seg.startMs)} --> ${formatSrtTime(seg.endMs)}`);
    lines.push(text);
    lines.push("");
  });

  return lines.join("\n");
}

/**
 * Generate WebVTT (.vtt) subtitle string
 */
export function generateVtt(segments: SubtitleSegmentItem[]): string {
  const lines: string[] = ["WEBVTT", ""];

  if (segments && segments.length > 0) {
    segments.forEach((seg, idx) => {
      const text = seg.text.trim();
      if (!text) return;

      lines.push(`${idx + 1}`);
      lines.push(`${formatVttTime(seg.startMs)} --> ${formatVttTime(seg.endMs)}`);
      lines.push(text);
      lines.push("");
    });
  }

  return lines.join("\n");
}

/**
 * Generate Advanced SubStation Alpha (.ass / .ssa) subtitle string
 */
export function generateAss(segments: SubtitleSegmentItem[], options: AssStyleOptions = {}): string {
  const fontName = options.fontName || "Prompt";
  const fontSize = options.fontSize || 42;
  const primaryAssColor = hexToAssColor(options.primaryColorHex || "#FFFFFF");
  const outlineAssColor = hexToAssColor(options.outlineColorHex || "#000000");
  const backAssColor = hexToAssColor(options.backColorHex || "#000000", "80");

  const header = `[Script Info]
Title: SmartAIHub AI Auto Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryAssColor},&H000000FF,${outlineAssColor},${backAssColor},-1,0,0,0,100,100,0,0,1,2.5,1.5,2,10,10,40,1
Style: ViralHighlight,${fontName},${Math.round(fontSize * 1.15)},&H0000FFFF,&H000000FF,${outlineAssColor},${backAssColor},-1,0,0,0,100,100,0,0,1,3,2,2,10,10,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const dialogueLines: string[] = [];

  if (segments && segments.length > 0) {
    segments.forEach((seg) => {
      const text = seg.text.trim();
      if (!text) return;

      const styleName = options.stylePreset === "viral_word_highlight" ? "ViralHighlight" : "Default";

      // If word-level timings are present, generate word highlight ASS tags
      let formattedText = text;
      if (seg.words && seg.words.length > 0) {
        formattedText = seg.words
          .map((w) => `{\\1c&H00FFFF&}${w.word}{\\r}`)
          .join(" ");
      }

      dialogueLines.push(
        `Dialogue: 0,${formatAssTime(seg.startMs)},${formatAssTime(seg.endMs)},${styleName},,0,0,0,,${formattedText}`
      );
    });
  }

  return header + dialogueLines.join("\n") + "\n";
}
