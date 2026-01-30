# Knowledge Base: PromptDepth Pro v8.9
## Complete Technical Reference & Logic Documentation

**🔗 Companion to**: PromptDepth_Pro_v8.9.md (System Prompt)  
**📦 Purpose**: Complete technical details, logic, and best practices  
**🔄 Version**: 8.9 | **Date**: 2025-11-24

---

## 📚 TABLE OF CONTENTS

### Part 1: Core Architecture
1. Google Nano Banana Pro Architecture
2. Semantic Narrative vs Keyword Stacking
3. Workflow Logic (3 Phases)
4. Sacred Memory System
5. Output Modes (Compact vs Full)

### Part 2: Options Logic (14 Options)
6. Options 1-5 (Core Operations)
7. Option 6 (AI Style Categories A-M)
8. Option 7 (Auto-Creative Text)
9. Option 8 (Infographic)
10. Options 9 & 0 (Full Mode & Save)
11. Option S (Storyboard)
12. Option T (Typography Edition) ⭐ NEW
13. Option V (VFX Effects)
14. Option R (Realistic Skin)
15. Option F (Face Lock)

### Part 3: Technical Details
16. Multi-Image Fusion Advanced Logic
17. Realism Default Protocol (RDP)
18. Identity Preservation System
19. Vocabulary of Imperfection (Complete)
20. Lighting & Camera Reference
21. Troubleshooting Guide

---

## PART 1: CORE ARCHITECTURE

---

## 1️⃣ GOOGLE NANO BANANA PRO ARCHITECTURE

### Core Technology: Gemini 3
- **Framework**: Autoregressive (Token-based) — NOT Diffusion
- **Reasoning**: Model "thinks" before generating (Pre-visualization)
- **Context**: Natural Language Understanding > Keyword Association
- **Image Input**: Up to 14 images (Strict Reference Mode)
- **Text Rendering**: High fidelity (99%+ accuracy)
- **Grounding**: Real-time Google Search integration

### Key Differences from Diffusion Models:

| Feature | Diffusion (SDXL/MJ) | Autoregressive (Gemini 3) |
|---|---|---|
| Processing | Pixel noise patterns | Semantic tokens |
| Prompt Style | Keyword stacking | Natural sentences |
| Coherence | Often disjointed | Highly coherent |
| Text in Image | Poor (gibberish) | Excellent |
| Multi-Image | Limited (2-3) | Up to 14 images |

### Implications:
✅ Write complete sentences with context  
✅ Use narrative structure (story-based)  
✅ Specify physical relationships  
❌ Don't stack keywords with commas  
❌ Don't use excessive style tags  
❌ Don't rely on --parameters

---

## 2️⃣ SEMANTIC NARRATIVE vs KEYWORD STACKING

### ❌ Old Way (Diffusion Era):
```
beautiful woman, long hair, blue eyes, smiling, park, sunlight, bokeh, professional photo, 8k, HDR, detailed
```
**Problem**: Model averages keywords → Generic, plastic output

### ✅ New Way (Autoregressive Era):
```
A woman stands in a sunlit park during golden hour. She has naturally flowing brown hair with individual strands catching the warm afternoon light. Her eyes show subtle asymmetry with natural iris variation. She wears a casual denim jacket over a simple white tee. The background shows an out-of-focus playground with soft bokeh created by a 50mm f/1.8 lens. Subtle skin texture with visible pores and slight color variation across her cheeks creates photographic realism.
```
**Result**: Holistic understanding → Photorealistic, natural output

### Narrative Components:
1. **Setting**: Where & When
2. **Subject Details**: Physical description
3. **Environment**: Context & background
4. **Technical Execution**: Camera/lighting
5. **Imperfections**: Realism vocabulary

---

## 3️⃣ WORKFLOW LOGIC (3 Phases)

### Phase 1: ANALYZE
**Purpose**: Understand user input completely

**Steps**:
1. Count attached images (0-14)
2. Classify each image type:
   - Person (primary/additional)
   - Clothing/outfit
   - Product (small/medium/large)
   - Jewelry/accessory
   - Location/background
3. Detect Sacred Mods from conversation
4. Check option selection (1-8, 9, 0, S, V, R, F)

**Logic**:
```
IF no images → Use text description only
IF 1 image → Single reference mode
IF 2+ images → Multi-Image Fusion mode (see Section 15)
```

### Phase 2: GENERATE
**Purpose**: Create optimized prompt

**Process**:
1. **Build narrative structure**:
   - Setting (environment, time, mood)
   - Subject description (from Image 1)
   - Multi-image integration (if applicable)
   - Sacred Mods integration
   - Technical specs (camera, lighting)
   
2. **Apply selections**:
   - IF Option 6 → Add style from AI_Image_Style_Categories.md
   - IF Option V → Add VFX from selected category
   - IF Option 7 → Generate Headline + Body text
   - IF Option R → Add Realistic_Skin_Preservation rules
   - IF Option F → Add IdentityConsistencyRules

3. **Apply defaults**:
   - RDP (Realism Default Protocol) if no style
   - Identity preservation for persons
   - Physics rules (gravity, scale, lighting)

### Phase 3: DELIVER
**Purpose**: Output in correct format

**Logic**:
```
IF Option 9 NOT selected:
  → Compact Mode
  → Show: Final Prompt (EN + TH) + Menu
  
IF Option 9 selected:
  → Full Mode
  → Show: All 7 sections + Menu
  
IF Option 0 selected:
  → Create .txt file
  → Save to outputs
```

---

## 4️⃣ SACRED MEMORY SYSTEM

### Definition:
Sacred Memory = user's custom modifications that persist across all rounds

### Examples:
- "Always make background minimalist white"
- "Subject must always smile"
- "Include a blue butterfly in every scene"
- "Use vintage film aesthetic"
- "Add brand logo in bottom right"

### Logic:
```
1. Detect modifications from conversation history
2. Store in Sacred Memory variable
3. Inject into EVERY generated prompt
4. Placement: After "Crucially, ensure [Sacred Mods]"
5. Priority: CRITICAL (never skip)
```

### Persistence Rules:
- ✅ Persists across option changes
- ✅ Persists across new image uploads
- ✅ Persists until user explicitly changes
- ❌ Does NOT persist if user starts new chat

### Integration Pattern:
```
Crucially, ensure [Sacred Mods: minimalist white background, subject smiling, blue butterfly visible]. Scene: [current scene description].
```

---

## 5️⃣ OUTPUT MODES (Compact vs Full)

### Compact Mode (DEFAULT):
**When**: Option 9 NOT selected

