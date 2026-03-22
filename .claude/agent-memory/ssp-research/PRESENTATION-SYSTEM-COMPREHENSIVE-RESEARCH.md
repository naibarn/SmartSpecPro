---
name: Presentation System Comprehensive Research
description: Complete technical documentation of SmartSpecPro presentation/slide system covering element types, block presets, component recipes, data structures, rendering, and UI architecture
type: project
---

# SmartSpecPro Presentation System — Comprehensive Research Brief

**Date**: 2026-03-15
**Scope**: React presentation editor, slide data structures, rendering system, and component recipe architecture
**Status**: Complete analysis of all nine research areas

---

## 1. SLIDE ELEMENT TYPES

### Overview
Presentations are built from atomic **elements** (primitive shapes) and **components** (recipe-based layouts).

### Element Types (5 total)

All elements share common properties:
- `id` (string): Unique identifier
- `type` (discriminated union): Element type
- `x, y` (number): Position (can be negative)
- `width, height` (number): Dimensions
- `opacity` (number, 0–1): Optional
- `rotation` (number, -3600 to 3600): Optional

#### 1. **Text Element**
```typescript
type PresentationTextElement = {
  id: string;
  type: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  rotation?: number;

  text: string; // max 10,000 chars
  color: string; // hex or rgb
  fontSize?: number; // 8–512px
  fontFamily?: string; // e.g., "Inter, sans-serif"
  fontWeight?: "normal" | "500" | "600" | "700";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  textAlign?: "left" | "center" | "right" | "justify";
  lineHeight?: number; // 0.6–4
  letterSpacing?: number; // -20 to 100
  backgroundColor?: string; // optional fill
  textShadow?: string; // CSS shadow
  textStroke?: string; // CSS text stroke
};
```

**Used for**: Headers, body copy, labels, captions. Handles Thai text with special line height (1.5) and padding.

#### 2. **Image Element**
```typescript
type PresentationImageElement = {
  id: string;
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  rotation?: number;

  src: string; // URL or empty for SVG-only
  alt: string; // accessibility, max 512 chars
  imageFit?: "contain" | "cover" | "fill"; // default: contain
  imagePositionX?: number; // 0–100%
  imagePositionY?: number; // 0–100%
  imageZoom?: number; // 0.5–3x

  // Media styling
  mediaShape?: "rect" | "rounded" | "circle" | "ellipse" | "diamond" | "star";
  mediaCornerRadius?: number; // 0–1000px

  // Generation tracking
  imagePrompt?: string; // max 4000 chars
  imageModelId?: string; // e.g., "openai:dall-e-3"
  imageReferenceUrls?: string[]; // max 5 URLs
  imageExtraParams?: Record<string, unknown>;

  // Inline SVG support
  svgContent?: string; // max 8192 chars, embedded SVG markup
  svgColor?: string; // color override for SVG

  // Animation
  mediaMotion?: PresentationMediaMotion;
};
```

**Used for**: Photos, graphics, diagrams. Supports both raster (src) and vector (svgContent).

#### 3. **Video Element**
```typescript
type PresentationVideoElement = {
  id: string;
  type: "video";
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  rotation?: number;

  src: string; // Video URL
  poster?: string; // Thumbnail image
  title?: string; // Accessibility/metadata
  muted?: boolean; // default: true
  loop?: boolean;

  videoFit?: "contain" | "cover" | "fill"; // default: cover
  videoPositionX?: number; // 0–100%
  videoPositionY?: number; // 0–100%
  videoZoom?: number; // 0.5–3x

  // Media styling
  mediaShape?: "rect" | "rounded" | "circle" | "ellipse" | "diamond" | "star";
  mediaCornerRadius?: number; // 0–1000px

  // Generation tracking
  videoPrompt?: string; // max 4000 chars
  videoModelId?: string;
  videoReferenceUrls?: string[]; // max 5 URLs
  videoExtraParams?: Record<string, unknown>;

  // Animation
  mediaMotion?: PresentationMediaMotion;
};
```

**Used for**: Embedded video clips, background video, video backgrounds.

#### 4. **Rectangle Element**
```typescript
type PresentationRectElement = {
  id: string;
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  rotation?: number;

  fill: string; // required: hex/rgb color
  stroke?: string; // border color
  strokeWidth?: number; // border width
};
```

**Used for**: Decorative backgrounds, dividers, accent bars, containers.

#### 5. **Line Element**
```typescript
type PresentationLineElement = {
  id: string;
  type: "line";
  x: number;
  y: number;
  width: number; // line length
  height: number; // line height (defines thickness as vertical span)
  opacity?: number;
  rotation?: number;

  stroke: string; // required: line color
  strokeWidth: number; // required: line thickness
  fill?: string; // optional underlay
};
```

**Used for**: Decorative dividers, timeline connectors, accent lines.

### Media Animation Support

