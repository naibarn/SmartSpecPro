/**
 * Image Prompt Engineer (v2.0)
 * Model-agnostic prompt builder with full generation mode support
 * Supports: text-to-image, image-to-image, inpaint, outpaint, variation
 */

const DEFAULT_AVOID = [
  "low-res, blurry, smeared detail",
  "over-smooth plastic skin, porcelain look",
  "warped anatomy, distorted face geometry",
  "AI artifacts, extra fingers, melted textures",
  "unwanted text, watermark, signature, logo",
  "explicit sexual content, fetish content, non-consensual content",
  "graphic gore, internal anatomy depiction",
];

/**
 * Validate inputs match the generation_mode
 */
function validateGenerationMode(payload) {
  const mode = payload.generation_mode || "text_to_image";
  const refImages = payload.reference_images || [];
  const mask = payload.edit_mask || {};
  const outpaint = payload.outpaint_config || {};
  
  if (mode === "image_to_image") {
    if (!refImages.length) {
      throw new Error("image_to_image mode requires at least one reference_image");
    }
  } else if (mode === "inpaint") {
    if (!refImages.length) {
      throw new Error("inpaint mode requires at least one reference_image");
    }
    if (!mask.segment_prompt || !mask.segment_prompt.trim()) {
      throw new Error("inpaint mode requires edit_mask with segment_prompt");
    }
  } else if (mode === "outpaint") {
    if (!refImages.length) {
      throw new Error("outpaint mode requires exactly one reference_image");
    }
    if (!outpaint || Object.keys(outpaint).length === 0) {
      throw new Error("outpaint mode requires outpaint_config");
    }
    const hasExpansion = (outpaint.expand_left || 0) > 0 ||
                        (outpaint.expand_right || 0) > 0 ||
                        (outpaint.expand_top || 0) > 0 ||
                        (outpaint.expand_bottom || 0) > 0;
    if (!hasExpansion) {
      throw new Error("outpaint mode requires at least one expand direction > 0");
    }
  }
}

/**
 * Build prompt for text-to-image mode
 */
function buildTextToImagePrompt(payload) {
  const request = payload.request || "";
  const style = payload.style || "";
  const vfx = payload.vfx || {};
  
  const lines = [];
  lines.push(`TEXT-TO-IMAGE: ${request}`);
  lines.push("");
  
  if (style && style !== "na") {
    lines.push(`Style: ${style}`);
  }
  
  if (vfx.effects && vfx.effects.length) {
    lines.push(`VFX Effects: ${vfx.effects.join(", ")}`);
  }
  
  lines.push("");
  lines.push("Technical requirements:");
  lines.push("- High detail and sharpness");
  lines.push("- Coherent lighting from single direction");
  lines.push("- Physically plausible shadows");
  lines.push("- No AI artifacts or distortions");
  
  return lines.join("\n");
}

/**
 * Build prompt for image-to-image mode
 */
function buildImageToImagePrompt(payload) {
  const request = payload.request || "";
  const refImages = payload.reference_images || [];
  const identityLock = payload.identity_lock || "none";
  const advParams = payload.advanced_params || {};
  
  const lines = [];
  lines.push(`IMAGE-TO-IMAGE TRANSFORMATION: ${request}`);
  lines.push("");
  
  lines.push(`Using ${refImages.length} reference image(s):`);
  refImages.forEach((ref, idx) => {
    const role = ref.role || "na";
    const notes = ref.notes || "";
    if (role !== "na") {
      lines.push(`  Image ${idx + 1}: ${role}${notes ? ` - ${notes}` : ""}`);
    }
  });
  
  lines.push("");
  
  if (identityLock === "soft_lock_person") {
    lines.push("IDENTITY PRESERVATION (Soft Lock - Person):");
    lines.push("- Preserve key facial landmarks (~90-95% similarity)");
    lines.push("- Allow lighting, shadow, and clarity adjustments");
    lines.push("- NO geometry or facial structure changes");
  } else if (identityLock === "strict_lock_product") {
    lines.push("IDENTITY PRESERVATION (Strict Lock - Product):");
    lines.push("- Maintain 100% geometry and structure");
    lines.push("- Preserve all product details exactly");
    lines.push("- Allow only lighting and environment changes");
  }
  
  lines.push("");
  const strength = advParams.denoising_strength || 0.75;
  lines.push(`Transformation strength: ${strength} (0=minimal change, 1=maximum change)`);
  
  return lines.join("\n");
}