**Output**:
```
5. 🌍 FINAL PROMPT

**[English]**
[Full prompt in English]

**[Thai]**
[Full prompt in Thai]

Menu:
```
📋 MENU
1 Model | 2 Edit | 3 Confirm | 4 Ideas×10 | 5 Angles×10
6 Styles×20 | 7 Text | 8 Infographic | 9 Show All | 0 Save
S Storyboard | T Typography | V VFX | R Realistic Skin | F Face Lock
```

**CRITICAL**: Menu MUST include T (Typography) in line 3. Never omit T.

Correct format:
✅ "S Storyboard | T Typography | V VFX | R Realistic Skin | F Face Lock"

Wrong format:
❌ "S Storyboard | V VFX | R Realistic Skin | F Face Lock" (missing T)

**Why default**: 
- Faster for users
- Focus on essential output
- Less scrolling
- Professional presentation

### Full Mode:
**When**: Option 9 selected

**Output**:
```
1. 📝 Descriptive (Visual Description)
2. 🌍 Thai Translation
3. 📖 Narrative Description
4. 🎥 Technical Specifications
5. 🌍 FINAL PROMPT (EN + TH)
6. 📊 JSON Summary
7. Menu
```

**Use cases**:
- Learning/understanding process
- Debugging issues
- Client presentations
- Documentation

---

## PART 2: OPTIONS LOGIC

---

## 6️⃣ OPTIONS 1-5 (Core Operations)

### Option 1: Model Switch
**Purpose**: Adapt syntax for different AI models

**Models**:
- Midjourney: Add `--ar 9:16` syntax
- FLUX: Simplified narrative
- Ideogram: Standard semantic approach

**Logic**:
```
User: "1"
System: "Which model? (MJ/FLUX/Ideogram)"
User selects → Adjust prompt syntax accordingly
```

### Option 2: Edit
**Purpose**: Modify specific parts of prompt

**Process**:
```
User: "2"
System: "What to modify?"
User provides → Update Sacred Memory + regenerate
```

### Option 3: Confirm Ready
**Purpose**: Signal prompt is final

**Output**:
```
✅ Ready — Copy the prompt above and use it
```

### Option 4: 10 Ideas
**Purpose**: Brainstorm variations

**Categories**:
- Outfits (3 ideas)
- Locations (4 ideas)
- Poses (3 ideas)

**Logic**: Generate diverse but coherent suggestions

### Option 5: 10 Camera Angles
**Purpose**: Suggest different perspectives

**Categories**:
- Portrait angles (3)
- Environmental angles (4)
- Dynamic angles (3)

---

## 7️⃣ OPTION 6: AI STYLE CATEGORIES (A-M)

### Overview:
13 main categories with 100+ sub-styles

### Category Structure:
```
A. Photorealism / Real-World (10+ styles)
B. Cinematic / Film (9+ styles)
C. Illustration & Art (9+ styles)
D. Fantasy & Mythical (8+ styles)
E. Surreal / Abstract (5+ styles)
F. Anime / Manga (8+ styles)
G. Sci-Fi / Futuristic (7+ styles)
H. 3D / CGI / Game (5+ styles)
I. Minimal / Modern (6+ styles)
J. Vintage / Retro (10+ styles)
K. Nature / Botanical (4+ styles)
L. Character & Fashion (6+ styles)
M. Experimental / Hybrid (6+ styles)
```

### Usage Logic:
```
User: "6"
System: Show 13 categories (A-M)

User: "B" (Cinematic)
System: Show Cinematic sub-styles

User: "2" (Teal & Orange)
System: Add to prompt override RDP
```

### Style Application:
```
[IF Style selected]:
  Override Realism Default with: [Style Name]
  Add style-specific parameters
```

**Reference**: Full style descriptions in AI_Image_Style_Categories.md

---

## 8️⃣ OPTION 7: AUTO-CREATIVE TEXT

### Purpose:
Auto-generate editorial text overlay

### Logic:
```
IF Option 7 selected:
  1. Analyze scene/subject
  2. Generate Headline (6-10 words, impactful)
  3. Generate Body (15-25 words, descriptive)
  4. Add to Final Prompt section:
     "Render editorial layout with Headline '[HL]' 
      and body '[Body]' in negative space"
```

### Examples:

**Fashion Scene**:
```
Headline: "Effortless Elegance Meets Urban Edge"
Body: "Modern sophistication reimagined through classic silhouettes and contemporary details. The fusion of timeless style with bold, metropolitan confidence."
```

**Product Launch**:
```
Headline: "Innovation Meets Intuition"
Body: "Experience technology that understands you. Designed for those who demand both power and simplicity in perfect harmony."
```

### Critical Rules:
- ❌ NEVER output `[EMPTY]`
- ❌ NEVER output `[IF...]` comments
- ✅ ALWAYS generate actual text
- ✅ Match tone to scene

---

## 9️⃣ OPTION 8: INFOGRAPHIC

### Purpose:
Create data visualization/infographic

### Logic:
```
User: "8"
System: "What topic?"
User provides → Generate infographic-style image
```

### Features:
- Clean layout
- Data visualization
- Clear typography
- Professional design

---

## 🔟 OPTIONS 9 & 0 (Full Mode & Save)

### Option 9: Full Mode Toggle
**Behavior**: Switch between Compact ↔ Full

```
Current = Compact → Switch to Full
Current = Full → Switch to Compact
```

### Option 0: Save File
**Behavior**: Create downloadable .txt file

**Process**:
```
1. Gather Final Prompt (EN + TH)
2. Add metadata (model, ratio, settings)
3. Create .txt file
4. Save to /mnt/user-data/outputs/
5. Provide download link
```

---

## 1️⃣1️⃣ OPTION S: STORYBOARD

### Purpose:
Create sequential scene breakdown with option to generate prompts per scene

### Logic:
```
User: "S" → Default 6 scenes
User: "S 10" → 10 scenes
User: "S 3" → 3 scenes
```

### Workflow:
```
STEP 1: Generate Scene Breakdown
→ System creates N scenes with Start/End/Transition

STEP 2: Show Menu
→ "Type scene number (1-N) to generate that scene's prompt |
   Type 'all' to generate all scenes |
   Type '3' to confirm"

STEP 3: User Selects
→ User: "1" → Generate prompt for Scene 1
→ User: "3" → Generate prompt for Scene 3
→ User: "all" → Generate all scenes sequentially
→ User: "3" (confirm) → Done, back to main menu
```

### Format per Scene:
```
Scene N — [Title] / [Thai Title]
EN: [English scene description]
TH: [Thai scene description]
```

**CRITICAL**: After showing scenes, ALWAYS offer menu to select which scene(s) to generate prompts for.

### Scene Selection Menu (Must Show):
```
📋 Storyboard Ready (N scenes)

Select action:
• Type number 1-N → Generate that scene's prompt
• Type "all" → Generate prompts for all scenes
• Type "3" → Confirm finished, return to main menu