Images and videos support **motion presets**:
```typescript
type PresentationMediaMotion = {
  preset?: "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "pan-up" | "pan-down" | "pan-up-left" | "pan-up-right" | "pan-down-left" | "pan-down-right";
  intensity?: number; // 0–1
  easing?: "linear" | "ease-in-out";
  timingMode?: "duration" | "until-slide-end";
  durationMs?: number; // 250–120,000ms
  intro?: MotionSegment; // Intro animation
  outro?: MotionSegment; // Outro animation
};
```

---

## 2. BLOCK PRESETS

### Overview
**Block presets** are pre-designed template layouts that auto-generate fallback elements for quick slide creation. They're rendered as raw elements (no components).

### Complete Preset List (31 total)

| ID | Label | Category | Tags | Purpose |
|--|--|--|--|--|
| `process-steps` | Process Steps | Process | Document | Stacked cards for tutorials, SOPs, explainers |
| `timeline-flow` | Timeline Flow | Process | Document | Milestone roadmap with chronological flow |
| `timeline-report` | Timeline Report | Document | — | Full-page roadmap board for milestones |
| `feature-highlights` | Feature Highlights | Marketing | Document | Three-column value props with icons |
| `infographic-grid` | Infographic Grid | Data | Document | Four-cell framework for comparisons |
| `stat-cards` | Stat Cards | Data | Document | Three-up metric cards for KPIs |
| `sectioned-explainer` | Sectioned Explainer | Document | — | Full-page explainer with multiple sections |
| `article-focus` | Editorial | Document | — | Full-page editorial layout with visual area |
| `two-column-article` | Split Article | Document | — | Two-column editorial/report layout |
| `image-top-article` | Image Top + Article | Long-form | Document | Full-width image with article below |
| `image-bottom-article` | Article + Image Bottom | Long-form | Document | Article with full-width image at bottom |
| `image-left-article` | Image Left + Article | Long-form | Document | Image on left, text on right (portrait split) |
| `image-right-article` | Article + Image Right | Long-form | Document | Text on left, image on right (portrait split) |
| `faq-stack` | FAQ Stack | Document | — | Question-and-answer stack for FAQs |
| `profile-board` | Profile Sheet | Document | — | Bio/resume sheet with sections |
| `profile-summary` | Profile Summary | Profile | Document | Speaker/team member intro block |
| `quote-callout` | Quote Callout | Storytelling | Document | Editorial pull-quote with attribution |
| `video-spotlight` | Video Spotlight | Storytelling | — | Promo copy with featured video frame |
| `poster-spotlight` | Poster Spotlight | Marketing | — | Campaign-style hero with image + CTA |
| `framed-image-story` | Framed Image Story | Storytelling | Document | Editorial image-and-copy block |
| `photo-collage` | Photo Board | Document | — | Full-page photo-first board |
| `a4-photo-grid` | Multi-Photo Board | Document | — | Full-page portrait board with hero + 4 detail photos |
| `landscape-photo-story` | Landscape Showcase | Document | — | Landscape board with hero + 3 supporting images |
| `fullpage-image` | Full-Page Image | Document | — | Edge-to-edge image (no text) |
| `fullpage-image-landscape` | Full-Page Image (Landscape) | Document | — | Landscape edge-to-edge image |
| `fullpage-video` | Full-Page Video | Document | — | Edge-to-edge video (no text) |
| `fullpage-video-landscape` | Full-Page Video (Landscape) | Document | — | Landscape edge-to-edge video |
| `wide-hero-article` | Wide Hero Article | Long-form | Document | Full-width hero image + article (5:4/landscape) |
| `split-image-article` | Split Image + Article | Long-form | Document | 50/50 split: image left, text right (5:4) |
| `centered-hero-article` | Centered Hero Article | Long-form | Document | Centered hero image with article below |
| `compact-article` | Compact Text Article | Long-form | Document | Text-only article with sidebar highlights |

### How Presets Work

1. **Preset definition** in `presentationBlockPresets.ts`:
   - `id`: Unique identifier (e.g., "process-steps")
   - `label`: Display name
   - `category`: Used for filtering UI
   - `tags`: Additional tags (e.g., "Document" for multi-category)
   - `description`: User-facing description
   - `accentColor`: Accent color for UI
   - `canvasIntent`: Canvas intent from presentationComponentCatalog

2. **Preset builder** function (e.g., `buildProcessStepsPreset()`):
   - Takes `BuildPresetOptions` (canvas size, makeId function)
   - Returns array of `PresentationElement[]`
   - Elements are calculated based on canvas size with scaling

3. **Layout scaling**:
   - Base canvas: 1280×720
   - Scale factor: `Math.min(canvas.width / 1280, canvas.height / 720)`
   - All positions/sizes scaled proportionally

### Example: Process Steps Preset