/**
 * Build prompt for inpainting mode
 */
function buildInpaintPrompt(payload) {
  const request = payload.request || "";
  const mask = payload.edit_mask || {};
  
  const segmentPrompt = mask.segment_prompt || "";
  const preserveAreas = mask.preserve_areas || [];
  const feather = mask.feather || 10;
  
  const lines = [];
  lines.push(`INPAINTING TASK: ${request}`);
  lines.push("");
  
  if (segmentPrompt) {
    lines.push(`🎯 TARGET AREA: ${segmentPrompt.toUpperCase()}`);
    lines.push("");
  }
  
  if (preserveAreas.length) {
    lines.push("✋ PRESERVE EXACTLY (DO NOT MODIFY):");
    preserveAreas.forEach(area => lines.push(`  - ${area}`));
    lines.push("");
  }
  
  lines.push("🎨 EDITING INSTRUCTIONS:");
  lines.push("  - Modify ONLY the target area specified above");
  lines.push("  - Keep all other regions completely unchanged");
  lines.push("  - Blend seamlessly at boundaries");
  lines.push("  - Match lighting, color, and perspective with surrounding areas");
  lines.push("  - Maintain consistent style throughout the image");
  
  if (feather > 0) {
    lines.push(`  - Soft edge transition: ${feather}px feather`);
  }
  
  return lines.join("\n");
}

/**
 * Build prompt for outpainting mode
 */
function buildOutpaintPrompt(payload) {
  const request = payload.request || "";
  const outpaint = payload.outpaint_config || {};
  
  const expandLeft = outpaint.expand_left || 0;
  const expandRight = outpaint.expand_right || 0;
  const expandTop = outpaint.expand_top || 0;
  const expandBottom = outpaint.expand_bottom || 0;
  const matchStyle = outpaint.match_style !== false;
  
  const lines = [];
  lines.push(`OUTPAINTING TASK: ${request}`);
  lines.push("");
  
  lines.push("📐 EXPANSION CONFIGURATION:");
  if (expandLeft > 0) lines.push(`  - Expand LEFT: ${expandLeft}px`);
  if (expandRight > 0) lines.push(`  - Expand RIGHT: ${expandRight}px`);
  if (expandTop > 0) lines.push(`  - Expand TOP: ${expandTop}px`);
  if (expandBottom > 0) lines.push(`  - Expand BOTTOM: ${expandBottom}px`);
  
  lines.push("");
  lines.push("🎨 OUTPAINTING INSTRUCTIONS:");
  lines.push("  - Generate natural continuation of the scene in expanded areas");
  lines.push("  - Maintain perspective and vanishing points from original image");
  
  if (matchStyle) {
    lines.push("  - Match the artistic style of the original image");
    lines.push("  - Match lighting direction and color temperature");
    lines.push("  - Match detail level and texture quality");
  }
  
  lines.push("  - Blend seamlessly at boundaries between original and extended areas");
  lines.push("  - Keep the original image region completely unchanged");
  
  return lines.join("\n");
}

/**
 * Main prompt building function
 */