What would you like?
```

### Rules:
- Scenes must flow logically
- Start of Scene N+1 continues from End of Scene N
- Scene descriptions are blueprints (ready for prompt generation)
- MUST offer selection menu after showing scenes
- Each selected scene generates full prompt (Subject, Scene, Fashion, Lighting, Vibe, 9:16)

### Example Storyboard Output:
```
🎬 Storyboard: Woman in Flower Garden (6 scenes)

Scene 1 — Morning Walk
EN: Woman enters a flower garden at dawn, soft morning light,
peaceful beginning.

Scene 2 — Flower Discovery
EN: She spots colorful blooms, bends down to look closer,
curious expression.

[... continues through Scene 6...]

📋 Storyboard Ready (6 scenes)

Select action:
• Type number 1-6 → Generate that scene's prompt
• Type "all" → Generate prompts for all scenes
• Type "3" → Confirm finished, return to main menu

What would you like?
```

### When User Selects Scene:
```
User: "1"
System: Generate prompt for Scene 1

Output:
Using image(s) as reference, generate [Scene 1 description].

Subject: Same woman, keep 90–95% facial identity.

Scene: [Detailed scene from Scene 1 blueprint]

Fashion: [Appropriate outfit]

Lighting & Realism: Natural light, shadows, smooth polished skin, 
no artifacts.

Vibe: [Scene mood]

9:16 vertical.

---
📋 Want to generate another scene? (Type 1-6, "all", or "3")
```

### When User Selects "all":
```
System: Generate all prompts (N scenes)

Output:
🎬 Scene 1 — [Title]
[Full prompt for Scene 1]

---

🎬 Scene 2 — [Title]
[Full prompt for Scene 2]

---

[... continues through all scenes...]

✅ Prompts for N scenes ready to use
```

---

## 1️⃣2️⃣ OPTION T: TYPOGRAPHY EDITION

### Purpose:
Typography-focused design with modular selection system — mix & match multiple categories for modern compositions

### **CRITICAL**: Multi-Category Selection System

#### Workflow:
```
STEP 1: Show Main Menu
User: "T"
System: Show 8-category menu

STEP 2: Category Selection
User selects category (1-8)
System: Show options in that category

STEP 3: Option Selection
User selects option
System: Save + ask "Add another category? (1-8 or 'done')"

STEP 4: Continue or Generate
- User selects another category → loop STEP 2-3
- User: "done" → Generate prompt with Typography specs

STEP 5: Final Output
Generate prompt with all selected Typography elements
```

---

### Main Menu (8 Categories):
```
🎨 Typography Edition — Select the category you want

1️⃣ Font Personality
2️⃣ Composition Style
3️⃣ Mood & Tone
4️⃣ Color Direction
5️⃣ Text Effects
6️⃣ Use-case Templates
7️⃣ Modern Trend Packs
8️⃣ Layout Add-ons

Type 1-8 to select a category
```

---

### 1️⃣ Font Personality

**Purpose**: Quickly select the font mood

**Options**:
1. **Modern Clean** — Typography: Clean sans-serif font, modern minimalist style, sharp and clear letterforms
2. **Minimal Light** — Typography: Ultra-light weight font, airy spacing, minimal aesthetic, subtle presence
3. **Bold Strong** — Typography: Heavy bold font, strong visual impact, confident letterforms, powerful presence
4. **Elegant Serif** — Typography: Refined serif typeface, sophisticated elegance, classic luxury feel
5. **Soft Rounded** — Typography: Rounded corners font, friendly approachable style, soft gentle curves
6. **Handwriting / Script** — Typography: Handwritten script font, personal organic feel, flowing natural strokes
7. **Retro / Vintage** — Typography: Vintage-inspired font, nostalgic retro style, classic heritage feel
8. **Tech / Futuristic** — Typography: Geometric technical font, futuristic sci-fi style, modern tech aesthetic
9. **Playful / Fun** — Typography: Playful decorative font, fun energetic style, creative whimsical character

---

### 2️⃣ Composition Style

**Purpose**: Text placement is the heart of Typography

**Options**:
1. **Centered Layout** — Composition: Centered text alignment, balanced symmetrical layout, classic formal arrangement
2. **Left-aligned Clean** — Composition: Left-aligned typography, clean organized hierarchy, editorial style layout
3. **Grid-based (Swiss style)** — Composition: Strict grid system, Swiss typography style, mathematical precise layout
4. **Big Title + Small Subtext** — Composition: Large dominant headline, small supporting subtext, clear hierarchy contrast
5. **Overlap / Layered Text** — Composition: Overlapping text layers, depth through layering, dynamic dimensional composition
6. **Asymmetrical Layout** — Composition: Asymmetric text placement, dynamic off-balance design, modern editorial style
7. **Full-bleed Typography** — Composition: Text fills entire frame, bold maximalist approach, immersive typographic experience

---

### 3️⃣ Mood & Tone

**Purpose**: Quickly select the vibe

**Options**:
1. **Minimal & Calm** — Mood: Serene minimalist atmosphere, calm peaceful vibe, zen-like tranquility
2. **Energetic & Bold** — Mood: High-energy dynamic feel, bold confident attitude, vibrant exciting atmosphere
3. **Elegant & Luxury** — Mood: Sophisticated luxury vibe, elegant refined atmosphere, premium high-end feel
4. **Youthful & Cute** — Mood: Fresh youthful energy, cute playful vibe, cheerful optimistic atmosphere
5. **Futuristic Neon** — Mood: Cyberpunk neon aesthetic, futuristic tech vibe, electric digital atmosphere
6. **Vintage Warm** — Mood: Nostalgic vintage warmth, retro cozy atmosphere, timeless classic feel
7. **High-contrast Dramatic** — Mood: Dramatic bold contrast, intense striking atmosphere, powerful visual tension

---

### 4️⃣ Color Direction

**Purpose**: Color tone affects the feeling

**Options**:
1. **Monochrome** — Colors: Pure monochrome palette, black and white contrast, timeless classic scheme
2. **Pastel Soft** — Colors: Soft pastel color palette, gentle muted tones, dreamy aesthetic scheme
3. **High Contrast** — Colors: High contrast bold colors, striking visual impact, dramatic color tension
4. **Gradient Modern** — Colors: Smooth modern gradients, contemporary blend transitions, fluid color flow
5. **Neon Glow** — Colors: Vibrant neon colors, electric glow effect, cyberpunk fluorescent palette
6. **Retro 80s** — Colors: 80s retro color scheme, vintage sunset palette, nostalgic warm tones
7. **Cream & Earth Tone** — Colors: Natural earth tone palette, warm cream beige scheme, organic neutral colors

---

### 5️⃣ Text Effects

**Purpose**: Very popular Digital Art effects

**Options**:
1. **Drop shadow** — Text Effect: Subtle drop shadow, depth and dimension, classic shadow technique
2. **Outline / Stroke** — Text Effect: Bold outline stroke, defined edges, strong letter boundaries
3. **Glow / Neon** — Text Effect: Neon glow effect, luminous radiant light, electric shine
4. **3D Extrude** — Text Effect: 3D extruded depth, dimensional letterforms, volumetric typography
5. **Metallic Text** — Text Effect: Metallic surface finish, chrome reflective quality, polished metal look
6. **Paper-cut Text** — Text Effect: Paper-cut layered style, crafted dimensional effect, physical tactile quality
7. **Liquid / Gel Text** — Text Effect: Liquid gel texture, glossy fluid surface, organic flowing quality
8. **Glitch / Distortion** — Text Effect: Digital glitch distortion, corrupted data aesthetic, cyberpunk error effect

---

### 6️⃣ Use-case Templates

**Purpose**: Instantly select a work format

**Options**:
1. **Poster Typography** — Format: Bold poster design, impactful headline typography, visual statement piece
2. **Quote Design** — Format: Inspirational quote layout, meaningful text presentation, shareable wisdom design
3. **Infographic Title** — Format: Infographic header design, data visualization title, information design approach
4. **Magazine Editorial** — Format: Editorial typography layout, magazine-style composition, refined publishing aesthetic
5. **Branding Headline** — Format: Brand identity headline, corporate typography design, professional business style
6. **Social Media Post** — Format: Social media optimized, attention-grabbing headline, platform-ready design
7. **Motion Typography** — Format: Animation-ready typography, dynamic motion design, kinetic text concept

---

### 7️⃣ Modern Trend Packs

**Purpose**: Modern categories frequently used by designers

**Options**:
1. **Korean Clean Typography** — Trend: Korean minimal aesthetic, clean organized layout, Hangul-inspired precision
2. **Swiss Modern** — Trend: Contemporary Swiss design, functional modernism, systematic grid approach
3. **Bauhaus Revival** — Trend: Neo-Bauhaus style, geometric abstract forms, avant-garde modernist approach
4. **Y2K Glossy Text** — Trend: Y2K revival aesthetic, glossy chrome effects, early-2000s digital nostalgia
5. **Minimal Brutalism** — Trend: Brutalist minimal design, raw structural approach, anti-aesthetic aesthetic
6. **Soft Aesthetic Text** — Trend: Soft dreamy aesthetic, gentle blurred elements, Instagram-core style
7. **Cyber Glow UI** — Trend: Cyberpunk UI design, neon interface elements, futuristic HUD aesthetic

---

### 8️⃣ Layout Add-ons

**Purpose**: Add systematic structure

**Options**:
1. **With Icons** — Add-on: Complementary icon elements, visual supporting graphics, symbolic illustrations
2. **With Shapes** — Add-on: Geometric shape elements (circles, squares, lines), structural design accents
3. **With Grid Lines** — Add-on: Visible grid structure, Swiss-style guide lines, systematic framework
4. **With Color Palette** — Add-on: Displayed color swatches, palette showcase, color system visualization
5. **With Texture Background** — Add-on: Textured background surface, tactile material quality, physical depth
6. **With Photo Background** — Add-on: Photographic background element, real imagery context, environmental setting

---

### Final Prompt Template (with Typography):

```
Typography Design: [User-provided subject/text]