```typescript
function buildProcessStepsPreset(options: BuildPresetOptions): PresentationElement[] {
  const frame = getLayoutFrame(options.canvas); // Calculate scale + offset
  const cards = [
    { y: 188, icon: "briefcase", title: "Step 01", detail: "Prepare inputs", body: "...", color: "#f59e0b" },
    { y: 314, icon: "presentation-chart", title: "Step 02", detail: "Structure the story", body: "...", color: "#0ea5e9" },
    { y: 440, icon: "rocket-launch", title: "Step 03", detail: "Ship the message", body: "...", color: "#ef4444" },
  ];

  return [
    makeText(frame, options.makeId, { x: 168, y: 72, width: 760, height: 76, text: "3-Step Process", ... }),
    ...cards.flatMap(card => [
      makeRect(frame, options.makeId, { x: 168, y: card.y, width: 944, height: 108, fill: "rgba(255,248,235,0.96)", ... }),
      makeSvgGraphic(frame, options.makeId, { x: 196, y: card.y + 20, size: 56, graphicId: card.icon, ... }),
      makeText(frame, options.makeId, { x: 278, y: card.y + 18, ... text styling ... }),
      // ... more elements
    ]),
  ];
}
```

**Helper functions**:
- `getLayoutFrame()`: Calculate scale & offset
- `px(frame, x)`: Scale and translate X
- `py(frame, y)`: Scale and translate Y
- `ps(frame, value, min)`: Scale size
- `makeText()`: Create text element
- `makeRect()`: Create rectangle
- `makeSvgGraphic()`: Create SVG image element
- `makeVideo()`: Create video element

---

## 3. COMPONENT RECIPES

### Overview
**Component recipes** are structured, re-usable slide templates with **slot bindings** (named content placeholders). They enable:
- Semantic content input (e.g., "title", "body", "hero-image")
- Automatic layout adjustment based on content
- Quality metrics (fit scores, readability)

### Built-In Component IDs (31 total)

Same IDs as presets (see Section 2), but recipes add:
- Slot definitions (text, image, list slots)
- Media slot definitions (where images/videos can be placed)
- Text capacity budgets (max chars, preferred lines)
- Media frame styles (shape, corner radius)

### Slot Bindings

**Slot types**:
```typescript
type PresentationComponentSlotBinding =
  | { slotId: string; type: "text"; text: string; }
  | { slotId: string; type: "image"; src: string; alt?: string; }
  | { slotId: string; type: "video"; src: string; poster?: string; title?: string; }
  | { slotId: string; type: "icon"; name: string; src?: string; }
  | { slotId: string; type: "list"; items: string[]; };
```

Example: `article-focus` recipe slots:
- `title` → text slot (max 220 chars, 2 lines)
- `eyebrow` → text slot (max 80 chars, 1 line)
- `hero` → media slot (image or video)
- `lead` → text slot (max 600 chars, 10 lines)
- `body` → text slot (max 800 chars, 14 lines)
- `key-points` → list slot (max 5 items, 200 chars each)

### Component Media Slots

Mapping of which recipes support media and where:

```typescript
PRESENTATION_COMPONENT_MEDIA_SLOTS: {
  "image-top-article": ["hero"],
  "profile-summary": ["portrait"],
  "video-spotlight": ["clip"],
  "a4-photo-grid": ["hero-photo", "detail-photo-1", "detail-photo-2", "detail-photo-3", "detail-photo-4"],
  // ... 25+ more
}

PRESENTATION_COMPONENT_MEDIA_SLOT_TYPES: {
  "image-top-article": { hero: "media" }, // media = image OR video
  "profile-summary": { portrait: "image" }, // image only
  "video-spotlight": { clip: "video" }, // video only
}
```

### Media Frame Styles

Custom shape/radius per media slot:

```typescript
PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES: {
  "image-top-article": { hero: { mediaShape: "rounded", mediaCornerRadius: 28 } },
  "profile-summary": { portrait: { mediaShape: "circle" } },
  "a4-photo-grid": {
    "hero-photo": { mediaShape: "rounded", mediaCornerRadius: 28 },
    "detail-photo-1": { mediaShape: "rounded", mediaCornerRadius: 22 },
  },
}
```

### Slot Budgets (Text Capacity)

Each slot has a **budget** defining maximum content:

```typescript
PRESENTATION_COMPONENT_SLOT_BUDGETS: {
  "article-focus": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    title: { maxChars: 220, preferredLines: 2 },
    lead: { maxChars: 600, preferredLines: 10 },
    body: { maxChars: 800, preferredLines: 14 },
    "key-points": { maxItems: 5, maxChars: 200, preferredLines: 8 },
    footnote: { maxChars: 200, preferredLines: 2 },
  },
}
```

**Text unit system** (multilingual support):
- Latin: 1.0 weight
- Thai: 1.2 weight (wider characters)
- Digits: 0.95 weight
- Punctuation: 0.55 weight
- Whitespace: 0.35 weight

Functions:
- `measurePresentationTextUnits(text)`: Calculate total units
- `clampPresentationTextToUnits(text, maxUnits)`: Truncate to fit
- `getPresentationComponentSlotTextCapacity()`: Get English/Thai char estimates

### Component Instance Structure

```typescript
type PresentationComponentInstance = {
  id: string; // unique within slide
  componentId: string; // e.g., "article-focus"
  componentType: string; // always "builtin-presentation-component" (for now)
  definitionRevision: number; // schema version
  slotBindings: PresentationComponentSlotBinding[]; // content
  fallbackElements: PresentationElement[]; // rendered elements
  preview?: PresentationPreviewArtifact; // cached thumbnail
};
```