function buildPrompts(payload) {
  try {
    validateGenerationMode(payload);
  } catch (error) {
    return {
      error: error.message,
      prompt: "",
      avoid: [],
      detail_level: "standard"
    };
  }
  
  const genMode = payload.generation_mode || "text_to_image";
  const request = (payload.request || "").trim();
  
  if (!request) {
    return {
      error: "Missing required field: request",
      prompt: "",
      avoid: [],
      detail_level: "standard"
    };
  }
  
  let modePrompt;
  if (genMode === "text_to_image") {
    modePrompt = buildTextToImagePrompt(payload);
  } else if (genMode === "image_to_image") {
    modePrompt = buildImageToImagePrompt(payload);
  } else if (genMode === "inpaint") {
    modePrompt = buildInpaintPrompt(payload);
  } else if (genMode === "outpaint") {
    modePrompt = buildOutpaintPrompt(payload);
  } else if (genMode === "variation") {
    modePrompt = buildImageToImagePrompt(payload);
  } else {
    modePrompt = buildTextToImagePrompt(payload);
  }
  
  const lines = [modePrompt];
  
  // Realistic skin
  if (payload.realistic_skin) {
    lines.push("");
    lines.push("REALISTIC SKIN PRESERVATION:");
    lines.push("- Preserve natural pores and micro-texture");
    lines.push("- Show subtle skin tone variation");
    lines.push("- Include natural imperfections (freckles, fine lines)");
    lines.push("- Avoid over-smoothing or plastic-looking skin");
  }
  
  // Text on image
  if (payload.text_on_image) {
    const headline = payload.headline || "";
    const bodyText = payload.body_text || "";
    if (headline || bodyText) {
      lines.push("");
      lines.push("TEXT ON IMAGE:");
      if (headline) lines.push(`  Headline: "${headline}"`);
      if (bodyText) lines.push(`  Body: "${bodyText}"`);
      lines.push("  - Text should be clear and readable");
      lines.push("  - Integrate naturally with the composition");
    }
  }
  
  // Aspect ratio
  const arCustom = (payload.aspect_ratio_custom || payload.aspectRatioCustom || "").trim();
  const ar = arCustom || payload.aspect_ratio || payload.aspectRatio || "9:16";
  lines.push("");
  lines.push(`Aspect ratio: ${ar}`);
  
  // Platform
  const targetPlatform = payload.target_platform || "generic";
  if (targetPlatform !== "generic") {
    lines.push(`Target platform: ${targetPlatform}`);
  }
  
  const promptEn = lines.join("\n");
  
  // Detail level
  let detailLevel = (payload.detail_level || "standard").toLowerCase();
  if (!["compact", "standard", "full"].includes(detailLevel)) {
    detailLevel = "standard";
  }
  
  const result = {
    prompt: promptEn,
    avoid: [...DEFAULT_AVOID],
    detail_level: detailLevel,
    task: payload.task || "final_prompt",
    generation_mode: genMode,
    target_platform: targetPlatform,
  };
  
  // Parameters
  if (detailLevel === "standard" || detailLevel === "full") {
    const advParams = payload.advanced_params || {};
    const params = {
      aspect_ratio: ar,
      generation_mode: genMode,
    };
    
    if (advParams.denoising_strength !== undefined) {
      params.denoising_strength = advParams.denoising_strength;
    }
    if (advParams.guidance_scale !== undefined) {
      params.cfg_scale = advParams.guidance_scale;
    }
    if (advParams.steps !== undefined) {
      params.steps = advParams.steps;
    }
    if (advParams.seed !== undefined && advParams.seed !== -1) {
      params.seed = advParams.seed;
    }
    if (advParams.sampler) {
      params.sampler = advParams.sampler;
    }
    
    result.parameters = params;
  }
  
  // Breakdown for full mode
  if (detailLevel === "full") {
    const style = payload.style || "";
    const breakdown = {
      generation_mode: genMode,
      subject: request,
      style: style && style !== "na" ? style : "photorealistic (default)",
    };
    
    if (genMode === "inpaint") {
      const mask = payload.edit_mask || {};
      breakdown.target_area = mask.segment_prompt || "";
      breakdown.preserve_areas = mask.preserve_areas || [];
    }
    
    if (genMode === "outpaint") {
      const outpaint = payload.outpaint_config || {};
      breakdown.expansion = {
        left: outpaint.expand_left || 0,
        right: outpaint.expand_right || 0,
        top: outpaint.expand_top || 0,
        bottom: outpaint.expand_bottom || 0,
      };
    }
    
    result.breakdown = breakdown;
  }
  
  return result;
}

/**
 * Entry point for skill execution
 */
function run(inputData) {
  return buildPrompts(inputData);
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { run, buildPrompts };
}

// Export for browser
if (typeof window !== 'undefined') {
  window.ImagePromptEngineer = { run, buildPrompts };
}