[Selected Font Personality]
[Selected Composition Style]
[Selected Mood & Tone]
[Selected Color Direction]
[Selected Text Effects]
[Selected Use-case Template]
[Selected Modern Trend Pack]
[Selected Layout Add-ons]

Style: Typography-focused design, professional typographic composition

Technical: High-resolution typography, clean rendering, sharp letterforms, 
professional graphic design quality

9:16 vertical.
```

---

### Usage Examples:

**Example 1: Minimal Modern Poster**
```
User: "T"
System: [Shows 8 categories]

User: "1" → Font Personality
System: [Shows 9 options]
User: "1" (Modern Clean)

System: "Add another category? (1-8 or 'done')"
User: "2" → Composition Style
User: "1" (Centered Layout)

User: "3" → Mood & Tone
User: "1" (Minimal & Calm)

User: "4" → Color Direction
User: "1" (Monochrome)

User: "done"

Output:
Typography Design: "Less is More"

Typography: Clean sans-serif font, modern minimalist style, sharp 
and clear letterforms

Composition: Centered text alignment, balanced symmetrical layout, 
classic formal arrangement

Mood: Serene minimalist atmosphere, calm peaceful vibe, zen-like 
tranquility

Colors: Pure monochrome palette, black and white contrast, timeless 
classic scheme

Style: Typography-focused design, professional typographic composition

Technical: High-resolution typography, clean rendering, sharp letterforms, 
professional graphic design quality

9:16 vertical.
```

---

**Example 2: Y2K Neon Quote**
```
Selections:
- Font: Playful / Fun
- Composition: Overlap / Layered Text
- Mood: Futuristic Neon
- Color: Neon Glow
- Effect: Glow / Neon
- Trend: Y2K Glossy Text
- Add-on: With Shapes

Output: [Full prompt with all 7 elements]
```

---

### Rules:
1. **Not Default**: Typography mode ONLY when user selects "T"
2. **Modular**: User can select 1-8 categories (any combination)
3. **Flexible**: No mandatory categories — user decides
4. **Additive**: Each selection adds to final prompt
5. **Clear Exit**: "done" generates final prompt
6. **No Limit**: User can select multiple options per category if desired

---

### CRITICAL Notes:
- Typography Edition is SEPARATE from RDP
- Can combine with R (Realistic Skin) or F (Face Lock) if person present
- Subject can be pure text or text + person
- Text content comes from user input
- All selections are optional — even 1 category works

---

## 1️⃣3️⃣ OPTION V: VFX EFFECTS

### Purpose:
Add special effects (overrides RDP)

### **CRITICAL**: 2-Level Menu (Same as Option 6)

#### Level 1: Select Category (P/L/W/M/A/T)
```
User: "V"
System: Show 6 VFX categories:
  P — Particles
  L — Lighting
  W — Weather
  M — Magic
  A — Atmospheric
  T — Motion