### Rendering Order

Components and elements coexist on a slide with explicit render order:

```typescript
type PresentationSlideContent = {
  elements: PresentationElement[];
  components: PresentationComponentInstance[]; // optional
  renderOrder?: ("element:id-123" | "component:id-456")[]; // explicit z-order
  canvas: PresentationCanvasSize; // slide dimensions
  transition?: PresentationTransition;
  durationMs?: number;
  background?: PresentationSlideBackground;
  // ... audio, AI design, pending jobs
};
```

---

## 4. SLIDE DATA FORMAT (JSON Structure)

### PresentationSlideContent (Complete Schema)

```typescript
type PresentationSlideContent = {
  // ===== CORE ELEMENTS =====
  elements: PresentationElement[]; // max 500 per slide

  // ===== COMPONENTS (optional) =====
  components?: PresentationComponentInstance[]; // max 64 per slide

  // ===== RENDERING =====
  renderOrder?: string[]; // explicit z-order (e.g., "element:id-1", "component:id-2")

  // ===== CANVAS & STYLING =====
  canvas?: PresentationCanvasSize; // width, height, optional preset (16:9, 9:16, etc)
  background?: PresentationSlideBackground; // color or image

  // ===== PLAYBACK & TIMING =====
  transition?: "cut" | "fade" | "slide-left" | "slide-right" | "zoom-in" | "zoom-out" | "blur";
  durationMs?: number; // 250–120,000ms

  // ===== AUDIO (per-slide) =====
  audioTracks?: ResolvedAudioTrack[]; // background audio

  // ===== PENDING MEDIA JOBS =====
  pendingMediaJobs?: PresentationPendingMediaJob[]; // in-flight image/video generation

  // ===== AI DESIGN METADATA =====
  aiDesign?: PresentationSlideAIDesign; // AI generation history, fit scores, recipes tried

  // ===== FLAGS =====
  visualOnly?: boolean; // presentation-only slide (no editing)
};
```

### Canvas Size

```typescript
type PresentationCanvasSize = {
  preset?: "16:9" | "9:16" | "4:3" | "3:4" | "4:5" | "5:4" | "1:1";
  width: number; // 1–10,000px
  height: number; // 1–10,000px
};
```

### Background

```typescript
type PresentationSlideBackground =
  | { type: "color"; value: string; } // hex or rgb
  | { type: "image"; url: string; libraryItemId?: number; };
```

### Pending Media Job (for AI generation tracking)

```typescript
type PresentationPendingMediaJob = {
  id: string;
  mediaType: "image" | "video";
  mediaTaskId: string; // task ID in media system
  providerTaskId?: string; // external provider task ID
  targetElementId?: string; // which element to fill
  targetSlotId?: string; // or which component slot
  targetX: number;
  targetY: number;
  targetWidth: number;
  targetHeight: number;
  modelId?: string; // e.g., "openai:dall-e-3"
  prompt?: string;
  status?: "pending" | "processing" | "failed";
  reason?: string;
  createdAt: string; // ISO timestamp
  lastCheckedAt?: string;
};
```

### AI Design Metadata

```typescript
type PresentationSlideAIDesign = {
  source: "draft-with-ai";
  taskId?: string;
  mode?: PresentationAILayoutMode; // e.g., "article-focus"
  modeLocked?: boolean;
  componentRecipeId?: string;
  fitScore?: {
    overall: number; // 0–1
    density: number;
    readability: number;
    overflowRisk: number;
    deckConsistency?: number;
    status: "fits" | "cramped" | "unsafe";
  };
  narrative?: {
    title: string;
    body: string[];
    sections?: Array<{ heading: string; details: string[]; }>;
  };
  candidateRecipes?: Array<{ recipeId: string; score: number; }>;
  fallbackHistory?: Array<{ step: string; from?: string; to?: string; reason: string; timestamp: string; }>;
  mediaModeMetadata?: {
    provider?: string;
    modelId?: string;
    visualIntent?: "cover" | "poster" | "infographic" | "summary_visual";
    thaiTextRisk?: "low" | "medium" | "high";
  };
};
```

### Complete Example: Article-Focus Slide

