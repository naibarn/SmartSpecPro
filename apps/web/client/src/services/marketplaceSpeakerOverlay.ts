import type { ObjectDetector } from "@mediapipe/tasks-vision";
import type { VerticalDramaDetectedShotPerson } from "@shared/verticalDramaSeries/speakerVisualBinding";

type Box = VerticalDramaDetectedShotPerson["boundingBox"];

// Google MediaPipe EfficientDet-Lite0 int8, version 1:
// https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite
const MODEL_PATH = "/models/efficientdet_lite0_int8_v1.tflite";
let detectorPromise: Promise<ObjectDetector> | undefined;

async function createDetector(): Promise<ObjectDetector> {
  const { FilesetResolver, ObjectDetector } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  return ObjectDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: "CPU" },
    runningMode: "IMAGE",
    categoryAllowlist: ["person"],
    scoreThreshold: 0.55,
  });
}

const clip = (value: number) => Math.max(0, Math.min(1, value));
const centerX = (box: Box) => box.x + box.width / 2;

export async function locateMarketplaceSpeakerOverlay(
  image: HTMLImageElement
): Promise<Box[]> {
  const source = image.currentSrc;
  detectorPromise ??= createDetector().catch(error => {
    detectorPromise = undefined;
    throw error;
  });
  const detector = await detectorPromise;
  const { naturalWidth, naturalHeight } = image;
  if (!source || source !== image.currentSrc || !naturalWidth || !naturalHeight) {
    return [];
  }

  return detector.detect(image).detections
    .map(({ boundingBox: b }) => {
      const x = clip(b.originX / naturalWidth);
      const y = clip(b.originY / naturalHeight);
      const right = clip((b.originX + b.width) / naturalWidth);
      const bottom = clip((b.originY + b.height) / naturalHeight);
      return { x, y, width: right - x, height: bottom - y };
    })
    .filter(box => box.width > 0 && box.height > 0);
}

export function matchMarketplaceSpeakerOverlay(
  people: readonly VerticalDramaDetectedShotPerson[],
  boxes: readonly Box[]
): Map<string, Box> | undefined {
  if (!people.length || boxes.length !== people.length) return;
  const roster = [...people].sort(
    (a, b) => centerX(a.boundingBox) - centerX(b.boundingBox)
  );
  const candidates = [...boxes].sort((a, b) => centerX(a) - centerX(b));

  // The saved roster uses horizontal ordering. Use it only when there is
  // one clear candidate per person and both sets have distinct positions.
  for (const [index, { boundingBox: previous }] of roster.entries()) {
    const next = candidates[index];
    if (
      Math.abs(centerX(previous) - centerX(next)) > 0.33 ||
      Math.min(previous.y + previous.height, next.y + next.height) <=
        Math.max(previous.y, next.y) ||
      (index > 0 &&
        (centerX(previous) - centerX(roster[index - 1].boundingBox) < 0.08 ||
          centerX(next) - centerX(candidates[index - 1]) < 0.08))
    ) {
      return;
    }
  }
  return new Map(roster.map((person, index) => [person.id, candidates[index]]));
}
