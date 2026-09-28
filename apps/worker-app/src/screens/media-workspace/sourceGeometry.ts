export type SourceRotationDegrees = 0 | 90 | 180 | 270;

/**
 * The dimensions used to interpret normalized face/activity coordinates.
 * This is deliberately separate from the output canvas dimensions.
 */
export interface SourceVideoGeometry {
  sourcePath: string;
  width: number;
  height: number;
  rotationDegrees: SourceRotationDegrees;
}

export type SourceGeometryDecision =
  | {
      kind: "initialize";
      current: null;
      candidate: SourceVideoGeometry;
    }
  | {
      kind: "unchanged";
      current: SourceVideoGeometry;
      candidate: SourceVideoGeometry;
    }
  | {
      kind: "confirm";
      current: SourceVideoGeometry;
      candidate: SourceVideoGeometry;
    };

function validDimension(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function normalizeSourceGeometry(input: {
  sourcePath: string;
  width: number;
  height: number;
  rotationDegrees?: number;
}): SourceVideoGeometry | null {
  if (!input.sourcePath.trim() || !validDimension(input.width) || !validDimension(input.height)) return null;
  const rotation = ((Math.round(input.rotationDegrees ?? 0) % 360) + 360) % 360;
  if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) return null;
  return {
    sourcePath: input.sourcePath.trim(),
    width: Math.round(input.width),
    height: Math.round(input.height),
    rotationDegrees: rotation as SourceRotationDegrees,
  };
}

export function evaluateSourceGeometry(
  current: SourceVideoGeometry | null | undefined,
  candidate: SourceVideoGeometry,
): SourceGeometryDecision {
  if (!current) return { kind: "initialize", current: null, candidate };
  const sameDimensions = current.width === candidate.width
    && current.height === candidate.height
    && current.rotationDegrees === candidate.rotationDegrees;
  return sameDimensions
    ? { kind: "unchanged", current, candidate }
    : { kind: "confirm", current, candidate };
}

export function applySourceGeometryDecision(
  current: SourceVideoGeometry | null | undefined,
  candidate: SourceVideoGeometry,
  decision: "keep-current" | "accept-latest",
): SourceVideoGeometry {
  if (!current || decision === "accept-latest") return candidate;
  return current;
}