```json
{
  "elements": [
    {
      "id": "text-1",
      "type": "text",
      "x": 100,
      "y": 50,
      "width": 400,
      "height": 80,
      "text": "AI in Design",
      "color": "#000000",
      "fontSize": 48,
      "fontWeight": "700"
    },
    {
      "id": "image-1",
      "type": "image",
      "x": 100,
      "y": 150,
      "width": 400,
      "height": 300,
      "src": "https://example.com/hero.jpg",
      "alt": "Hero image",
      "imageFit": "cover",
      "mediaShape": "rounded",
      "mediaCornerRadius": 28
    }
  ],
  "components": [
    {
      "id": "comp-1",
      "componentId": "article-focus",
      "componentType": "builtin-presentation-component",
      "definitionRevision": 1,
      "slotBindings": [
        { "slotId": "title", "type": "text", "text": "AI in Design Systems" },
        { "slotId": "hero", "type": "image", "src": "...", "alt": "..." },
        { "slotId": "lead", "type": "text", "text": "How AI is transforming design workflows..." }
      ],
      "fallbackElements": [
        { "id": "fb-text-1", "type": "text", "x": 0, "y": 0, ... },
        { "id": "fb-text-2", "type": "text", "x": 0, "y": 60, ... }
      ]
    }
  ],
  "renderOrder": ["element:text-1", "component:comp-1", "element:image-1"],
  "canvas": { "preset": "16:9", "width": 1280, "height": 720 },
  "background": { "type": "color", "value": "#ffffff" },
  "transition": "fade",
  "durationMs": 5000,
  "aiDesign": {
    "source": "draft-with-ai",
    "mode": "article-focus",
    "fitScore": {
      "overall": 0.92,
      "density": 0.88,
      "readability": 0.95,
      "overflowRisk": 0.85,
      "status": "fits"
    }
  }
}
```

---

## 5. PRESENTATION EDITOR (PresentationEditor.tsx)

### Overview
`apps/web/client/src/pages/PresentationEditor.tsx` is the main editor UI. **~5000 lines**, manages:
- Canvas rendering and interaction
- Element/component selection and manipulation
- Slide panel, property panel, toolbar
- Undo/redo via CommandBus
- Drag-and-drop asset insertion
- Mobile gestures (swipe, pinch)
- AI integration (draft-with-ai)

### Key State

```typescript
// Slide/content
const [slideContent, setSlideContent] = useState<PresentationSlideContent>(ensureSlideContent());
const [slideNoteDraft, setSlideNoteDraft] = useState<string>("");
const [slideNoteDialogOpen, setSlideNoteDialogOpen] = useState(false);

// Selection & interaction
const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
const [cropModeElementId, setCropModeElementId] = useState<string | null>(null);
const [cropModeTarget, setCropModeTarget] = useState<"content" | "frame">("content");

// Canvas
const canvasRef = useRef<HTMLDivElement>(null);
const [canvasSize, setCanvasSize] = useState<PresentationCanvasSize>({ width: 1280, height: 720 });

// Undo/redo
const commandBusRef = useRef(new CommandBus());
const [undoCount, setUndoCount] = useState(0);

// Playback
const audioTrackPlayer = useRef<AudioTrackPlayer | null>(null);
const [slideDurationMs, setSlideDurationMs] = useState(slideContent.durationMs ?? 5000);
```

### Main Mutations & Handlers

**Save slide**:
```typescript
async function handleSaveSlide() {
  const payload = {
    slideId: route.params.slideId,
    slideContent,
    notes: slideNoteDraft,
    transition: slideContent.transition,
    durationMs: slideDurationMs,
  };
  await trpc.presentation.updateSlide.mutate(payload);
  toast.success("Slide saved");
}
```

**Insert element**:
```typescript
function handleInsertElement(elementType: PresentationElementType) {
  const newElement = createElement(elementType, {
    x: 100,
    y: 100,
    width: 200,
    height: 100,
  });
  const updated = insertElement(slideContent, newElement);
  setSlideContent(updated);
  commandBusRef.current.execute({
    redo: () => setSlideContent(updated),
    undo: () => setSlideContent(slideContent),
  });
}
```

**Apply block preset**:
```typescript
function handleApplyBlockPreset(presetId: PresentationBlockPresetId) {
  const presetElements = buildPresentationBlockPreset(presetId, {
    canvas: slideContent.canvas ?? { width: 1280, height: 720 },
    makeId: (type) => `${type}-${Date.now()}`,
  });
  const updated = { ...slideContent, elements: presetElements };
  setSlideContent(updated);
}
```

**Update element property**:
```typescript
function handleUpdateElement(elementId: string, patch: PresentationElementPatch) {
  const updated = updateElementById(slideContent, elementId, patch);
  setSlideContent(updated);
}
```

### Canvas Rendering

```typescript
<CanvasStage
  slideContent={slideContent}
  selectedElementIds={selectedElementIds}
  onSelectElement={(id) => setSelectedElementIds([id])}
  onUpdateElement={(id, patch) => handleUpdateElement(id, patch)}
  canvasWidth={canvasSize.width}
  canvasHeight={canvasSize.height}
  showElementFrames={showElementFrames}
/>
```

### Slide Notes Dialog

**Location**: Lines 9997–10066

```typescript
{slideNoteDialogOpen && (
  <Dialog open={slideNoteDialogOpen} onOpenChange={setSlideNoteDialogOpen}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Slide Notes</DialogTitle>
      </DialogHeader>
      <Textarea
        value={slideNoteDraft}
        onChange={(e) => setSlideNoteDraft(e.target.value)}
        placeholder="Add notes for this slide..."
        rows={14}
        maxLength={5000}
      />
      <DialogFooter>
        <Button onClick={() => setSlideNoteDialogOpen(false)}>Done</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)}
```

