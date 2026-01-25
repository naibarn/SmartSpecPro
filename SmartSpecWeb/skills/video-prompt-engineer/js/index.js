/**
 * Video Prompt Engineer v1.0 - JavaScript Implementation
 */

const PLATFORM_SPECS = {
  sora: { duration: [4, 20], charLimit: null, textOverlay: true },
  veo: { duration: [4, 8], charLimit: 500, textOverlay: false },
  kling: { duration: [5, 10], charLimit: null, textOverlay: true },
  wan: { duration: [4, 15], charLimit: null, textOverlay: true },
  seedance: { duration: [4, 12], charLimit: null, textOverlay: true },
  compatible: { duration: [4, 60], charLimit: null, textOverlay: true }
};

function buildPrompt(payload) {
  const request = payload.request || "";
  const platform = payload.target_platform || "compatible";
  const duration = payload.duration || 8;
  const aspectRatio = payload.aspect_ratio || "9:16";
  
  let prompt;
  if (platform === "veo") {
    prompt = buildVeoPrompt(payload);
  } else if (platform === "sora") {
    prompt = buildSoraPrompt(payload);
  } else {
    prompt = buildUniversalPrompt(payload);
  }
  
  return {
    prompt,
    platform,
    metadata: {
      duration,
      aspect_ratio: aspectRatio,
      language: payload.language || "en"
    }
  };
}

function buildSoraPrompt(payload) {
  const request = payload.request;
  const camera = payload.camera_movement || "tracking";
  const lighting = payload.lighting_style || "natural";
  const style = payload.cinematic_style || "cinematic";
  
  let prompt = `${style.charAt(0).toUpperCase() + style.slice(1)} ${camera} shot. ${request}. `;
  prompt += `Shot with ${lighting} lighting. `;
  prompt += "Professional cinematography, high production value.";
  
  return prompt;
}

function buildVeoPrompt(payload) {
  const request = payload.request;
  const camera = payload.camera_movement || "static";
  
  let prompt = `Camera ${camera}. ${request}.`;
  
  if (prompt.length > 500) {
    prompt = prompt.substring(0, 497) + "...";
  }
  
  return prompt;
}

function buildUniversalPrompt(payload) {
  const request = payload.request;
  const style = payload.visual_style || "cinematic";
  const camera = payload.camera_movement || "dynamic";
  const lighting = payload.lighting_style || "natural";
  
  let prompt = `A ${style} video with ${camera} camera movement. ${request}. `;
  prompt += `Filmed with ${lighting} lighting and professional production quality.`;
  
  return prompt;
}

module.exports = { buildPrompt };
