export interface TeamRoomActionLink {
  label: string;
  href: string;
  kind: "approval" | "reply" | "workflow" | "open";
}

const TEAM_ROOM_LINK_REGEX = /\[([^\]]*(?:Team Room|Workflow Board)[^\]]*)\]\((\/teams\/[^)\s]+)\)/gi;

function classifyTeamRoomAction(label: string): TeamRoomActionLink["kind"] {
  const normalized = label.toLowerCase();
  if (normalized.includes("approval")) return "approval";
  if (normalized.includes("reply")) return "reply";
  if (normalized.includes("workflow")) return "workflow";
  return "open";
}

export function extractTeamRoomActionLinks(content: string): TeamRoomActionLink[] {
  if (!content) return [];

  const matches = [...content.matchAll(TEAM_ROOM_LINK_REGEX)];
  const deduped = new Map<string, TeamRoomActionLink>();

  for (const match of matches) {
    const label = match[1]?.trim();
    const href = match[2]?.trim();
    if (!label || !href) continue;

    const action: TeamRoomActionLink = {
      label,
      href,
      kind: classifyTeamRoomAction(label),
    };
    const key = `${label}|${href}`;
    if (!deduped.has(key)) {
      deduped.set(key, action);
    }
  }

  return [...deduped.values()];
}

export function stripStandaloneTeamRoomActionLinks(content: string): string {
  if (!content) return "";

  const lines = content.split("\n");
  const filteredLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;

    return !/^(?:[-*]\s+)?(?:Markdown action link|Markdown workflow link):\s*\[[^\]]*(?:Team Room|Workflow Board)[^\]]*\]\((\/teams\/[^)\s]+)\)\s*$/i.test(trimmed);
  });

  return filteredLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