**State**:
- `slideNoteDraft` (line 2321): Local editing state
- `slideNoteDialogOpen` (line 2328): Dialog visibility
- Dirty flag tracks if unsaved (line 2688)

### AI Integration (Draft with AI)

```typescript
const handleDraftWithAI = async () => {
  const result = await trpc.presentation.generateAIDraft.mutate({
    slideId: route.params.slideId,
    narrative: {
      title: "...",
      body: [...],
      sections: [...],
    },
  });

  // Apply result to slide
  const updated = {
    ...slideContent,
    components: [buildBuiltInPresentationComponentInstanceFromNarrative(...)],
    aiDesign: result.aiDesign,
  };
  setSlideContent(updated);
};
```

---

## 6. SLIDE NOTES VS PRESENTATION NOTES

### Slide Notes
- **Purpose**: Speaker notes, editing reminders, content references (per-slide)
- **Stored in**: `presentations.slideNotes` column
- **UI**: Modal dialog in PresentationEditor (lines 9997–10066)
- **Max length**: 5000 chars
- **User-facing**: Presenter view / speaker cards during playback
- **Editing**: Edit inline in dialog, save with slide update

### Presentation Notes (Deck-level)
- **Purpose**: Deck metadata, description, project-wide notes
- **Stored in**: `presentations.metadata` (JSON column)
- **UI**: Deck settings/properties (not in PresentationEditor)
- **Max length**: Typically unrestricted (text field)
- **User-facing**: Deck info, share tooltips, archive context

**Key difference**: Slide notes are **per-slide and speaker-focused**; presentation notes are **project-level and descriptive**.

---

## 7. AI PRESENTATION SERVICE (aiPresentationService.ts)

### Overview
`apps/web/server/services/aiPresentationService.ts` handles AI-powered slide generation. **~2500 lines**, manages:
- LLM-based layout selection
- Recipe fitting & quality evaluation
- Media generation coordination
- Content profiling & consistency
- Fallback strategies

### Main Functions

#### `generateAIDraft(input: GenerateAIDraftInput)`

```typescript
async function generateAIDraft(input: {
  deckId: number;
  narrativeInput: PresentationRecipeNarrativeInput;
  preferredLayoutMode?: PresentationAILayoutMode;
  includeMediaGeneration?: boolean;
  mediaGenerationBudget?: number;
}): Promise<{
  slide: PresentationSlideContent;
  aiDesign: PresentationSlideAIDesign;
  mediaJobs: PresentationPendingMediaJob[];
  fitScore: PresentationAIDesignFitScore;
}> {
  // 1. Build content profile from narrative
  const profile = buildPresentationContentProfile(narrativeInput);

  // 2. Select best layout mode from candidates
  const selectedMode = resolvePresentationLayoutMode(profile, {
    preferredMode: input.preferredLayoutMode,
  });

  // 3. Build component instance from recipe
  const component = buildBuiltInPresentationComponentInstanceFromNarrative(
    selectedMode.recipeId,
    { narrative: narrativeInput }
  );

  // 4. Evaluate fit score
  const fitScore = evaluatePresentationRecipeSlotFit(component.slotBindings);

  // 5. Generate media if requested
  const mediaJobs = includeMediaGeneration
    ? createMediaGenerationJobs(component.slotBindings, narrativeInput.mediaPlan)
    : [];

  return {
    slide: {
      components: [component],
      elements: component.fallbackElements,
      aiDesign: { source: "draft-with-ai", mode: selectedMode, fitScore, ... },
      pendingMediaJobs: mediaJobs,
    },
    aiDesign: {...},
    mediaJobs,
    fitScore,
  };
}
```

#### Layout Mode Selection

```typescript
type PresentationAILayoutMode =
  | "article-focus"
  | "sectioned-explainer"
  | "profile-summary"
  | "timeline-flow"
  | "feature-highlights"
  | ... (31 total);

function resolvePresentationLayoutMode(
  profile: PresentationContentProfile,
  options: { preferredMode?: PresentationAILayoutMode }
): {
  mode: PresentationAILayoutMode;
  score: number;
  reason: string;
} {
  // Rank all layout modes based on:
  // - Content density (paragraphs, bullet points, etc.)
  // - Media availability
  // - Text length
  // - Section count

  const candidates = PRESENTATION_COMPONENT_AI_GUIDANCE.map(mode => ({
    mode,
    score: evaluateLayoutFitForContent(profile, mode),
  }));

  return candidates.sort((a, b) => b.score - a.score)[0];
}
```

#### Fit Score Evaluation

