import {
  assertEditorialIntent,
  type EditorialIntentPlan,
} from "@smartspec/shared";

export function validateEditorialIntent(value: unknown): EditorialIntentPlan {
  const intent = assertEditorialIntent(value);
  for (const operation of intent.operations) {
    const payload = operation.payload ?? {};
    if (operation.type === "reframe" || operation.type === "camera") {
      const scale = payload.scale ?? payload.zoom;
      if (
        scale !== undefined &&
        (typeof scale !== "number" || scale < 0.5 || scale > 3)
      )
        throw new Error("GEOMETRY_UNSAFE");
    }
    if (
      operation.type === "audio_mix" &&
      payload.gainDb !== undefined &&
      (typeof payload.gainDb !== "number" ||
        payload.gainDb < -60 ||
        payload.gainDb > 12)
    )
      throw new Error("AUDIO_MIX_UNSAFE");
  }
  return intent;
}
