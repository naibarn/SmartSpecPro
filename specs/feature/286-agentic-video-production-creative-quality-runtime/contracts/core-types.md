# Spec 286 R1.7 — Core Types

Normative companion contract.

# 154. Canonical Core Type Definitions

The following types close previously unresolved logical references. These are **contract semantics**.
At G0, equivalent existing canonical types SHALL win over creating duplicates.

## 154.1 RationalTimeV1

```ts
interface RationalTimeV1 {
  value: bigint | number;
  timescale: bigint | number;
}
```

Interpretation:

```text
seconds = value / timescale
```

Rules:

- `timescale > 0`;
- use integer-valued frame/sample/PTS math whenever practical;
- floating point MAY be used for presentation but MUST NOT be the only canonical basis for
  frame/sample-accurate operations.

## 154.2 VideoCreativeGoalV1

```ts
interface VideoCreativeGoalV1 {
  goalId: string;

  objective:
    | 'EXPLAIN'
    | 'EDUCATE'
    | 'LAUNCH'
    | 'PROMOTE'
    | 'DEMONSTRATE'
    | 'STORYTELL'
    | 'SHOWREEL'
    | 'LOCALIZE'
    | 'REPURPOSE'
    | 'FILM_SHOT'
    | 'CUSTOM';

  audience: string;
  primaryLocale: string;
  targetPlatformRefs: string[];
  targetAspectRefs: string[];

  durationTarget?: {
    preferredMs?: number;
    minMs?: number;
    maxMs?: number;
  };

  successCriteria: string[];
  hardConstraintRefs: string[];
  preferenceRefs: string[];

  sourceIntentRef?: string;
}
```

## 154.3 ProductionStageStateV1

```ts
interface ProductionStageStateV1 {
  stageId: string;

  state:
    | 'NOT_READY'
    | 'READY'
    | 'QUEUED'
    | 'RUNNING'
    | 'WAITING_EXTERNAL'
    | 'WAITING_REVIEW'
    | 'SUCCEEDED'
    | 'FAILED_RECOVERABLE'
    | 'FAILED_TERMINAL'
    | 'CANCEL_PENDING'
    | 'CANCELLED'
    | 'INVALIDATED'
    | 'SUPERSEDED';

  stageRevision: number;
  inputFingerprint?: string;

  attemptCount: number;
  activeWorkerJobRef?: string;
  executionSessionRef?: string;

  outputArtifactRefs: string[];
  receiptRefs: string[];

  invalidatedByRefs: string[];
  lastErrorRef?: string;

  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}
```

`ProductionStageStateV1` is a projection over canonical job/workflow truth. It MUST NOT become a
second job authority.

## 154.4 TypographyDirectionV1

```ts
interface TypographyDirectionV1 {
  hierarchy: 'SUBTLE'|'BALANCED'|'BOLD'|'EDITORIAL'|'CUSTOM';
  density: 'SPARSE'|'BALANCED'|'DENSE';

  preferredFamilyRefs?: string[];
  weightPattern?: string[];
  alignmentPreference?: string[];
  casePreference?: 'NATIVE'|'UPPER'|'LOWER'|'TITLE'|'MIXED';

  kineticIntensity?: 'NONE'|'LOW'|'MEDIUM'|'HIGH';
  maxLinesPreferred?: number;

  accessibilityProfileRef?: string;
  lockedRuleRefs: string[];
}
```

## 154.5 CompositionDirectionV1

```ts
interface CompositionDirectionV1 {
  density: 'SPARSE'|'BALANCED'|'DENSE';
  focalStrategy:
    | 'SINGLE_FOCUS'
    | 'DUAL_FOCUS'
    | 'EDITORIAL_GRID'
    | 'FULL_BLEED'
    | 'CARD_SYSTEM'
    | 'DATA_LED'
    | 'CUSTOM';

  negativeSpacePreference?: 'LOW'|'MEDIUM'|'HIGH';
  depthPreference?: 'FLAT'|'LAYERED'|'PERSPECTIVE'|'3D';
  assetPriority?: 'TEXT_LED'|'IMAGE_LED'|'VIDEO_LED'|'UI_LED'|'BALANCED';

  safeAreaProfileRefs: string[];
  lockedRuleRefs: string[];
}
```

## 154.6 MotionDirectionV1

```ts
interface MotionDirectionV1 {
  intensity: 'STATIC'|'SUBTLE'|'MODERATE'|'ENERGETIC'|'CUSTOM';
  pacing: 'CALM'|'STEADY'|'FAST'|'BEAT_DRIVEN'|'CUSTOM';

  preferredMotionRefs: string[];
  forbiddenMotionRefs: string[];

  transitionFamilyRefs: string[];
  easingFamilyRefs: string[];

  cameraPersonality?: 'LOCKED'|'SUBTLE'|'DYNAMIC'|'CINEMATIC'|'CUSTOM';
  beatSyncPreference?: 'NONE'|'LIGHT'|'STRONG';

  reducedMotionFallbackRef?: string;
}
```

## 154.7 AudioDirectionV1

```ts
interface AudioDirectionV1 {
  narrationPriority: 'PRIMARY'|'BALANCED'|'OPTIONAL';
  musicRole: 'NONE'|'BED'|'RHYTHMIC_DRIVER'|'FEATURE'|'CUSTOM';
  sfxIntensity: 'NONE'|'LOW'|'MEDIUM'|'HIGH';

  targetLoudnessProfileRef?: string;
  duckingProfileRef?: string;

  beatDriven?: boolean;
  ambiencePreference?: string[];

  requiredStemRefs?: string[];
}
```

## 154.8 VideoQualityTargetsV1

```ts
interface VideoQualityTargetsV1 {
  profileId: string;

  deterministicQcMustPass: boolean;
  hardBlockerLimit: number;

  minimumScores?: Partial<{
    overallCreative: number;
    composition: number;
    typography: number;
    readability: number;
    motion: number;
    pacing: number;
    narrativeVisualMatch: number;
    brandConsistency: number;
    audio: number;
    captions: number;
    platformFitness: number;
    contemporaryPolish: number;
  }>;

  minimumConfidence?: number;
  requiredReviewCoverageRef?: string;

  maxCreativeRepairLoops: number;
  maxSameIssueFingerprintAttempts: number;

  accessibilityProfileRef?: string;
  deliveryProfileRefs: string[];
}
```

These eight definitions are mandatory in the normalized contract pack. Implementations MAY bind them
to already-existing equivalent domain types at G0.

---