```typescript
interface PresentationAIDesignFitScore {
  overall: number; // 0–1
  density: number; // Is content too dense?
  readability: number; // Is text readable?
  overflowRisk: number; // Will content fit?
  deckConsistency?: number; // Does it match other slides?
  status: "fits" | "cramped" | "unsafe";
}

function evaluatePresentationRecipeSlotFit(
  slotBindings: PresentationComponentSlotBinding[]
): PresentationAIDesignFitScore {
  let density = 1.0;
  let readability = 1.0;
  let overflowRisk = 0.0;

  for (const binding of slotBindings) {
    if (binding.type === "text") {
      const units = measurePresentationTextUnits(binding.text);
      const budget = getBudgetFor(binding.slotId);

      if (units > budget * 1.3) overflowRisk += 0.2; // 30% overflow = risky
      if (units > budget * 0.8) density -= 0.1; // Getting dense
    }
    if (binding.type === "list") {
      if (binding.items.length > 5) overflowRisk += 0.15;
    }
  }

  const overall = (density + readability + (1 - overflowRisk)) / 3;
  return {
    overall: Math.max(0, Math.min(1, overall)),
    density,
    readability,
    overflowRisk,
    status: overall > 0.8 ? "fits" : overall > 0.6 ? "cramped" : "unsafe",
  };
}
```

#### Media Generation Coordination

```typescript
function createMediaGenerationJobs(
  slotBindings: PresentationComponentSlotBinding[],
  mediaPlan?: Array<{ slotId: string; prompt: string }>
): PresentationPendingMediaJob[] {
  const jobs: PresentationPendingMediaJob[] = [];

  for (const plan of mediaPlan ?? []) {
    const slot = slotBindings.find(b => b.slotId === plan.slotId);
    if (!slot) continue;

    const mediaType = slot.type === "video" ? "video" : "image";

    jobs.push({
      id: generateId(),
      mediaType,
      mediaTaskId: generateId(),
      targetSlotId: plan.slotId,
      targetX: 0,
      targetY: 0,
      targetWidth: 400,
      targetHeight: 300,
      modelId: "openai:dall-e-3",
      prompt: plan.prompt,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  }

  return jobs;
}
```

### Key Integration Points

1. **tRPC endpoint**: `presentation.generateAIDraft` (in routers/presentation.ts)
2. **Credit deduction**: `deductCreditsForModel()` called before generation
3. **Audit logging**: All generations logged to `apiAuditEvents` table
4. **Skill system**: Can call skills for narrative generation (e.g., "Article Writer")

---

## 8. CANVAS OBJECTS (CanvasObjects.tsx)

### Overview
`apps/web/client/src/presentation-canvas/CanvasObjects.tsx` renders elements as interactive DOM objects.

### Key Props

```typescript
interface CanvasObjectsProps {
  elements: PresentationElement[];
  selectedElementIds: string[];
  activeElementIds?: string[];
  onSelectElement: (elementId: string, options?: { additive?: boolean }) => void;
  onFocusElement?: (elementId: string) => void;
  onMoveSelection: (deltaX: number, deltaY: number) => void;
  onResizeSelection: (width: number, height: number) => void;
  onRotateSelection: (deltaDegrees: number) => void;
  onDragEnd?: () => void;
  interactionScale: number;
  canvasWidth: number;
  canvasHeight: number;
  showElementFrames?: boolean; // Show borders on idle
  autoPlayVideos?: boolean;
  showVideoPlaybackToggle?: boolean;
  cropModeElementId?: string | null;
  cropModeTarget?: "content" | "frame";
  onAdjustMediaCrop?: (elementId: string, patch: PresentationElementPatch) => void;
  mediaMotionTiming?: CanvasMediaMotionTiming;
}
```

### Element Rendering

Each element renders as a `<div>` with:
- Absolute positioning: `left`, `top`, `width`, `height`
- Transform: `rotate()` for rotation
- Selection styles: blue border + ring if selected
- Element-specific content:
  - **Text**: `<p>` with font properties
  - **Image**: `<img>` or inline SVG
  - **Video**: `<video>` or poster image
  - **Rect**: CSS background-color
  - **Line**: CSS border

### Pointer Handling

Drag modes via `PointerDragState`:
- `move`: Translate element
- `resize`: Change width/height
- `rotate`: Spin element
- `crop`: Adjust image/video position within frame
- `crop-resize`: Adjust both frame and content

### Media Motion Support

```typescript
const motionFrame = computeMediaMotionTimelineFrame(
  element.mediaMotion,
  timing.elapsedMs,
  timing.slideDurationMs
);

// Apply transform with motion
const style = {
  transform: `translate(${motionFrame.translateXPercent}%, ${motionFrame.translateYPercent}%) scale(${baseZoom * motionFrame.scaleMultiplier})`,
  transformOrigin: `${positionX}% ${positionY}%`,
};
```

---

## 9. SLIDE ELEMENT PREVIEW (SlideElementPreview.tsx)

### Overview
`apps/web/client/src/presentation-canvas/components/SlideElementPreview.tsx` renders read-only thumbnail/preview of a slide.

### Props

```typescript
interface SlideElementPreviewProps {
  elements: PresentationElement[];
  canvasSize: PresentationCanvasSize;
  background?: PresentationSlideBackground;
  testId?: string;
  targetWidth?: number; // Scale to this width
  className?: string;
}
```

### Rendering Strategy

