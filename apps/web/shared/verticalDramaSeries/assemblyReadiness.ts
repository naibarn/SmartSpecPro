export interface CanonicalAssemblyClip {
  clipNumber: number;
  sourceShotNumbers?: readonly number[];
  parentShotNumber?: number;
  subShotNumber?: number;
  videoUrl?: string;
  videoTask?: { videoUrl?: string };
}

export interface CanonicalShotAssemblyResolution<TClip extends CanonicalAssemblyClip> {
  expectedShotNumbers: number[];
  readyShotNumbers: number[];
  missingShotNumbers: number[];
  selectedClips: TClip[];
}

function validShotNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function uniqueSortedShotNumbers(values: readonly unknown[] | undefined): number[] {
  return Array.from(new Set((values ?? []).filter(validShotNumber))).sort(
    (left, right) => left - right,
  );
}

function completedVideoUrl(clip: CanonicalAssemblyClip): string | undefined {
  const value = clip.videoUrl ?? clip.videoTask?.videoUrl;
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function resolveCanonicalShotNumber(
  clip: CanonicalAssemblyClip,
): number | undefined {
  if (validShotNumber(clip.parentShotNumber)) return clip.parentShotNumber;

  const sourceShotNumber = clip.sourceShotNumbers?.find(validShotNumber);
  if (sourceShotNumber !== undefined) return sourceShotNumber;

  if (
    validShotNumber(clip.subShotNumber) &&
    validShotNumber(clip.clipNumber) &&
    clip.clipNumber >= 100
  ) {
    const decodedParent = Math.floor(clip.clipNumber / 100);
    if (validShotNumber(decodedParent)) return decodedParent;
  }

  return validShotNumber(clip.clipNumber) ? clip.clipNumber : undefined;
}

export function resolveCanonicalShotAssembly<TClip extends CanonicalAssemblyClip>(
  input: {
    clips: readonly TClip[];
    storyboardShotNumbers?: readonly unknown[];
    startFrameShotNumbers?: readonly unknown[];
  },
): CanonicalShotAssemblyResolution<TClip> {
  const storyboardShotNumbers = uniqueSortedShotNumbers(
    input.storyboardShotNumbers,
  );
  const startFrameShotNumbers = uniqueSortedShotNumbers(
    input.startFrameShotNumbers,
  );
  const clipShotNumbers = uniqueSortedShotNumbers(
    input.clips.map(resolveCanonicalShotNumber),
  );
  const expectedShotNumbers =
    storyboardShotNumbers.length > 0
      ? storyboardShotNumbers
      : startFrameShotNumbers.length > 0
        ? startFrameShotNumbers
        : clipShotNumbers;

  const candidatesByShot = new Map<number, TClip[]>();
  const expectedShotSet = new Set(expectedShotNumbers);
  for (const clip of input.clips) {
    const shotNumber = resolveCanonicalShotNumber(clip);
    if (shotNumber === undefined || !expectedShotSet.has(shotNumber)) continue;
    const candidates = candidatesByShot.get(shotNumber);
    if (candidates) candidates.push(clip);
    else candidatesByShot.set(shotNumber, [clip]);
  }

  const readyShotNumbers: number[] = [];
  const missingShotNumbers: number[] = [];
  const selectedClips: TClip[] = [];
  for (const shotNumber of expectedShotNumbers) {
    const completedCandidates = (candidatesByShot.get(shotNumber) ?? [])
      .filter(clip => completedVideoUrl(clip) !== undefined)
      .sort((left, right) => {
        const leftCanonical =
          left.clipNumber === shotNumber &&
          left.parentShotNumber === undefined &&
          left.subShotNumber === undefined;
        const rightCanonical =
          right.clipNumber === shotNumber &&
          right.parentShotNumber === undefined &&
          right.subShotNumber === undefined;
        if (leftCanonical !== rightCanonical) return leftCanonical ? -1 : 1;

        const leftSubShot = validShotNumber(left.subShotNumber)
          ? left.subShotNumber
          : Number.MAX_SAFE_INTEGER;
        const rightSubShot = validShotNumber(right.subShotNumber)
          ? right.subShotNumber
          : Number.MAX_SAFE_INTEGER;
        if (leftSubShot !== rightSubShot) return leftSubShot - rightSubShot;
        return left.clipNumber - right.clipNumber;
      });

    const selected = completedCandidates[0];
    if (selected) {
      readyShotNumbers.push(shotNumber);
      selectedClips.push(selected);
    } else {
      missingShotNumbers.push(shotNumber);
    }
  }

  return {
    expectedShotNumbers,
    readyShotNumbers,
    missingShotNumbers,
    selectedClips,
  };
}
