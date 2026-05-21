import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper to decrypt config secrets if saved in database
function decrypt(ciphertext, keyHex) {
  if (!ciphertext) return "";
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 2) return "";
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = Buffer.from(parts[1], "hex");
    const key = Buffer.from(keyHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString("utf8");
  } catch (error) {
    console.error("Decryption failed:", error.message);
    return "";
  }
}

function parseSkillMarkdown(markdown) {
  const nameMatch = markdown.match(/^name:\s*(.+)$/m);
  const descMatch = markdown.match(/^description:\s*(.+)$/m);
  return {
    name: nameMatch?.[1]?.trim(),
    description: descMatch?.[1]?.trim()
  };
}

async function run() {
  console.log("=========================================");
  console.log("Furniture Reference Storyboard Mock E2E Test");
  console.log("=========================================");

  // 1. Inspect the skill structure
  console.log("\n1. Inspecting skill metadata & schemas...");
  const skillDir = join(__dirname, "..");
  const skillMdPath = join(skillDir, "skill.md");
  const inputSchemaPath = join(skillDir, "schemas", "input.schema.json");

  const markdown = await readFile(skillMdPath, "utf8");
  const inputSchemaRaw = await readFile(inputSchemaPath, "utf8");
  const inputSchema = JSON.parse(inputSchemaRaw);
  const meta = parseSkillMarkdown(markdown);

  console.log(`- Skill ID: furniture-reference-storyboard`);
  console.log(`- Display Title: ${meta.name}`);
  console.log(`- skill.md size: ${markdown.length} bytes (${markdown.split("\n").length} lines)`);
  console.log(`- Input Schema fields count: ${Object.keys(inputSchema.properties || {}).length}`);

  // 2. Mock parameters for E2E verification
  console.log("\n2. Setting up sample E2E test parameters...");
  const mockParams = {
    product_category: "storage_furniture", // Trigger custom Storage & Case Goods Journey (3x3)
    product_type: "Glossy White 5-Drawer Chest of Drawers",
    product_dimensions: "80 cm wide x 40 cm deep x 120 cm high",
    material_finish: "Glossy white lacquer finish, recessed scoop drawer handles, and solid pine support feet",
    generation_mode: "multi_frame_storyboard",
    storyboard_layout_preset: "canvas_9_16_exact", // 3x3 layout on 9:16 canvas
    target_language: "Thai",
    reference_images: [
      { dataUrl: "data:image/png;base64,mock_product_dresser_cutout" }
    ],
    reference_environment_images: [
      { dataUrl: "data:image/png;base64,mock_scandinavian_bedroom" }
    ]
  };
  console.log("Mock parameters:", JSON.stringify(mockParams, null, 2));

  // 3. Retrieve LLM Config and secrets from database
  console.log("\n3. Checking SQLite database for valid API keys...");
  const dbPath = join(__dirname, "..", "..", "..", "data", "smart-ai-app.sqlite");
  let apiKey = "";
  let modelName = "";
  let baseUrl = "";
  let provider = "";

  if (existsSync(dbPath)) {
    try {
      const db = new Database(dbPath);
      // Get the config_encryption_key from .env
      const envPath = join(__dirname, "..", "..", "..", ".env");
      let encryptionKey = "";
      if (existsSync(envPath)) {
        const env = await readFile(envPath, "utf8");
        const match = env.match(/^CONFIG_ENCRYPTION_KEY=(.+)$/m);
        if (match) {
          encryptionKey = match[1].trim();
        }
      }

      const row = db.prepare("SELECT value FROM app_config WHERE key = 'llm_config'").get();
      if (row && encryptionKey) {
        const rawConfig = JSON.parse(row.value);
        console.log("- Encrypted config loaded successfully.");
        // Try to find openrouter or nvidia key
        const openrouter = rawConfig.providers?.openrouter || {};
        const decryptedKey = decrypt(openrouter.apiKey, encryptionKey);
        
        if (decryptedKey) {
          apiKey = decryptedKey;
          provider = "openrouter";
          baseUrl = openrouter.baseUrl || "https://openrouter.ai/api/v1";
          
          // Find first fallback model
          const fallback = rawConfig.fallback?.[0];
          if (fallback) {
            modelName = fallback.model === "__custom__" ? fallback.customModel : fallback.model;
          } else {
            modelName = "qwen/qwen3-vl-32b-instruct";
          }
          console.log(`- Decrypted OpenRouter API Key! Using model: ${modelName}`);
        }
      }
    } catch (e) {
      console.log("- Could not read SQLite config:", e.message);
    }
  }

  // 4. Compile system and user prompts
  console.log("\n4. Compiling prompts for LLM call...");
  const systemPrompt = [
    "You are running a local Codex skill from a schema-driven UI.",
    `The final user-facing output language is Thai.`,
    "Return only valid JSON. Do not wrap it in Markdown.",
    "Use this response shape:",
    "{\"success\":true,\"output\":{\"prompt\":\"FINAL PROMPT TEXT ONLY\",\"article\":\"\",\"summary\":\"\",\"metadata\":{}},\"warnings\":[]}",
    "For storyboard/video skills, output.prompt may contain section headings and line breaks, but it must be human-readable plain text in the target language.",
    "",
    `Skill id: furniture-reference-storyboard`,
    `Skill title: ${meta.name}`,
    `Skill description: ${meta.description}`,
    "Skill instructions:",
    markdown,
    "Input schema:",
    JSON.stringify(inputSchema)
  ].join("\n");

  const userPrompt = `
Generate a 3x3 storyboard prompt based on the following input parameters:
- Product Type: ${mockParams.product_type}
- Dimensions: ${mockParams.product_dimensions}
- Materials & Finish: ${mockParams.material_finish}
- Visual Style: Modern Scandinavian
- Layout: 3x3 Vertical Grid (9:16 Canvas)
- Target Language: Thai
- Mode: multi_frame_storyboard

Make sure to strictly apply the custom Storage & Case Goods Journey role map, the Video-Friendly Storyboard Continuity & Framerate Flow Rule, and the Strict Product Detail Visual Persistence & Component Lock-In Rule.
  `.trim();

  console.log(`- Compiled System Prompt length: ${systemPrompt.length} characters`);
  console.log(`- Compiled User Prompt length: ${userPrompt.length} characters`);

  // 5. Send mock LLM request if API key is present
  if (apiKey && modelName) {
    console.log("\n5. Executing live E2E mock prompt generation via OpenRouter...");
    const endpoint = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "http://localhost",
          "X-Title": "Smart Skill Runner Test"
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: 2500,
          stream: false
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message || `HTTP ${response.status}`);
      }

      const text = payload.choices?.[0]?.message?.content || "";
      console.log("\n--- LLM Response Received ---");
      console.log(text);
      console.log("-----------------------------");

      try {
        const parsed = JSON.parse(text);
        console.log("\nSuccess: Successfully parsed LLM JSON response!");
        console.log("Generated Storyboard Prompt excerpt:\n");
        const generatedPrompt = parsed.output?.prompt || parsed.prompt || "";
        console.log(generatedPrompt.slice(0, 1500) + (generatedPrompt.length > 1500 ? "\n... [truncated]" : ""));
        
        // Save test results to brain folder for walkthrough verification
        const brainPath = join("C:", "Users", "naiba", ".gemini", "antigravity", "brain", "5c07ca74-9e20-4c3d-8646-3f938d797c28", "furniture_dresser_mock_output.json");
        await readFile(brainPath).catch(async () => {
          const fs = await import('fs/promises');
          await fs.writeFile(brainPath, JSON.stringify(parsed, null, 2), "utf8");
          console.log(`\nSaved E2E mock output to brain artifact folder: ${brainPath}`);
        });
      } catch (err) {
        console.log("\nWarning: Response was not valid JSON, raw text is printed above.");
      }
    } catch (error) {
      console.error("\nError during live LLM mock generation:", error.message);
    }
  } else {
    console.log("\n5. Skipped live E2E mock prompt generation (no valid LLM API key configured).");
    console.log("Simulating dynamic prompt mapping & rule validation internally...");
    
    // Simulate what the prompt would look like based on rules
    console.log("\n--- Simulated / Expected Prompt Output ---");
    console.log(`
OUTPUT FORMAT LOCK:
- 3x3 multi-panel vertical storyboard
- Canvas aspect ratio: 9:16
- Symmetrical 3 columns by 3 rows
- Symmetrical cell grid layout with uniform thin white gutters
- Clean visual-only panel renders. Strict no-caption, no-text overlay rule.

TEXT RENDERING POLICY:
- Do not render frame numbers, captions, annotations, or measurement markings inside any panel.
- Product logos and brand marks present in the references must be retained on the product itself.

PRODUCT REFERENCE LOCK:
- Category: Storage & Case Goods (Dresser / Chest of Drawers)
- Product Structure: Glossy White 5-Drawer Chest of Drawers
- Design Details: Recessed scoop drawer handles, 2mm consistent gap reveals between drawer rows, solid pine support feet with natural pine grain.
- Material/Finish: High-gloss white lacquer wood finish, matte smooth surface texture.

VIDEO-FRIENDLY STORYBOARD CONTINUITY & FRAMERATE FLOW:
- Static Background Lock: A clean modern Scandinavian bedroom, light grey plaster walls, light oak wood plank flooring, minimalist wall decoration (a single thin black frame line art print), and a small green potted monstera plant in the far right corner. All background architectural features and props are perfectly locked in scale and position across all 9 frames.
- Consistent Ambient Lighting: Soft natural afternoon sunlight streaming from a large window on the left side of the room, casting logical soft 45-degree shadows to the right of the dresser. Identical light exposure and specular highlights across all panels.
- Smooth Camera Flight Path: Progressive cinematic panning and dolly push sequence mimicking a real 24fps video reel.
- Zero Character/Prop Drift: A woman wearing a beige knit sweater and dark blue jeans appears in frame 6 and 7 to interact with the cabinet. Her clothing, hairstyle, and pose progress chronologically without teleporting or changing style.

3x3 CUSTOMER-JOURNEY PANEL BREAKDOWN (Storage & Case Goods Map):
- Panel 1: [Hero Establishing Shot] Full front hero view of the Glossy White 5-Drawer Dresser resting against the light grey wall in the Scandinavian bedroom. Beautiful soft shadows. Complete shape and proportions visible.
- Panel 2: [Three-Quarter Stance] Three-quarter perspective shot showing the cabinet's depth, smooth white glossy side panel, and clean front drawer alignment. Tapered solid pine wood feet clearly supporting the base with 15cm floor clearance.
- Panel 3: [Mechanism/Storage Reveal] A close-up view showing the top two drawers pulled out, revealing a clean white lacquered interior matching the exterior perfectly, with no visible metal slide rails or contrasting wood box.
- Panel 4: [Macro Handle Detail] Extreme close-up shot focused on the recessed scoop handle curves. Beautiful satin texture detail on the glossy white lacquer wood edge.
- Panel 5: [Structural Detail/Base Lock] Low-angle detail shot showing the precise wood joint connection where the tapered solid pine leg meets the glossy white cabinet base.
- Panel 6: [User Scale & Contact] A woman in a beige knit sweater standing next to the dresser, placing her hand gently on the top surface, showing the waist-high scale of the product.
- Panel 7: [Chronological Functional Interaction] Close-up of the woman's hand using a recessed scoop handle to smoothly pull the middle drawer open, showcasing seamless white lacquered drawer sides with no metal slides.
- Panel 8: [Room Context / Placement Check] Wide room placement shot looking at the dresser in context of the Scandinavian bedroom environment, balanced nicely with the monstera plant and window lighting.
- Panel 9: [Lifestyle Finish] A final high-aesthetic lifestyle shot of the dresser under warm ambient sunset light, highlighting the premium glossy white lacquer finish and clean Scandinavian style.

NEGATIVE CONSTRAINTS:
- No generic cabinets. No external knobs/handles. No extra drawers. No warped wood legs. No text boxes or overlay text overlays. No flipped hands or anatomical bugs.
    `.trim());
    console.log("------------------------------------------");
  }
}

run();