User: Select category (e.g. "P")
```

#### Level 2: Select Specific Effect
```
System: Show effects in that category
User: Select effect (e.g. "2" = Smoke)
System: Generate prompt + add VFX description
```

### Categories with Effects:

#### P. Particles ✨
**Usage**: Ambient atmosphere
1. Dust particles — Floating dust (dusty atmosphere)
   → **Prompt**: "with floating dust particles catching the light, creating an atmospheric and dreamy quality"
2. Smoke — Smoke (dark tones)
   → **Prompt**: "with gentle smoke wisps drifting through the scene, adding depth and mystery"
3. Fire particles — Fire sparks (hot, intense particles)
   → **Prompt**: "with glowing fire particles and embers floating in the air, creating warmth"
4. Water droplets — Water drops (refreshing)
   → **Prompt**: "with fine water droplets suspended in air, creating freshness and clarity"
5. Sparks — Electric sparks (energy)
   → **Prompt**: "with bright sparks and electrical particles creating energy and dynamism"
6. Embers — Glowing embers (warmth)
   → **Prompt**: "with warm glowing embers floating gently, creating intimate atmosphere"
7. Snow flakes — Snowflakes (cold, drifting)
   → **Prompt**: "with delicate snowflakes drifting down, creating winter serenity"
8. Pollen — Pollen (natural)
   → **Prompt**: "with pollen particles visible in sunbeams, creating natural organic feel"

#### L. Lighting 💡
**Usage**: Dramatic lighting effects
1. Glow effect — Luminous glow
2. Lens flare — Bright light from lens
3. God rays — Dramatic light rays (streaming through)
4. Neon glow — Neon luminescence (cyberpunk)
5. Light streaks — Light beams (speed)
6. Bioluminescence — Biological light (fantasy)
7. Volumetric light — 3D dimensional light

#### W. Weather 🌧️
**Usage**: Environmental drama
1. Rain — Rain (melancholic, romantic)
2. Heavy rain — Heavy rain (dramatic)
3. Snow — Snow (cold, falling)
4. Lightning — Lightning bolt (thrilling)
5. Storm — Storm (furious)
6. Tornado — Tornado (intense)
7. Wind effects — Wind blowing (flowing)

#### M. Magic 🔮
**Usage**: Fantasy/magical scenes
1. Energy aura — Energy aura
2. Magic circle — Magic circle
3. Spell effects — Spell effects
4. Portal — Dimensional portal
5. Glowing runes — Glowing rune characters
6. Magical particles — Magical particles
7. Force field — Force field

#### A. Atmospheric 🌫️
**Usage**: Depth and mystery
1. Mist — Light mist
2. Fog — Heavy fog
3. Haze — Haze curtain
4. Steam — Steam
5. Volumetric fog — 3D dense fog
6. Smoke atmosphere — Smoky atmosphere

#### T. Motion 💨
**Usage**: Action and movement
1. Motion blur — Motion blur
   → **Prompt**: "with gentle motion blur creating sense of movement while keeping subject sharp and static"
2. Speed lines — Speed lines
   → **Prompt**: "with dynamic speed lines radiating from motion, creating energy and velocity"
3. Trailing effects — Trailing effects
   → **Prompt**: "with soft motion trails following movement, creating fluid dynamic atmosphere"
4. Impact waves — Impact waves
   → **Prompt**: "with impact waves radiating outward, showing force and energy"
5. Shockwave — Shockwave
   → **Prompt**: "with visible shockwave distortion spreading through air, dramatic power"
6. Dynamic trail — Dynamic trail
   → **Prompt**: "with dynamic light trails and motion streaks suggesting ambient city energy"

### VFX Application Logic:
```
IF Option V selected:
  1. Show Level 1 menu (P/L/W/M/A/T)
  2. User selects category → Show Level 2 (effects list)
  3. User selects effect → Add to prompt
  4. Override RDP with VFX aesthetic
  5. CRITICAL: Use actual effect description (NOT code)
     ❌ WRONG: "Motion VFX (T)" or "include (P) particles"
     ✅ RIGHT: "gentle motion blur" or "floating dust particles"
```

### **CRITICAL WARNING**: No Internal Codes in Prompts

**NEVER include internal codes** like (P), (L), (W), (M), (A), (T) in the final prompt:

❌ **WRONG Examples**:
```
"enhanced by Motion VFX (T)"
"include Particles (P) effect"
"apply Lighting (L) enhancement"
"with Weather (W) elements"
"RDP Realism:" (RDP is internal term)
```

✅ **CORRECT Examples**:
```
"with gentle motion blur creating dynamic atmosphere"
"with floating dust particles catching the light"
"with dramatic god rays streaming through space"
"with soft rain creating reflective surfaces"
"Lighting & Realism:" (clear, understandable)
```

**Why?**:
- AI Model (Gemini 3) doesn't understand (P/L/W/M/A/T) codes
- These are internal system references only
- Must translate to actual effect descriptions
- "Motion VFX" sounds like a brand/company name
- "RDP" is internal protocol abbreviation

### **ANTI-REDUNDANCY RULES**:

**Problem**: Describing same effect multiple times

❌ **WRONG (Redundant)**:
```
Title: "...enhanced by motion effects"
Scene: "Include motion blur from people..."
VFX Section: "Soft motion trails outside..."
```
→ Described motion 3 times = redundant, confusing

✅ **CORRECT (Once Only)**:
```
Scene: "Include gentle motion blur from passing people 
outside the window, faint dynamic streaks of light from 
movement, creating urban energy while keeping subject sharp."
```
→ All motion effects integrated in Scene once

**Rules**:
1. **Describe effects ONCE** in appropriate section (usually Scene)
2. **NO separate VFX section** if already described in Scene
3. **Integrate naturally** into scene description
4. **Be specific** but concise

### Example Usage:

#### Example 1: Portrait + Particles
```
User: Upload a person's photo
User: "V" → "P" (Particles) → "1" (Dust)
System adds: "Include dust particles floating in the air, catching the light..."
Result: Portrait with atmospheric dust
```

#### Example 2: Cinematic + Lighting
```
User: Create a cinematic image
User: "V" → "L" (Lighting) → "3" (God rays)
System adds: "Include dramatic god rays streaming through atmosphere..."
Result: Cinematic scene with light rays
```

#### Example 3: Action + Motion
```
User: Create an action image
User: "V" → "T" (Motion) → "2" (Speed lines)
System adds: "Include speed lines indicating rapid movement..."
Result: Dynamic action shot

```

### Critical Rules:
- **2-Level Required**: MUST show Level 2 menu (do not output prompt immediately after Level 1)
- **Override RDP**: VFX aesthetic replaces Realism Default
- **Combine with Styles**: Can use with Option 6 (Style + VFX)
- **Natural Integration**: VFX must fit scene logically

---

## 1️⃣4️⃣ OPTION R: REALISTIC SKIN

### Purpose:
Enforce strict skin realism — **USE ONLY when user explicitly chooses Option R**

### **Default Skin (When R NOT Selected):**

**Smooth, Polished Skin** (Beauty Standard):
```
→ Smooth, even skin texture
→ Polished, refined appearance
→ Like phone beauty filters
→ Perfect for social media posting
→ No visible pores or imperfections
→ Clean, flawless look
```

**Prompt Example (Default — NO R)**:
```
Lighting & Realism:
Natural light, accurate shadows, smooth polished skin, no artifacts.
```

**Result**: Beautiful, retouched look, like using a Beauty Filter on a phone ✨

---

### **Realistic Skin (When R Selected):**

**Natural, Authentic Texture** (Professional Photography):
```
→ Visible pores (nose, cheek, forehead)
→ Micro-texture preserved
→ Natural color variations
→ Subtle imperfections kept
→ Authentic human skin
→ Professional editorial look
```

**Prompt Template (WITH R)**:
```
Realistic Skin:
Keep pores, micro-texture, natural tone variation, and 
authentic skin character.

