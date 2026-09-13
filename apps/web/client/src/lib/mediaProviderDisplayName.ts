export function formatMediaProviderDisplayName(providerName: unknown): string {
  const raw = String(providerName ?? "").trim();
  if (!raw) return "Other";

  const normalized = raw.toLowerCase().replace(/[\s.-]+/g, "_");
  const knownNames: Record<string, string> = {
    kie_ai: "Kie.ai",
    kie: "Kie.ai",
    fal_ai: "Fal.ai",
    fal: "Fal.ai",
    magnific: "Magnific",
    higgsfield: "Higgsfield",
    wavespeed_ai: "WaveSpeed",
    wavespeed: "WaveSpeed",
    byteplus_modelark: "BytePlus ModelArk",
    byteplus: "BytePlus ModelArk",
    knplabs: "KNPLabs",
    knplabai: "KNPLabs",
    elevenlabs: "ElevenLabs",
    eleven_labs: "ElevenLabs",
    omnivoice: "OmniVoice",
    hermes_grok: "Grok via Hermes",
  };

  return knownNames[normalized] ?? raw;
}

export function normalizeMediaProviderKey(providerName: unknown): string {
  return String(providerName ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_");
}
