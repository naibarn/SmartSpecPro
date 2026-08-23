import { TRPCError } from "@trpc/server";
import { shotBrollBindingSchema, sourceMediaSegmentSchema, type ShotBrollBinding, type SourceMediaSegment } from "@shared/verticalDramaSeries/visualSource";

export function validateBrollBinding(input: ShotBrollBinding, context: { snapshotRevision: number; snapshotFingerprint: string; segment?: SourceMediaSegment | null }): ShotBrollBinding {
  const binding = shotBrollBindingSchema.parse(input);
  if (binding.usage.snapshotRevision !== context.snapshotRevision || binding.usage.snapshotFingerprint !== context.snapshotFingerprint) {
    throw new TRPCError({ code: "CONFLICT", message: "B-roll binding is based on a stale visual source snapshot" });
  }
  if (binding.usage.semanticRole === "scene_anchor" && binding.usage.mediaType !== "image") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Scene anchor promotion requires an image environment source" });
  }
  if (binding.usage.semanticRole === "b_roll_footage") {
    if (binding.usage.mediaType !== "video" || !binding.usage.segmentId || binding.usage.inSeconds == null || binding.usage.outSeconds == null) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Footage B-roll requires one video segment with in/out bounds" });
    }
    if (!context.segment) throw new TRPCError({ code: "NOT_FOUND", message: "B-roll segment not found" });
    const segment = sourceMediaSegmentSchema.parse(context.segment);
    if (segment.status !== "ready") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "B-roll segment is not ready" });
    if (binding.usage.segmentRevision !== segment.revision || binding.usage.inSeconds < segment.inSeconds! || binding.usage.outSeconds > segment.outSeconds!) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "B-roll bounds or segment revision is invalid" });
    }
  }
  if (binding.usage.semanticRole === "b_roll_still" && binding.usage.displayDurationSeconds == null) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Still B-roll requires an explicit display duration" });
  }
  return binding;
}

export function projectBrollTimeline(bindings: ShotBrollBinding[], maxDurationSeconds = 60): { bindings: ShotBrollBinding[]; totalDurationSeconds: number; warnings: string[] } {
  const ordered = bindings.filter(binding => binding.active).sort((a, b) => a.order - b.order || a.bindingId.localeCompare(b.bindingId));
  let totalDurationSeconds = 0;
  const warnings: string[] = [];
  for (const binding of ordered) {
    const usage = binding.usage;
    const duration = usage.mediaType === "video" && usage.inSeconds != null && usage.outSeconds != null
      ? usage.outSeconds - usage.inSeconds
      : usage.displayDurationSeconds ?? 0;
    if (duration <= 0) warnings.push(`${binding.bindingId}: zero or missing duration`);
    totalDurationSeconds += duration;
  }
  if (totalDurationSeconds > maxDurationSeconds) warnings.push(`B-roll timeline exceeds ${maxDurationSeconds}s`);
  return { bindings: ordered, totalDurationSeconds, warnings };
}