Enhancement:
Slightly soften minor shadows or tiny blemishes while 
keeping natural skin texture clearly visible.
```

**Result**: Realistic skin with texture, slightly retouched, looks natural 🔬

---

### KB Reference:
Realistic_Skin_Preservation_Rules.md

### When to Use Option R:
- Professional portrait photography
- Editorial beauty shots
- High-end fashion
- Closeup photography
- When authenticity is priority
- Magazine-quality images

### When NOT to Use Option R (Use Default):
- Social media posts
- Casual portraits
- Beauty/glamour shots
- When user wants polished look
- Commercial advertising

---

### Application Logic:
```
IF Option R selected:
  Add to Final Prompt:
  
  "Realistic Skin:
  Keep pores, micro-texture, natural tone variation, 
  and authentic skin character.
  
  Enhancement:
  Slightly soften minor shadows or tiny blemishes while 
  keeping natural skin texture clearly visible."

ELSE (Default — R NOT selected):
  Lighting & Realism section uses:
  "...smooth polished skin, no artifacts."
  
  NO Enhancement section
  NO Realistic Skin section
```

---

### Enhancement Section — CRITICAL:

**Enhancement ONLY with Option R**:
- Purpose: Balance realism with professional quality
- Allow: Slight shadow softening, minor blemish reduction
- Forbidden: Removing texture, over-smoothing
- Maintain: Natural skin character clearly visible

**Enhancement NEVER with Default**:
- Default already smooth
- No need for "keep texture" instruction
- Would create confusion

---

### Comparison: Default vs Realistic

| Aspect | Default (No R) | Realistic (R Selected) |
|---|---|---|
| **Texture** | Smooth, polished | Visible pores, texture |
| **Imperfections** | Hidden/removed | Subtle, natural |
| **Look** | Beauty filter | Authentic human |
| **Use Case** | Social posts | Professional editorial |
| **Enhancement** | ❌ Not needed | ✅ Required |
| **Result** | Smooth beauty | Realistic |

---

### Critical Rules (from KB):

**When R Selected:**
1. **Baseline Texture**: MUST include visible pores
2. **Micro-texture**: Always present
3. **Color Variation**: Natural skin tones
4. **Imperfections**: Subtle natural flaws
5. **Forbidden**: Over-smooth, plastic, waxy, porcelain
6. **Enhancement**: Slight touch-up while keeping texture

**When R NOT Selected (Default):**
1. **Smooth Skin**: Polished, refined
2. **No Texture Emphasis**: Clean look
3. **Beauty Standard**: Phone filter style
4. **No Enhancement Section**: Already smooth
5. **Result**: Social media ready

---

### Verification Questions:

**For Realistic Skin (R selected)**:
- Does skin look like real human up close? ✅
- Are pores still visible? ✅
- Is texture natural? ✅
- Is Enhancement section present? ✅

**For Default (R NOT selected)**:
- Is skin smooth and polished? ✅
- Does it look social-media ready? ✅
- Is Enhancement section absent? ✅

---

## 1️⃣5️⃣ OPTION F: SOFT FACE LOCK (90-95%)

### Purpose:
Identity consistency with natural flexibility — maintains strong recognition while allowing natural integration with scene

### **NEW APPROACH: Soft Lock (90-95%)**

**Problem with 100% Lock:**
- ❌ Unnatural "cut-and-paste" appearance
- ❌ Poor lighting integration
- ❌ Visible edge artifacts
- ❌ Doesn't adapt to scene atmosphere

**Soft Lock Solution:**
- ✅ Strong identity recognition (90-95%)
- ✅ Natural lighting integration
- ✅ No edge artifacts
- ✅ Organic scene blending
- ✅ Professional results

### Core Philosophy:
```
Preserve STRUCTURE (facial landmarks & proportions)
Allow COSMETIC adjustments (lighting, shadows, clarity)
Forbidden GEOMETRY changes (bone structure, feature reshaping)
```

### KB Reference:
IdentityConsistencyRules.md (updated for Soft Lock)

### When to Use:
- Series shooting (multiple scenes, same person)
- Different lighting conditions
- Various backgrounds/settings
- Natural portrait consistency
- Professional photo series

### Application Logic:
```
IF Option F selected:
  Add to Final Prompt:
  
  "Subject: Same woman, keep 90–95% facial identity.
  
  Soft Lock: Preserve main landmarks (eyes, nose, mouth, 
  jaw, cheekbones). Allow soft lighting, shadow smoothing, 
  clarity—NO geometry changes."

ELSE (Default — F NOT selected):
  Subject section only:
  "Subject: Same woman, keep 90–95% facial identity."
  
  NO Soft Lock section
  NO landmarks mentioned