1. **Calculate render scale** from `targetWidth` (default: 272px)
   ```typescript
   const renderScale = (targetWidth ?? DEFAULT_PREVIEW_WIDTH) / canvasSize.width;
   ```

2. **Position elements as percentages** of canvas size
   ```typescript
   const style = {
     left: `${(element.x / canvasSize.width) * 100}%`,
     top: `${(element.y / canvasSize.height) * 100}%`,
     width: `${(element.width / canvasSize.width) * 100}%`,
     height: `${(element.height / canvasSize.height) * 100}%`,
   };
   ```

3. **Scale fonts and spacing** by render scale
   ```typescript
   const fontSize = rawFontSize * renderScale;
   const padding = 8 * renderScale;
   ```

4. **Render background**
   ```typescript
   // Color background
   if (background?.type === "color") {
     return <div style={{ backgroundColor: background.value }} />;
   }

   // Image background
   if (background?.type === "image") {
     return <img src={background.url} />;
   }
   ```

5. **Element-specific rendering**:
   - **Text**: `<p>` with all font properties
   - **Image**: `<img>` with `objectFit` and `objectPosition`
   - **Video**: Poster image or placeholder
   - **Rect**: CSS background
   - **Line**: CSS border

### Used In

- Slide thumbnail in slide panel (left sidebar)
- Deck library card preview
- Export preview
- Share image generation

---

## KEY DATA STRUCTURES (Summary)

### Element Type Tree

```
PresentationElement
├─ PresentationTextElement
├─ PresentationImageElement
├─ PresentationVideoElement
├─ PresentationRectElement
└─ PresentationLineElement
```

### Component Structure

```
PresentationComponentInstance
├─ id: string
├─ componentId: string (recipe ID)
├─ componentType: "builtin-presentation-component"
├─ slotBindings: PresentationComponentSlotBinding[]
├─ fallbackElements: PresentationElement[]
└─ preview: PresentationPreviewArtifact
```

### Slide Content

```
PresentationSlideContent
├─ elements: PresentationElement[]
├─ components: PresentationComponentInstance[]
├─ renderOrder: string[] (z-order)
├─ canvas: PresentationCanvasSize
├─ background: PresentationSlideBackground
├─ transition: PresentationTransition
├─ durationMs: number
├─ audioTracks: ResolvedAudioTrack[]
├─ pendingMediaJobs: PresentationPendingMediaJob[]
└─ aiDesign: PresentationSlideAIDesign
```

---

## CRITICAL PATHS

### Creating a slide from a preset
1. User clicks "Process Steps" preset
2. `buildPresentationBlockPreset("process-steps", { canvas, makeId })`
3. Returns `PresentationElement[]` (100+ elements)
4. Set `slideContent.elements = presetElements`
5. Render in CanvasObjects

### Creating a slide from AI narrative
1. User inputs narrative (title, body, sections)
2. `generateAIDraft({ narrative })`
3. Select best recipe (e.g., "article-focus")
4. Build component instance with slot bindings
5. Generate fallback elements
6. Return component instance with aiDesign metadata
7. Set `slideContent.components = [component]`
8. Render in CanvasObjects (components render their fallbackElements)

### Editing a text element
1. User selects text element → `onSelectElement(elementId)`
2. PropertyPanel shows text properties
3. User edits text → `onUpdateElement(elementId, { text: newText })`
4. `updateElementById(slideContent, elementId, patch)`
5. Slide content updated → CanvasObjects re-renders
6. Save: `trpc.presentation.updateSlide.mutate({ slideContent })`

---

## SCHEMA VERSIONS

| Name | Version | Purpose |
|------|---------|---------|
| `PRESENTATION_RENDER_SCHEMA_VERSION` | 1 | Element & slide structure |
| `PRESENTATION_SLIDESHOW_SCHEMA_VERSION` | 2 | Deck playback metadata |
| `PRESENTATION_EXPORT_SCHEMA_VERSION` | 3 | Export format (MP4, PNG) |
| `PRESENTATION_COMPATIBILITY_SCHEMA_VERSION` | 4 | Format detection (PPTX, Google Slides) |

---

## LIMITS

```typescript
PRESENTATION_LIMITS = {
  maxElementsPerSlide: 500,
  maxComponentsPerSlide: 64,
  maxSlidesPerDeck: 500,
  maxCharactersPerSlide: 50_000,
  maxSlideNoteLength: 5_000,
  maxTextElementLength: 10_000,
  maxAudioTracksPerSlide: 8,
  maxPendingMediaJobs: 32,
};
```

---

## DEBUGGING CHECKLIST

- [ ] Is `slideContent` hydrated (all required fields)?
- [ ] Is `renderOrder` defined if using both elements and components?
- [ ] Do all element IDs in `renderOrder` exist?
- [ ] Is canvas size valid (1–10,000 px)?
- [ ] Are text metrics within slot budgets?
- [ ] Do media slots exist in the recipe definition?
- [ ] Is `aiDesign` metadata complete if AI-generated?
- [ ] Have pending media jobs been resolved?

