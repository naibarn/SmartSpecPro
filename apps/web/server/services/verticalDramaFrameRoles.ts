import { createHash } from "node:crypto";
import { z } from "zod";

export const verticalDramaFrameRoleSchema = z.enum(["start", "stop"]);
export type VerticalDramaFrameRole = z.infer<typeof verticalDramaFrameRoleSchema>;

const roleAwareFramePromptSchema = z.object({
  contract_version: z.number().int().optional(),
  frame_role: verticalDramaFrameRoleSchema.optional(),
  prompt: z.string().trim().min(1),
  negative_prompt: z.string().optional().default(""),
  semantic_handoff: z
    .object({
      opening_moment: z.string().trim().max(1_000).optional(),
      terminal_moment: z.string().trim().max(1_000).optional(),
      story_meaning: z.string().trim().max(1_000).optional(),
      continuity_locks: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
      source_revision: z.string().trim().min(1).max(200),
    })
    .optional(),
  analysis: z.record(z.string(), z.unknown()).optional(),
});

export type RoleAwareFramePromptOutput = z.infer<typeof roleAwareFramePromptSchema> & {
  frame_role: VerticalDramaFrameRole;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

export function sha256Prompt(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function buildFrameSourceRevision(value: unknown): string {
  return sha256Prompt(JSON.stringify(stableValue(value)));
}

export function createFrameSemanticHandoff(input: {
  role: VerticalDramaFrameRole;
  openingMoment?: string;
  terminalMoment?: string;
  storyMeaning?: string;
  continuityLocks?: string[];
  sourceRevision: string;
}): {
  frame_role: VerticalDramaFrameRole;
  opening_moment?: string;
  terminal_moment?: string;
  story_meaning?: string;
  continuity_locks: string[];
  source_revision: string;
} {
  return {
    frame_role: input.role,
    ...(input.openingMoment?.trim()
      ? { opening_moment: input.openingMoment.trim().slice(0, 1_000) }
      : {}),
    ...(input.terminalMoment?.trim()
      ? { terminal_moment: input.terminalMoment.trim().slice(0, 1_000) }
      : {}),
    ...(input.storyMeaning?.trim()
      ? { story_meaning: input.storyMeaning.trim().slice(0, 1_000) }
      : {}),
    continuity_locks: Array.from(
      new Set(
        (input.continuityLocks ?? [])
          .map(value => value.trim().slice(0, 500))
          .filter(Boolean),
      ),
    ).slice(0, 20),
    source_revision: input.sourceRevision.slice(0, 200),
  };
}

export function buildFrameRoleContext(input: {
  role: VerticalDramaFrameRole;
  canonicalSynopsis: string;
  currentStartPrompt?: string;
  currentStartNegativePrompt?: string;
  startSemanticHandoff?: unknown;
}): string {
  const synopsis = input.canonicalSynopsis.trim();
  const shared = [
    `FRAME ROLE: ${input.role.toUpperCase()}`,
    `authoritative_synopsis: ${synopsis}`,
    "Interpret the synopsis as an ordered beat, not one simultaneous tableau.",
  ];
  if (input.role === "start") {
    shared.push(
      "Choose the earliest useful frozen opening beat before the irreversible action or decision.",
      "Do not depict the later phone disposal, hiding, or identity-abandonment terminal action in the start image.",
      "The result must be a genuine beginning state that leaves visual room for the shot to progress.",
    );
  } else {
    shared.push(
      "Choose the terminal frozen beat or immediate aftermath that visually completes the ordered synopsis.",
      "Preserve the current start frame's cast, location, wardrobe, lighting grammar, and camera continuity unless the synopsis explicitly changes them.",
      "Use the start prompt as continuity context, not as permission to repeat its opening action.",
      `current_start_prompt: ${input.currentStartPrompt ?? "(missing — use persisted handoff and synopsis)"}`,
      `current_start_negative_prompt: ${input.currentStartNegativePrompt ?? "(none)"}`,
      `start_semantic_handoff: ${JSON.stringify(input.startSemanticHandoff ?? null)}`,
    );
  }
  shared.push(
    "Return one still-image prompt for this role only; never combine start and stop into one frame.",
  );
  return shared.join("\n");
}

export function normalizeRoleAwareFramePromptOutput(
  raw: unknown,
  expectedRole: VerticalDramaFrameRole,
): RoleAwareFramePromptOutput {
  const parsed = roleAwareFramePromptSchema.parse(raw);
  const legacyStart = expectedRole === "start" && parsed.frame_role === undefined;
  if (!legacyStart && parsed.contract_version !== 2) {
    throw new Error("Role-aware frame prompt requires contract_version 2");
  }
  if (parsed.frame_role && parsed.frame_role !== expectedRole) {
    throw new Error(
      `Role-aware frame prompt role mismatch: expected ${expectedRole}, received ${parsed.frame_role}`,
    );
  }
  return { ...parsed, frame_role: expectedRole };
}

export { roleAwareFramePromptSchema };