```

**CRITICAL**: Landmarks ONLY appear when F is selected, in the Soft Lock section.

### What to PRESERVE (Main Landmarks):

#### 1. Eye Structure:
- Overall eye shape (almond, round, etc.)
- Relative eye spacing
- Eye angle/tilt
- General eyelid fold pattern

#### 2. Nose Structure:
- Bridge height & width (overall)
- Nose tip shape (general)
- Nostril size ratio
- Overall nose length

#### 3. Mouth & Lips:
- Lip shape proportions
- Mouth width ratio
- Cupid's bow (general shape)
- Lip thickness ratio

#### 4. Jawline & Face Shape:
- Overall jaw shape
- Chin position & projection
- Face width proportions
- Cheekbone prominence

### What's ALLOWED (Cosmetic):

✅ **Soft Lighting Adjustments**:
- Match scene color temperature
- Adjust shadow intensity naturally
- Blend with ambient lighting
- Natural highlight placement

✅ **Shadow Smoothing**:
- Soften harsh shadow edges
- Reduce minor under-eye shadows
- Natural shadow gradients
- Subtle contour adjustments

✅ **Clarity Enhancement**:
- Improved skin detail
- Sharper feature definition
- Better overall image quality
- Natural sharpness

✅ **Natural Integration**:
- Blend with scene atmosphere
- Match color palette
- Adapt to lighting conditions
- Organic depth of field

✅ **Minor Touch-ups**:
- Slight blemish softening
- Minor imperfection smoothing
- Keep natural texture visible
- Maintain authenticity

### What's FORBIDDEN (Geometry):

🚫 **Facial Geometry Changes**:
- NO face shape changes
- NO jaw restructuring
- NO cheekbone repositioning
- NO chin alterations
- NO feature resizing

🚫 **Structure Modifications**:
- NO eye size changes
- NO nose reshaping
- NO lip proportion changes
- NO bone structure edits
- NO landmark repositioning

### Multi-Image Rule:
```
Image 1 = anchor (90-95% reference)
- Preserve main landmarks & structure
- Allow lighting/atmosphere flexibility
- Maintain strong recognition
- Natural scene integration
```

### Example Prompts:

**Good (Soft Lock)**:
```
Same woman, keep 90–95% facial identity. Preserve main 
landmarks. Allow soft lighting, shadow smoothing, clarity. 
NO facial geometry changes.
```

**Bad (Too Rigid)**:
```
Face 100% identical, exact match, NO changes whatsoever.
```
→ Results in unnatural cut-paste look

---

## PART 3: TECHNICAL DETAILS

---

## 1️⃣6️⃣ MULTI-IMAGE FUSION ADVANCED LOGIC

### Fusion Hierarchy (Priority Order):

1. **Image 1** → PRIMARY (person/main subject)
2. **Image 2** → Secondary subject or clothing
3. **Image 3** → Accessories or additional items
4. **Image 4** → Environment/background or props
5. **Image 5** → Mood/style reference or details

### Detection & Classification:

#### Person (Primary):
- **Recognition**: Face visible, full/partial body
- **Action**: "Subject from Image 1"
- **Identity Rule**: Face 90-95% (Soft Lock if F selected)

#### Clothing/Outfit:
- **Recognition**: Apparel without person wearing
- **Action**: "wearing the outfit from Image N"
- **Note**: Preserve patterns, colors, style

#### Product (Small):
- **Recognition**: Handheld items (phone, cup, jewelry)
- **Action**: "holding the [item] from Image N"
- **Identity**: Product 100% identical

#### Product (Medium/Large):
- **Recognition**: Furniture, equipment
- **Action**: "positioned near/with [item] from Image N"
- **Scale**: Must be proportionally correct

#### Jewelry/Accessory:
- **Recognition**: Wearable small items
- **Action**: "wearing the [jewelry] from Image N"
- **Identity**: Jewelry 100% identical

#### Location/Background:
- **Recognition**: Landscape, interior, setting
- **Action**: "set in the environment from Image N"
- **Note**: Atmosphere reference (not exact copy)

### Integration Patterns:

#### Pattern 1: Person + Outfit
```
"The subject from Image 1 wears the elegant dress from Image 2, which features [describe dress details]. The outfit drapes naturally on their figure..."
```

#### Pattern 2: Person + Product
```
"The person from Image 1 holds the coffee cup from Image 2 in their right hand. The cup, measuring approximately 10cm in diameter, is positioned at chest height..."
```

#### Pattern 3: Person + Multiple Items
```
"The subject from Image 1 wears the jacket from Image 2 over the shirt from Image 3, while holding the bag from Image 4. They stand in the setting from Image 5..."
```

### Physics-Based Rules:

#### Scale Consistency:
```
Coffee cup = 10cm diameter
Smartphone = 15cm height
Laptop = 35cm width
Chair = 45cm seat height
Door = 200cm height
Human = 165-180cm average
```

#### Lighting Harmony:
```
- All objects share same light direction
- Shadows align with single source
- Color temperature consistent
- No conflicting highlights
```

#### Perspective Matching:
```
- Same vanishing point for all objects
- Scale decreases with distance
- Overlap creates depth
- Ground plane consistent
```

#### Material Interaction:
```
- Glass reflects environment
- Metal reflects light + nearby colors
- Fabric drapes with gravity
- Liquids conform to container
```

---

## 1️⃣7️⃣ REALISM DEFAULT PROTOCOL (RDP)

### Purpose:
Ensure realistic output by default

### Core Principles:

#### 1. Physics Accuracy:
- Light from single direction
- Shadows proportional to object size
- NO floating objects
- NO impossible geometries

#### 2. Botanical Realism:
- Flowers/plants have volume and layers
- Actual petals (not flat patterns)
- Stems, leaves, depth visible
- Natural irregularities

#### 3. Anti-AI Artifacts:
- NO over-smooth skin
- NO unnecessary background blur
- NO copy-paste repetition
- NO plastic/waxy appearance

#### 4. Identity Lock (Built-in):
- Face 100% identical to reference
- NO beautification that alters structure
- Preserve texture and proportions

#### 5. Camera Logic:
- Standard focal lengths
- Natural depth of field
- Realistic grain allowed
- NO unnatural lens effects

#### 6. Override Rules:
```
IF user selects Style (Option 6):
  → Override RDP with selected style

IF user selects VFX (Option V):
  → Override RDP with VFX aesthetic

IF user requests fantasy/surreal:
  → Override RDP

OTHERWISE:
  → Apply RDP (Realistic Photography)
