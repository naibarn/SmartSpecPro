/**
 * Marketplace Content Generator
 *
 * Extracts safe, public-facing content from skill.md body
 * for display on the Marketplace page. Strips internal details
 * like trigger patterns, config, credit calculations, and system prompts.
 */

const MAX_LENGTH = 2000;

/** Section heading patterns to KEEP (case-insensitive) */
const KEEP_PATTERNS = [
  /overview/i,
  /purpose/i,
  /what.*(it|this).*(does|do)/i,
  /key\s*features/i,
  /^features$/i,
  /supported\s*(platforms|modes)/i,
  /quick\s*start/i,
  /^usage$/i,
  /how\s*to\s*use/i,
  /getting\s*started/i,
  /basic\s*usage/i,
  /^input$/i,
  /input\s*(schema|parameters|fields)/i,
  /^output$/i,
  /output\s*(format|schema)/i,
  /supported\s*languages/i,
  /language\s*support/i,
  /platform\s*(support|compatibility)/i,
];

/** Section heading patterns to STRIP */
const STRIP_PATTERNS = [
  /credit\s*cost/i,
  /pricing/i,
  /^config/i,
  /configuration/i,
  /^setup/i,
  /mcp/i,
  /system\s*prompt/i,
  /^behavior$/i,
  /response\s*guidelines/i,
  /version\s*history/i,
  /changelog/i,
  /implementation/i,
  /internal/i,
  /technical\s*details/i,
  /default\s*values/i,
  /advanced\s*parameters/i,
  /advanced\s*controls/i,
  /controlnet/i,
  /ip.adapter/i,
  /^cron/i,
  /scheduling\s*internals/i,
  /best\s*practices/i,
  /knowledge\s*base/i,
  /^support$/i,
  /^format$/i,
  /task\s*types/i,
  /vfx\s*effects/i,
  /typography/i,
  /style\s*catalog/i,
  /camera\s*techniques/i,
  /audio\s*design/i,
  /creative\s*freedom/i,
  /payload/i,
  /your\s*task/i,
  /cron\s*expression/i,
  /^examples$/i,
];

interface Section {
  heading: string;
  level: number; // 1 = #, 2 = ##, 3 = ###
  body: string;
}

/**
 * Parse markdown into sections by headings
 */
function parseSections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  let currentHeading = "";
  let currentLevel = 0;
  let currentBody: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      // Save previous section
      if (currentHeading || currentBody.length > 0) {
        sections.push({
          heading: currentHeading,
          level: currentLevel,
          body: currentBody.join("\n").trim(),
        });
      }
      currentLevel = headingMatch[1].length;
      currentHeading = headingMatch[2].replace(/[🎯📹📋📊🎬📐🎵📱🔧💡🎨🔄📚📤📝📞⚙️🆕✅🌟🚀🌐💡🎯]/gu, "").trim();
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  // Save last section
  if (currentHeading || currentBody.length > 0) {
    sections.push({
      heading: currentHeading,
      level: currentLevel,
      body: currentBody.join("\n").trim(),
    });
  }

  return sections;
}

/**
 * Check if a section heading matches any pattern in a list
 */
function matchesAny(heading: string, patterns: RegExp[]): boolean {
  const clean = heading.replace(/[^\w\s]/g, "").trim();
  return patterns.some((p) => p.test(clean));
}

/**
 * Remove JSON/code blocks from section body, keep bullet points and text
 */
function stripCodeBlocks(body: string): string {
  // Remove ```json ... ``` and ```...``` blocks
  return body.replace(/```[\s\S]*?```/g, "").trim();
}

/**
 * Truncate content at a section boundary to stay within MAX_LENGTH
 */
function truncateAtSectionBoundary(sections: Section[], maxLen: number): string {
  let result = "";

  for (const section of sections) {
    const prefix = section.level === 2 ? "## " : "### ";
    const block = `${prefix}${section.heading}\n\n${section.body}\n\n`;

    if (result.length + block.length > maxLen && result.length > 0) {
      break;
    }
    result += block;
  }

  return result.trim();
}

/**
 * Generate marketplace content from skill markdown body and metadata.
 *
 * @param skillContent - Markdown body (after frontmatter stripped)
 * @param metadata - Skill name and description from frontmatter
 * @returns Curated, public-facing markdown string
 */
export function generateMarketplaceContent(
  skillContent: string,
  metadata: { name: string; description?: string }
): string {
  if (!skillContent || !skillContent.trim()) {
    return buildFallback(metadata);
  }

  const sections = parseSections(skillContent);

  // Filter: keep sections that match KEEP_PATTERNS, skip STRIP_PATTERNS
  const kept: Section[] = [];

  for (const section of sections) {
    if (!section.heading) continue; // skip preamble without heading

    // Explicit strip takes priority
    if (matchesAny(section.heading, STRIP_PATTERNS)) continue;

    // Keep if matches keep patterns
    if (matchesAny(section.heading, KEEP_PATTERNS)) {
      const cleanBody = stripCodeBlocks(section.body);
      if (cleanBody) {
        kept.push({ ...section, body: cleanBody });
      }
    }
  }

  if (kept.length === 0) {
    return buildFallback(metadata);
  }

  // Normalize heading levels to ## for consistency
  const normalized = kept.map((s) => ({
    ...s,
    level: s.level === 1 ? 2 : s.level,
  }));

  const content = truncateAtSectionBoundary(normalized, MAX_LENGTH);

  return content || buildFallback(metadata);
}

/**
 * Build fallback content from metadata when no sections can be extracted
 */
function buildFallback(metadata: { name: string; description?: string }): string {
  const name = metadata.name || "Skill";
  const desc = metadata.description || "No description available.";

  return `## Overview\n\n${desc}\n\n## Quick Start\n\nEnable this skill and start using it in your conversations.`;
}
