export interface SnapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapCandidate extends SnapRect {
  id: string;
}

export type SnapAxis = "x" | "y";
export type SnapGuideType = "start" | "center" | "end";

export interface SnapGuide {
  axis: SnapAxis;
  type: SnapGuideType;
  sourceElementId: string;
  target: number;
  delta: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: SnapGuide[];
}

export interface SnapOptions {
  threshold?: number;
}

interface CandidateGuide extends SnapGuide {
  rank: number;
}

function lineValue(
  rect: SnapRect,
  axis: SnapAxis,
  type: SnapGuideType,
): number {
  const start = axis === "x" ? rect.x : rect.y;
  const size = axis === "x" ? rect.width : rect.height;
  if (type === "center") {
    return start + size / 2;
  }

  if (type === "end") {
    return start + size;
  }

  return start;
}

function typeRank(type: SnapGuideType): number {
  if (type === "center") {
    return 0;
  }
  if (type === "start") {
    return 1;
  }
  return 2;
}

function rankGuide(guide: SnapGuide): number {
  return (
    Math.abs(guide.delta) * 1000
    + typeRank(guide.type) * 10
    + (guide.axis === "x" ? 0 : 1)
  );
}

function bestGuideForAxis(
  axis: SnapAxis,
  active: SnapRect,
  candidates: SnapCandidate[],
  threshold: number,
): CandidateGuide | null {
  const types: SnapGuideType[] = ["start", "center", "end"];
  let best: CandidateGuide | null = null;

  for (const candidate of candidates) {
    for (const sourceType of types) {
      for (const targetType of types) {
        const sourceValue = lineValue(active, axis, sourceType);
        const targetValue = lineValue(candidate, axis, targetType);
        const delta = targetValue - sourceValue;
        if (Math.abs(delta) > threshold) {
          continue;
        }

        const guide: SnapGuide = {
          axis,
          type: sourceType,
          sourceElementId: candidate.id,
          target: targetValue,
          delta,
        };
        const rankedGuide: CandidateGuide = {
          ...guide,
          rank: rankGuide(guide),
        };
        if (!best || rankedGuide.rank < best.rank) {
          best = rankedGuide;
        }
      }
    }
  }

  return best;
}

export function computeSnapPosition(
  active: SnapRect,
  candidates: SnapCandidate[],
  options?: SnapOptions,
): SnapResult {
  const threshold = options?.threshold ?? 8;
  const xGuide = bestGuideForAxis("x", active, candidates, threshold);
  const yGuide = bestGuideForAxis("y", active, candidates, threshold);

  return {
    x: active.x + (xGuide?.delta ?? 0),
    y: active.y + (yGuide?.delta ?? 0),
    guides: [xGuide, yGuide].filter((v): v is CandidateGuide => v !== null),
  };
}