```

### RDP in Final Prompt:
```
**Realism Default:**
Realistic photography. Natural single-direction lighting.
Real botanicals (if present: actual petals with volume/layers,
never flat patterns). No AI artifacts: no over-smooth skin,
no unnecessary blur, no floating objects. Standard camera specs.
```

---

## 1️⃣8️⃣ IDENTITY PRESERVATION SYSTEM

### Core System (Always Active):

**For Persons**:
```
Face 90-95% preserved (flexible)
- Main features maintained
- Proportions similar
- Natural variation allowed
- Expressions can vary freely
- Lighting/angle adjustments OK
```

**Rationale**: 90-95% prevents deepfake concerns, maintains natural look, allows creative flexibility

**For Products**:
```
Design 100% identical
- Shape preserved exactly
- Patterns exact
- Details maintained
- No variation
```

**For Jewelry**:
```
Design 100% identical
- Shape exact
- Patterns precise
- Details preserved exactly
```

### Enhancement: Option F (Face Lock)

**When F selected**:
```
Soft Lock 90-95% + Landmark Preservation
→ Same 90-95% base identity
→ PLUS: Preserve landmarks (eyes, nose, mouth, jaw, cheekbones)
→ Allow: Lighting, shadow, clarity adjustments
→ Ban: Facial geometry, bone structure changes
```

### Comparison:

| Feature | Default Identity | Option F (Soft Lock) |
|---|---|---|
| Face Identity | 90-95% preserved | 90-95% + landmarks |
| Face Shape | ✅ Similar | ✅✅ Locked |
| Eye Position | ✅ Maintained | ✅✅ Landmark-level |
| Nose Structure | ✅ Similar | ✅✅ Landmark-level |
| Lighting/Shadow | ✅ Flexible | ✅✅ Flexible |
| Geometry Changes | ✅ Slight OK | ❌ Forbidden |
| Use Case | General | Series/Consistency |

**CRITICAL**: Person = 90-95% (NOT 100%), Product = 100%

---

## 1️⃣9️⃣ VOCABULARY OF IMPERFECTION (Complete)

### Purpose:
Add realism by including natural flaws

### 🧑 Human Skin (20+ terms):
- "slightly uneven skin texture"
- "subtle pores visible on forehead and nose"
- "natural skin color variation"
- "hint of redness on cheeks"
- "faint freckles scattered naturally"
- "minor skin imperfections"
- "organic skin texture with subtle irregularities"
- "natural sebum reflection on T-zone"
- "fine lines around eyes showing genuine expression"
- "slight asymmetry in facial features"
- "tiny moles or beauty marks"
- "natural skin tone variation across face"
- "subtle shadows in facial contours"
- "micro-texture visible on close inspection"

### 👁️ Eyes (10+ terms):
- "natural iris variation with subtle color gradients"
- "tiny visible blood vessels in sclera"
- "realistic catchlight reflection"
- "slight eye asymmetry (left eye 2% smaller)"
- "natural eyelash clumping"
- "subtle dark circles under eyes"
- "organic eyelid crease pattern"
- "individual eyelashes visible"

### 💇 Hair (10+ terms):
- "individual hair strands visible"
- "slight flyaway hairs catching light"
- "natural hair texture with subtle variations"
- "organic hair movement"
- "few strands out of place"
- "natural hair shine with uneven light reflection"
- "split ends visible on inspection"
- "root growth showing natural color"

### 🖐️ Hands & Body (8+ terms):
- "visible knuckle texture"
- "subtle veins on hands"
- "natural nail bed appearance"
- "minor skin creases on fingers"
- "organic joint articulation"
- "slight hand asymmetry"

### 👗 Clothing & Fabric (8+ terms):
- "fabric wrinkles showing natural draping"
- "slight color fade on denim"
- "minor fabric pilling visible"
- "natural fabric texture with visible weave"
- "button slightly askew"
- "thread ends visible"

### 🌍 Environment (10+ terms):
- "dust particles visible in sunbeam"
- "slight lens flare from direct sun"
- "natural chromatic aberration in highlights"
- "minor debris on ground"
- "organic wear patterns on surfaces"
- "uneven lighting gradients"
- "natural shadows with soft edges"

**CRITICAL USAGE RULE**:
```
Use 3-5 terms per prompt
- Too few = AI look
- Too many = overly imperfect / ugly
- Sweet spot = 3-5 terms
```

---

## 2️⃣0️⃣ LIGHTING & CAMERA REFERENCE

### Lighting Physics:

#### Golden Hour:
```
Warm diffused sunlight at 15° above horizon
Long soft shadows
Orange-amber color (3000K)
Natural rim lighting
```

#### Overcast:
```
Soft ambient light from clouds
Minimal shadows
Even exposure
Cool temperature (6000K)
Gentle wrap-around
```

#### Direct Midday:
```
Hard overhead sun
Sharp defined shadows
High contrast
Neutral-cool (5500K)
Can be unflattering
```

#### Window Light:
```
Large soft source from side
Gentle gradient across face
Shadows fade gradually
Varies (4500-6000K)
```

### Camera Specifications:

| Focal Length | Use Case | Characteristics |
|---|---|---|
| 24mm | Wide environmental | Slight distortion, deep DOF |
| 35mm | Street/documentary | Natural perspective |
| 50mm | General/portraits | Human eye perspective |
| 85mm | Portrait | Flattering compression |
| 135mm | Telephoto portrait | Strong compression, shallow DOF |

| Aperture | Effect | Use Case |
|---|---|---|
| f/1.4 | Extreme blur | Subject isolation |
| f/2.8 | Portrait depth | Single person |
| f/5.6 | Group depth | Small groups |
| f/8 | Landscape depth | Scenics, architecture |

---

## 2️⃣1️⃣ TROUBLESHOOTING GUIDE

### Problem: AI Look (Plastic/Fake)
**Solution**: 
- Add 3-5 imperfections from Vocabulary
- Include "natural skin texture with visible pores"
- Use Option R for strict enforcement

### Problem: Perfect Symmetry (Uncanny)
**Solution**:
- Add "slight facial asymmetry"
- Specify "left eye 2% smaller"
- Mention natural irregularities

### Problem: Objects Floating/Wrong Scale
**Solution**:
- Specify exact placement: "cup rests on table surface"
- Include scale reference: "10cm diameter cup"
- Use physics-based language

### Problem: Inconsistent Lighting
**Solution**:
- Add unified lighting statement
- Specify single light direction
- Ensure shadow consistency

### Problem: Text Not Appearing
**Solution**:
- Verify Option 7 is active
- Check for `[EMPTY]` in text fields
- Use exact format from Option 7 logic

### Problem: Wrong Aspect Ratio
**Solution**:
- Always end with: "vertical 9:16 aspect ratio"
- Ensure this phrase is present

### Problem: Sacred Mods Ignored
**Solution**:
- Place after "Crucially, ensure"
- Use strong language: "must feature"
- Check Sacred Memory persistence

### Problem: Multi-Image Fusion Fails
**Solution**:
- Use explicit integration: "subject from Image 1 wears outfit from Image 2"
- NOT "combine Image 1 and 2"
- Specify physical relationships

### Problem: Style Not Applied
**Solution**:
- Verify Option 6 selection
- Check style override in prompt
- Ensure [IF Style] conditional present

### Problem: Identity Not Preserved
**Solution**:
- Use Option F for stricter enforcement
- Verify "Face 100% identical" in prompt
- Check Image 1 is primary reference

### Problem: Skin Too Smooth
**Solution**:
- Use Option R (Realistic Skin)
- Add imperfections vocabulary
- Specify "visible pores"

---

## 📖 CROSS-REFERENCES

### Related Knowledge Files:
1. AI_Image_Style_Categories.md → Full style descriptions
2. Realistic_Skin_Preservation_Rules.md → Option R details
3. IdentityConsistencyRules.md → Option F details

### System Prompt Sections:
- Core Rules (5 rules)
- RDP (Realism Default Protocol)
- Multi-Image Fusion (Detection table)
- Option Behaviors (All 13 options)
- Critical Reminders (8 rules)

---

## 🎯 BEST PRACTICES SUMMARY

### DO:
✅ Write semantic narratives (not keywords)  
✅ Use 3-5 imperfections per prompt  
✅ Specify physics (scale, lighting, placement)  
✅ Reference Sacred Memory in every prompt  
✅ Apply RDP unless style selected  
✅ Use Image 1 as primary reference  
✅ Add Option R for closeup/portrait  
✅ Add Option F for series consistency  

### DON'T:
❌ Stack keywords with commas  
❌ Over-use imperfections (>5)  
❌ Skip physics rules  
❌ Ignore Sacred Memory  
❌ Over-smooth skin (unless intentional)  
❌ Change bone structure (identity)  
❌ Float objects (specify ground contact)  

---

**Knowledge Base Version**: 8.9  
**Companion to**: PromptDepth_Pro_v8.9.md  
**Last Updated**: 2025-11-24  
**Status**: Production Ready ✅
