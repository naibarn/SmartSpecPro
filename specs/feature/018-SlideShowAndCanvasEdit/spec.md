# Feature Spec 018: Slideshow Presentation & Canvas Editor

**Status:** Draft
**Created:** 2026-02-22
**Author:** AI Architect
**Priority:** High
**Estimated Scope:** Large (multi-phase)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [User Stories](#3-user-stories)
4. [System Architecture](#4-system-architecture)
5. [Data Model](#5-data-model)
6. [Storage Layout](#6-storage-layout)
7. [Canvas Editor](#7-canvas-editor)
8. [Presentation Player](#8-presentation-player)
9. [Audio & Narration System](#9-audio--narration-system)
10. [Convert to Video](#10-convert-to-video)
11. [RAG Integration](#11-rag-integration)
12. [Document Management Integration](#12-document-management-integration)
13. [API Endpoints](#13-api-endpoints)
14. [UI Component Architecture](#14-ui-component-architecture)
15. [Generation Pipeline](#15-generation-pipeline)
16. [Keyboard Shortcuts](#16-keyboard-shortcuts)
17. [Security & Permissions](#17-security--permissions)
18. [Performance Considerations](#18-performance-considerations)
19. [Migration & Compatibility](#19-migration--compatibility)
20. [Future Roadmap](#20-future-roadmap)
21. [Appendices](#21-appendices)

---

## 1. Overview

### Problem Statement

SmartSpecPro already has powerful AI image generation skills (Image Creator, Image Prompt Engineer supporting up to 16 prompts), video generation (Kie.ai), and audio generation (ElevenLabs TTS, Suno music). Users can generate individual media assets, but there is no way to compose them into a multi-page presentation or slideshow — a fundamental need for content creators, educators, and marketers.

### Solution

Build a **Presentation & Canvas Editor** system integrated into Document Management that allows users to:

- Create multi-slide presentations where each slide is a composable canvas
- Layer images, videos, audio clips, and styled text on each slide
- Edit element positions, sizes, and properties via a drag-and-drop canvas
- Play presentations in fullscreen with transitions and auto-advance
- Add narration audio per-slide or across the entire presentation
- Convert presentations to video using the existing FFmpeg rendering pipeline

### Design Philosophy

- **Image-first, layer-capable** — Most slides start as a single AI-generated image; users can progressively add layers
- **Compatible with existing systems** — Uses the same storage (S3/R2), RAG indexing (library_chunks + Vectorize), media generation (Kie.ai), and rendering pipeline (FFmpeg/Celery)
- **Canva-like canvas editing** — Free-positioning of elements with snap guides, resize handles, and property panels
- **Progressive enhancement** — MVP delivers image+text slides with playback; subsequent phases add video overlays, animations, and collaborative editing

---

## 2. Goals & Non-Goals

### Goals

| # | Goal | Success Metric |
|---|------|----------------|
| G1 | Create/edit multi-slide presentations in Document Management | User can create, open, and save presentations from My Library |
| G2 | Canvas editor with drag-and-drop element positioning | Elements (image, video, audio, text) can be placed, moved, resized, rotated on canvas |
| G3 | Insert media from library or generate new | Insert dialog queries existing library + supports on-the-fly AI generation |
| G4 | Fullscreen presentation playback | Play slides with transitions, auto-advance, keyboard navigation, and narration |
| G5 | Audio narration system | Per-slide audio or presentation-wide audio track with playback sync |
| G6 | Convert to video | One-click export to MP4 via existing FFmpeg pipeline, with option to open in video editor |
| G7 | RAG-searchable slides | Each slide indexed in library_chunks with text + AI image descriptions |
| G8 | Mobile-responsive viewer | Presentation viewer works on tablet/mobile with touch gestures |

### Non-Goals (for this spec)

| # | Non-Goal | Rationale |
|---|----------|-----------|
| NG1 | Real-time collaborative editing | Requires CRDT/OT infrastructure; deferred to future |
| NG2 | Custom animations timeline per element | Complex keyframe editor; deferred to future (Phase 5+) |
| NG3 | Import .pptx/.key files and parse into native slides | File format parsing is complex; keep Office preview for imported files |
| NG4 | AI auto-layout / smart design suggestions | Requires design AI; out of scope for initial release |
| NG5 | Embedded interactive widgets (forms, polls, charts) | Complex interactivity; deferred |

---

## 3. User Stories

### 3.1 Creation & Editing

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-01 | Content creator | Create a new presentation from Document Management | I have a project file that groups my slides |
| US-02 | Content creator | Add slides from AI image generation or my library | Each slide has a high-quality background image |
| US-03 | Content creator | Open the canvas editor for any slide | I can position and layer elements visually |
| US-04 | Content creator | Insert images, videos, or audio onto a slide canvas | I can compose rich multimedia slides |
| US-05 | Content creator | Add styled text boxes with font, size, color, and alignment | I can add titles, captions, and body text |
| US-06 | Content creator | Drag, resize, and rotate elements on the canvas | I can arrange the layout exactly as I want |
| US-07 | Content creator | Reorder slides via drag-and-drop in the slide panel | I can organize my presentation flow |
| US-08 | Content creator | Duplicate, delete, or insert slides at any position | I can quickly build and restructure |
| US-09 | Content creator | Set per-slide or global transition effects | Slides transition smoothly during playback |
| US-10 | Content creator | Undo/redo all canvas and slide operations | I can safely experiment with changes |

### 3.2 Audio & Narration

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-11 | Presenter | Add narration audio to individual slides | Each slide has voiceover matching its content |
| US-12 | Presenter | Add a background music track across all slides | The presentation has ambient audio throughout |
| US-13 | Presenter | Generate TTS narration from slide text/notes | I don't need to record my own voice |
| US-14 | Presenter | Control audio volume per slide and globally | Audio levels are balanced |
| US-15 | Presenter | Preview audio while editing a slide | I can verify sync before presenting |

### 3.3 Presentation Playback

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-16 | Presenter | Play slides fullscreen with transitions | I can present professionally |
| US-17 | Presenter | Navigate with keyboard (arrows, space, escape) | I can present without a mouse |
| US-18 | Presenter | Enable auto-advance with configurable timing | Slides play like a video |
| US-19 | Presenter | See slide counter and progress bar | I know my position in the deck |
| US-20 | Audience | View a shared presentation in read-only mode | I can review without editing |

### 3.4 Export & Integration

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| US-21 | Creator | Convert my presentation to MP4 video | I can share on social media or embed in websites |
| US-22 | Creator | Open the converted video in the video editor | I can add advanced effects, cuts, and overlays |
| US-23 | Creator | Export as PDF (static slides) | I can share a printable version |
| US-24 | Creator | Download as ZIP (images + manifest) | I have an offline backup of all assets |

---

## 4. System Architecture

### 4.1 High-Level Data Flow

```
                        ┌──────────────────┐
                        │  Document Mgmt   │
                        │  (My Library)    │
                        └────────┬─────────┘
                                 │ create/open
                                 ▼
                        ┌──────────────────┐
                        │  Canvas Editor   │  ← drag, resize, insert elements
                        │  (React + FM)    │
                        └────────┬─────────┘
                                 │ save
                                 ▼
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                   ▼
    ┌─────────────────┐ ┌──────────────┐  ┌──────────────────┐
    │  PostgreSQL      │ │  S3/R2       │  │  Vectorize       │
    │  presentations   │ │  images/     │  │  (RAG index)     │
    │  slides          │ │  videos/     │  │  library_chunks  │
    │  slide_elements  │ │  audio/      │  └──────────────────┘
    └─────────────────┘ └──────────────┘
              │                  │
              ▼                  ▼
    ┌─────────────────┐ ┌──────────────────┐
    │  Presentation   │ │  Convert to      │
    │  Player         │ │  Video (FFmpeg)  │
    │  (Fullscreen)   │ │  via Celery      │
    └─────────────────┘ └──────────────────┘
```

### 4.2 Component Architecture

```
PresentationEditor (main container)
├── SlidePanel (left sidebar)
│   ├── SlideThumbnailList (sortable, drag-reorder)
│   ├── AddSlideButton (dropdown: blank, from library, AI generate)
│   └── SlideContextMenu (duplicate, delete, move up/down)
│
├── CanvasEditor (center workspace)
│   ├── CanvasViewport (zoom/pan container, aspect-ratio locked)
│   │   ├── SlideBackground (color or image layer)
│   │   ├── ElementRenderer[] (positioned elements with drag/resize handles)
│   │   │   ├── ImageElement
│   │   │   ├── VideoElement (with play/pause controls)
│   │   │   ├── AudioElement (visual indicator, waveform)
│   │   │   └── TextElement (inline editable, styled)
│   │   └── SelectionOverlay (bounding box, snap guides, alignment helpers)
│   ├── CanvasToolbar (insert, text, shapes, zoom, undo/redo)
│   └── SnapGuideRenderer (center, edge, element-to-element snapping)
│
├── PropertyPanel (right sidebar)
│   ├── ElementProperties (position, size, rotation, opacity)
│   ├── TextProperties (font, size, color, alignment, effects)
│   ├── MediaProperties (object-fit, crop, filters)
│   ├── SlideProperties (background, transition, duration, notes)
│   └── AudioProperties (volume, fade in/out, playback range)
│
└── BottomBar
    ├── AudioTimeline (presentation-wide audio track visualization)
    ├── SlideAudioIndicators (per-slide audio markers)
    └── PlaybackControls (play, present fullscreen, export)
```

### 4.3 Integration Points with Existing Systems

| System | Integration | Direction |
|--------|------------|-----------|
| Document Management | `library_items` with `itemType: "presentation"` | Bidirectional |
| Media Generation | Batch image generation, TTS narration | Presentation → Media service |
| Video Editor | Convert presentation → `VideoEditorProject` JSON | Presentation → Video Editor |
| RAG / Vectorize | Index slide content as `library_chunks` | Presentation → Library indexing |
| Storage (S3/R2) | Store all slide assets | Bidirectional |
| Skill Engine | Trigger image/video/audio skills from canvas | Canvas → Skill executor |
| Sharing / Permissions | `library_permissions` on the presentation's `library_item` | Bidirectional |

---

## 5. Data Model

### 5.1 New Tables

#### `presentations` — The project file

```typescript
export const presentationStatusEnum = pgEnum("presentation_status", [
  "draft",       // Being created/edited
  "generating",  // AI generating slide content
  "ready",       // All slides ready, viewable
  "archived",    // Soft-archived
  "failed",      // Generation failed
]);

export const presentations = pgTable("presentations", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  ownerUserId: integer("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // --- Identity ---
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: presentationStatusEnum("status").notNull().default("draft"),

  // --- Canvas dimensions ---
  canvasWidth: integer("canvas_width").notNull().default(1920),
  canvasHeight: integer("canvas_height").notNull().default(1080),
  aspectRatio: varchar("aspect_ratio", { length: 16 }).notNull().default("16:9"),
  // Presets: "16:9" (1920x1080), "4:3" (1440x1080), "9:16" (1080x1920),
  //          "1:1" (1080x1080), "custom"

  // --- Playback settings ---
  playbackSettings: json("playback_settings").$type<PresentationPlaybackSettings>()
    .notNull()
    .default({
      autoAdvance: false,
      autoAdvanceMs: 5000,
      defaultTransition: "fade",
      transitionDurationMs: 400,
      loop: false,
      showControls: true,
      showSlideCounter: true,
      showProgressBar: true,
    }),

  // --- Theme ---
  theme: json("theme").$type<PresentationTheme>()
    .notNull()
    .default({
      backgroundColor: "#000000",
      fontFamily: "Inter",
      primaryColor: "#3B82F6",
      accentColor: "#8B5CF6",
    }),

  // --- Global audio ---
  globalAudio: json("global_audio").$type<PresentationGlobalAudio>(),
  // null = no global audio

  // --- Generation metadata ---
  generationMeta: json("generation_meta").$type<PresentationGenerationMeta>(),

  // --- Library link (for RAG indexing) ---
  libraryItemId: integer("library_item_id")
    .references(() => libraryItems.id, { onDelete: "set null" }),

  // --- Summary fields ---
  thumbnailUrl: text("thumbnail_url"),
  slideCount: integer("slide_count").notNull().default(0),
  totalDurationMs: integer("total_duration_ms"),  // Computed: sum of slide durations
  version: integer("version").notNull().default(1),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("presentations_tenant_owner_idx").on(t.tenantId, t.ownerUserId),
  index("presentations_library_item_idx").on(t.libraryItemId),
]);
```

#### `slides` — Ordered pages within a presentation

```typescript
export const slideTransitionEnum = pgEnum("slide_transition", [
  "none", "fade", "slide_left", "slide_right", "slide_up", "slide_down",
  "zoom_in", "zoom_out", "wipe_left", "wipe_right",
  "circle_open", "circle_close", "dissolve",
]);

export const slides = pgTable("slides", {
  id: serial("id").primaryKey(),
  presentationId: integer("presentation_id")
    .notNull()
    .references(() => presentations.id, { onDelete: "cascade" }),

  // --- Ordering ---
  sortOrder: integer("sort_order").notNull(),  // 0-based, unique per presentation

  // --- Slide identity ---
  title: varchar("title", { length: 255 }),
  notes: text("notes"),  // Speaker notes (markdown)

  // --- Background ---
  backgroundColor: varchar("background_color", { length: 32 }).default("#000000"),
  backgroundImageUrl: text("background_image_url"),      // S3 URL
  backgroundImageKey: varchar("background_image_key", { length: 512 }),  // S3 key
  backgroundFit: varchar("background_fit", { length: 16 }).default("cover"),
  // "cover" | "contain" | "fill" | "none"

  // --- Transition (into this slide) ---
  transition: slideTransitionEnum("transition"),  // null = inherit from presentation
  transitionDurationMs: integer("transition_duration_ms"),  // null = inherit

  // --- Timing ---
  durationMs: integer("duration_ms").default(5000),  // Display duration for auto-advance
  // When audio is present, durationMs = max(audioDuration, durationMs)

  // --- Per-slide audio ---
  slideAudio: json("slide_audio").$type<SlideAudioConfig>(),
  // null = no slide-specific audio

  // --- RAG content ---
  textContent: text("text_content"),        // All visible text (for search indexing)
  aiDescription: text("ai_description"),    // AI-generated image description

  // --- Generation tracking ---
  generationStatus: varchar("generation_status", { length: 32 }).default("ready"),
  // "pending" | "generating" | "ready" | "failed"
  mediaTaskId: varchar("media_task_id", { length: 128 }),  // Link to media_tasks

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("slides_presentation_order_idx").on(t.presentationId, t.sortOrder),
  uniqueIndex("slides_presentation_sort_unique").on(t.presentationId, t.sortOrder),
  index("slides_media_task_idx").on(t.mediaTaskId),
]);
```

#### `slide_elements` — Layers within a slide

```typescript
export const slideElementTypeEnum = pgEnum("slide_element_type", [
  "image",          // Static image (PNG, JPEG, WebP, GIF, SVG)
  "video",          // Video overlay (MP4, WebM)
  "audio",          // Audio clip (visual indicator on canvas)
  "text",           // Styled text box
  "shape",          // Basic shapes (rectangle, circle, line, arrow)
]);

export const slideElements = pgTable("slide_elements", {
  id: serial("id").primaryKey(),
  slideId: integer("slide_id")
    .notNull()
    .references(() => slides.id, { onDelete: "cascade" }),

  // --- Type ---
  elementType: slideElementTypeEnum("element_type").notNull(),
  name: varchar("name", { length: 128 }),  // User-given or auto-generated label

  // --- Transform (pixel-based, relative to canvas dimensions) ---
  x: numeric("x", { precision: 10, scale: 2 }).notNull().default("0"),
  y: numeric("y", { precision: 10, scale: 2 }).notNull().default("0"),
  width: numeric("width", { precision: 10, scale: 2 }).notNull(),
  height: numeric("height", { precision: 10, scale: 2 }).notNull(),
  rotation: numeric("rotation", { precision: 6, scale: 2 }).notNull().default("0"),
  // degrees, 0 = no rotation

  // --- Stacking ---
  zOrder: integer("z_order").notNull().default(0),
  // Higher = in front. Background image is always at z = -1 (implicit)

  // --- Visibility & Opacity ---
  visible: boolean("visible").notNull().default(true),
  opacity: numeric("opacity", { precision: 4, scale: 3 }).notNull().default("1.000"),
  // 0.000 = fully transparent, 1.000 = fully opaque

  // --- Lock ---
  locked: boolean("locked").notNull().default(false),
  // Locked elements cannot be moved/resized on canvas

  // --- Type-specific content ---
  content: json("content").$type<SlideElementContent>().notNull(),

  // --- Animation (future-ready) ---
  animation: json("animation").$type<SlideElementAnimation>(),
  // null = no animation

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("slide_elements_slide_zorder_idx").on(t.slideId, t.zOrder),
]);
```

### 5.2 TypeScript Types for JSON Columns

```typescript
// =====================================================
// Playback Settings
// =====================================================
interface PresentationPlaybackSettings {
  autoAdvance: boolean;
  autoAdvanceMs: number;         // Default per-slide duration (ms) when auto-advancing
  defaultTransition: SlideTransition;
  transitionDurationMs: number;
  loop: boolean;
  showControls: boolean;         // Show nav controls overlay
  showSlideCounter: boolean;     // Show "3 / 12"
  showProgressBar: boolean;      // Show bottom progress bar
}

type SlideTransition =
  | "none" | "fade" | "slide_left" | "slide_right"
  | "slide_up" | "slide_down" | "zoom_in" | "zoom_out"
  | "wipe_left" | "wipe_right" | "circle_open"
  | "circle_close" | "dissolve";

// =====================================================
// Theme
// =====================================================
interface PresentationTheme {
  backgroundColor: string;       // Hex color
  fontFamily: string;            // Google Fonts family name
  primaryColor: string;
  accentColor: string;
  logoUrl?: string;              // S3 URL for branding logo
  logoPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  logoSize?: number;             // Percentage of canvas width (5-20)
}

// =====================================================
// Global Audio (across all slides)
// =====================================================
interface PresentationGlobalAudio {
  tracks: GlobalAudioTrack[];
}

interface GlobalAudioTrack {
  id: string;                    // UUID
  label: string;                 // "Background Music", "Narration"
  type: "music" | "narration" | "sound_effect";
  storageKey: string;            // S3 key
  url: string;                   // S3 URL (presigned or public)
  durationMs: number;
  volume: number;                // 0.0 - 1.0
  fadeInMs: number;
  fadeOutMs: number;
  loop: boolean;                 // Loop for music tracks
  startOffsetMs: number;         // Start at this position in the presentation timeline
  // For narration: timestamps where audio aligns with slides
  slideSync?: SlideSyncPoint[];
}

interface SlideSyncPoint {
  slideIndex: number;            // Which slide this segment belongs to
  audioStartMs: number;          // Start position in the audio file
  audioEndMs: number;            // End position in the audio file
}

// =====================================================
// Per-Slide Audio
// =====================================================
interface SlideAudioConfig {
  clips: SlideAudioClip[];
}

interface SlideAudioClip {
  id: string;                    // UUID
  label: string;
  type: "narration" | "sound_effect" | "music";
  storageKey: string;
  url: string;
  durationMs: number;
  volume: number;                // 0.0 - 1.0
  fadeInMs: number;
  fadeOutMs: number;
  trimStartMs: number;           // Trim start within source
  trimEndMs: number;             // Trim end within source
  autoGenerated: boolean;        // true if generated by TTS
  generationMeta?: {
    model: string;               // "elevenlabs-tts"
    voice: string;               // "alloy"
    sourceText: string;          // The text that was spoken
  };
}

// =====================================================
// Slide Element Content (discriminated union)
// =====================================================
type SlideElementContent =
  | ImageElementContent
  | VideoElementContent
  | AudioElementContent
  | TextElementContent
  | ShapeElementContent;

interface ImageElementContent {
  type: "image";
  storageKey: string;            // S3 key
  url: string;                   // S3 URL
  originalFilename?: string;
  objectFit: "cover" | "contain" | "fill" | "none";
  // Optional crop (normalized 0-1 within the source image)
  crop?: {
    x: number; y: number;       // Top-left of crop region
    width: number; height: number;
  };
  // Optional filters
  filters?: {
    brightness?: number;         // 0-200 (100 = normal)
    contrast?: number;
    saturation?: number;
    blur?: number;               // px
    grayscale?: boolean;
  };
  // Border
  borderRadius?: number;         // px
  borderColor?: string;
  borderWidth?: number;
  // Shadow
  shadow?: {
    offsetX: number;
    offsetY: number;
    blur: number;
    color: string;
  };
}

interface VideoElementContent {
  type: "video";
  storageKey: string;
  url: string;
  originalFilename?: string;
  durationMs: number;            // Total video duration
  trimStartMs: number;           // Playback start
  trimEndMs: number;             // Playback end
  autoplay: boolean;             // Play when slide enters
  loop: boolean;
  muted: boolean;
  volume: number;                // 0.0 - 1.0
  objectFit: "cover" | "contain" | "fill";
  thumbnailUrl?: string;         // Poster frame
  borderRadius?: number;
  shadow?: {
    offsetX: number;
    offsetY: number;
    blur: number;
    color: string;
  };
}

interface AudioElementContent {
  type: "audio";
  storageKey: string;
  url: string;
  originalFilename?: string;
  durationMs: number;
  trimStartMs: number;
  trimEndMs: number;
  volume: number;                // 0.0 - 1.0
  fadeInMs: number;
  fadeOutMs: number;
  autoplay: boolean;             // Play when slide enters
  loop: boolean;
  // Visual representation on canvas
  visualStyle: "waveform" | "icon" | "hidden";
  waveformColor?: string;
  iconColor?: string;
}

interface TextElementContent {
  type: "text";
  text: string;                  // Plain text or basic rich text
  // Typography
  fontFamily: string;            // Google Fonts family
  fontSize: number;              // px (relative to canvas)
  fontWeight: number;            // 100-900
  fontStyle: "normal" | "italic";
  lineHeight: number;            // multiplier (1.0, 1.2, 1.5, 2.0)
  letterSpacing: number;         // px
  textAlign: "left" | "center" | "right" | "justify";
  verticalAlign: "top" | "middle" | "bottom";
  // Colors
  color: string;                 // Hex text color
  backgroundColor?: string;      // Box background color (null = transparent)
  backgroundOpacity?: number;    // 0-1
  // Padding
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  // Text decoration
  textDecoration?: "none" | "underline" | "line-through";
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  // Text effects
  effect?: "none" | "shadow" | "outline" | "glow" | "neon";
  effectColor?: string;
  effectSize?: number;
  // Border
  borderRadius?: number;
  borderColor?: string;
  borderWidth?: number;
  // Overflow
  overflow: "visible" | "hidden" | "ellipsis";
}

interface ShapeElementContent {
  type: "shape";
  shapeType: "rectangle" | "circle" | "ellipse" | "line" | "arrow"
    | "triangle" | "star" | "rounded_rectangle";
  // Fill
  fill: string;                  // Hex color (empty string = no fill)
  fillOpacity: number;           // 0-1
  // Stroke
  stroke: string;                // Hex color
  strokeWidth: number;           // px
  strokeStyle: "solid" | "dashed" | "dotted";
  // Shape-specific
  borderRadius?: number;         // For rounded_rectangle
  arrowHeadSize?: number;        // For arrow
  points?: number;               // For star (5, 6, 8)
}

// =====================================================
// Animation (future-ready, stored but not rendered in Phase 1)
// =====================================================
interface SlideElementAnimation {
  enter?: {
    type: "fade_in" | "slide_in_left" | "slide_in_right" | "slide_in_up"
      | "slide_in_down" | "zoom_in" | "bounce" | "typewriter";
    durationMs: number;
    delayMs: number;
    easing: "linear" | "ease_in" | "ease_out" | "ease_in_out" | "spring";
  };
  exit?: {
    type: "fade_out" | "slide_out_left" | "slide_out_right"
      | "zoom_out" | "shrink";
    durationMs: number;
    easing: string;
  };
  // Future: keyframes for continuous animation during slide display
  continuous?: {
    type: "float" | "pulse" | "rotate" | "shimmer";
    durationMs: number;
    iterationCount: number | "infinite";
  };
}

// =====================================================
// Generation Metadata
// =====================================================
interface PresentationGenerationMeta {
  skillId?: string;
  prompt?: string;
  model?: string;
  batchId?: string;
  slidePrompts?: Array<{
    slideIndex: number;
    prompt: string;
    model: string;
    mediaTaskId?: string;
  }>;
}
```

### 5.3 Relations

```typescript
// Drizzle relations
export const presentationsRelations = relations(presentations, ({ one, many }) => ({
  owner: one(users, { fields: [presentations.ownerUserId], references: [users.id] }),
  tenant: one(tenants, { fields: [presentations.tenantId], references: [tenants.id] }),
  libraryItem: one(libraryItems, { fields: [presentations.libraryItemId], references: [libraryItems.id] }),
  slides: many(slides),
}));

export const slidesRelations = relations(slides, ({ one, many }) => ({
  presentation: one(presentations, { fields: [slides.presentationId], references: [presentations.id] }),
  elements: many(slideElements),
}));

export const slideElementsRelations = relations(slideElements, ({ one }) => ({
  slide: one(slides, { fields: [slideElements.slideId], references: [slides.id] }),
}));
```

### 5.4 Entity Relationship Diagram

```
┌───────────────┐       ┌──────────────┐       ┌────────────────┐
│ presentations │ 1───N │    slides    │ 1───N │ slide_elements │
├───────────────┤       ├──────────────┤       ├────────────────┤
│ id (PK)       │       │ id (PK)      │       │ id (PK)        │
│ tenantId (FK) │       │ presentationId│       │ slideId (FK)   │
│ ownerUserId   │       │ sortOrder    │       │ elementType    │
│ title         │       │ title        │       │ name           │
│ status        │       │ notes        │       │ x, y           │
│ canvasWidth   │       │ bgColor      │       │ width, height  │
│ canvasHeight  │       │ bgImageUrl   │       │ rotation       │
│ aspectRatio   │       │ bgImageKey   │       │ zOrder         │
│ playback (J)  │       │ bgFit        │       │ visible        │
│ theme (J)     │       │ transition   │       │ opacity        │
│ globalAudio(J)│       │ transDurMs   │       │ locked         │
│ genMeta (J)   │       │ durationMs   │       │ content (J)    │
│ libraryItemId │       │ slideAudio(J)│       │ animation (J)  │
│ thumbnailUrl  │       │ textContent  │       └────────────────┘
│ slideCount    │       │ aiDescription│
│ totalDurMs    │       │ genStatus    │
│ version       │       │ mediaTaskId  │
└───────┬───────┘       └──────────────┘
        │
        │ 1:1
        ▼
┌───────────────┐
│ library_items │  (existing table — itemType: "presentation")
│ ...           │
│ → library_    │
│   chunks      │  (one chunk per slide for RAG indexing)
│ → library_    │
│   permissions │  (sharing / access control)
└───────────────┘
```

---

## 6. Storage Layout

### 6.1 S3/R2 Key Structure

```
presentations/{tenantId}/{presentationId}/
├── slides/
│   ├── 000-background.webp          # Slide 0 background image
│   ├── 001-background.webp          # Slide 1 background image
│   └── ...
├── elements/
│   ├── {elementId}.webp              # Element images
│   ├── {elementId}.mp4               # Element videos
│   └── {elementId}.mp3               # Element audio
├── audio/
│   ├── global-music-{trackId}.mp3    # Presentation-wide music
│   ├── global-narration-{trackId}.mp3# Full narration track
│   ├── slide-{sortOrder}-narration.mp3   # Per-slide narration
│   └── slide-{sortOrder}-sfx.mp3         # Per-slide sound effect
├── thumbnails/
│   ├── slide-000-thumb.webp          # Slide thumbnails (400px wide)
│   ├── slide-001-thumb.webp
│   └── presentation-cover.webp       # Presentation cover thumbnail
├── exports/
│   ├── {presentationId}-{timestamp}.mp4   # Video export
│   ├── {presentationId}-{timestamp}.pdf   # PDF export
│   └── {presentationId}-{timestamp}.zip   # ZIP export
└── meta.json                         # JSON manifest (backup/interchange)
```

### 6.2 Storage Size Estimates

| Asset Type | Typical Size | Per Presentation (20 slides) |
|-----------|-------------|----------------------------|
| Background image (WebP, 1920x1080) | 200-500 KB | 4-10 MB |
| Slide thumbnail (400px wide) | 20-50 KB | 0.4-1 MB |
| Element image | 100-500 KB | Varies |
| Video overlay (30s clip) | 5-20 MB | Varies |
| Audio narration (per slide, 10s) | 50-200 KB | 1-4 MB |
| Background music (3 min) | 3-5 MB | 3-5 MB |
| **Total estimate** | | **10-40 MB** |

### 6.3 Lifecycle & Cleanup

- **Active presentations** — All assets retained
- **Archived presentations** — Assets retained but excluded from CDN cache warming
- **Deleted presentations** — Soft delete → 30-day retention → hard delete with S3 key cleanup
- **Orphaned assets** — Weekly cleanup job scans `presentations/` prefix for keys not referenced by any slide or element

---

## 7. Canvas Editor

### 7.1 Canvas Viewport

The canvas editor is the core workspace where users compose individual slides. It renders a fixed-aspect-ratio canvas within a resizable viewport.

**Coordinate system:**
- Canvas dimensions: `canvasWidth x canvasHeight` (e.g., 1920 x 1080)
- Element positions: Absolute pixel coordinates within the canvas
- Viewport: Scales the canvas to fit the browser viewport with letterboxing
- Zoom: 25% - 400%, default "fit to viewport"

**Rendering stack (bottom to top):**
```
z = -2  │  Canvas background (checkerboard pattern if transparent)
z = -1  │  Slide background color
z = 0   │  Slide background image (objectFit: cover/contain/fill)
z = 1+  │  Slide elements (ordered by zOrder)
z = top │  Selection handles, snap guides, alignment helpers (UI-only, not saved)
```

### 7.2 Element Manipulation

#### Selection

- **Single click** — Select one element
- **Ctrl/Cmd + click** — Add to selection (multi-select)
- **Click on empty canvas** — Deselect all
- **Drag on empty canvas** — Marquee selection box
- **Escape** — Deselect all

#### Drag (Move)

- **Mouse down on selected element** → begin drag
- Movement constrained to canvas bounds (configurable overflow)
- **Snap guides** appear at:
  - Canvas center (horizontal + vertical)
  - Canvas edges (with margin)
  - Other element edges and centers (element-to-element alignment)
  - Grid lines (if grid enabled, configurable spacing)
- **Shift + drag** → constrain to horizontal or vertical axis
- **Alt + drag** → duplicate element and drag the copy

#### Resize

- **8 resize handles** around selected element (corners + midpoints)
- **Corner handles** — Resize proportionally (maintain aspect ratio)
- **Midpoint handles** — Resize freely in one axis
- **Shift + corner** — Override proportional (free resize)
- **Alt + resize** — Resize from center
- Minimum element size: 20x20 px

#### Rotate

- **Rotation handle** above the element (circular handle connected by line)
- Drag to rotate freely
- **Shift + rotate** → Snap to 15-degree increments (0, 15, 30, 45, ...)
- Rotation center: element center point

#### Z-Order

- **Context menu** → "Bring to Front" / "Send to Back" / "Bring Forward" / "Send Backward"
- **Keyboard**: `]` = bring forward, `[` = send backward, `Ctrl+]` = bring to front, `Ctrl+[` = send to back

### 7.3 Insert Operations

#### Insert Image

1. Click **"Insert"** button on toolbar → submenu: "Image"
2. Options:
   a. **From Library** — Opens library picker (queries `library.listDocuments` with `itemType: "image"`)
   b. **Upload** — File input accepting `image/*`
   c. **AI Generate** — Opens Image Creator / Image Prompt Engineer skill form inline
   d. **From URL** — Paste image URL
3. Image is placed at canvas center with default size (50% of canvas width, maintaining aspect ratio)
4. New `slide_elements` record created with `elementType: "image"`

#### Insert Video

1. Click **"Insert"** → "Video"
2. Options:
   a. **From Library** — Library picker with `itemType: "video"`
   b. **Upload** — File input accepting `video/*`
   c. **AI Generate** — Opens Video Creator skill form
3. Video placed at canvas center, default 50% canvas width
4. Canvas shows video poster frame; clicking plays the video in the canvas
5. New `slide_elements` record with `elementType: "video"`
6. `content.autoplay`, `content.loop`, `content.muted` defaults: `true, false, true`

#### Insert Audio

1. Click **"Insert"** → "Audio"
2. Options:
   a. **From Library** — Library picker with `itemType: "audio"`
   b. **Upload** — File input accepting `audio/*`
   c. **AI Generate** — Opens Audio skill form (TTS with text input)
   d. **Add to Slide Audio** — Adds as slide-level audio (not a canvas element)
3. Audio element placed on canvas as a visual indicator (waveform or speaker icon)
4. New `slide_elements` record with `elementType: "audio"`
5. Alternatively, added to `slides.slideAudio.clips[]` if "Add to Slide Audio" chosen

#### Insert Text

1. Click **"Insert"** → "Text" → submenu: "Heading" / "Subheading" / "Body" / "Caption"
2. Or: **Double-click on empty canvas** → creates a text element at click position
3. Text element created with preset styles:
   - **Heading**: 72px, bold, white, center-aligned
   - **Subheading**: 48px, semibold, white, center-aligned
   - **Body**: 32px, normal, white, left-aligned
   - **Caption**: 24px, normal, rgba(255,255,255,0.7), center-aligned
4. Element is immediately in edit mode (cursor in text box)
5. Text editing:
   - Direct inline editing on canvas (contentEditable)
   - Property panel shows full text formatting options
   - **Ctrl+B** = bold, **Ctrl+I** = italic, **Ctrl+U** = underline

#### Insert Shape

1. Click **"Insert"** → "Shape" → submenu with shape icons
2. Shapes: Rectangle, Rounded Rectangle, Circle, Ellipse, Triangle, Star, Line, Arrow
3. Shape placed at canvas center with default size (200x200 or 300x4 for lines)
4. Configurable: fill color, stroke color, stroke width, border radius

### 7.4 Property Panel

The right sidebar shows properties of the selected element(s). Content varies by element type.

**Common Properties (all element types):**

| Property | Control | Notes |
|----------|---------|-------|
| Position X | Number input | px, relative to canvas |
| Position Y | Number input | |
| Width | Number input | Lock aspect ratio toggle |
| Height | Number input | |
| Rotation | Dial / number input | -180 to 180 degrees |
| Opacity | Slider + number | 0% - 100% |
| Lock | Toggle | Prevents accidental moves |
| Name | Text input | Element label |

**Image Properties:**

| Property | Control | Notes |
|----------|---------|-------|
| Object Fit | Select: Cover/Contain/Fill | How image fits bounding box |
| Crop | Crop tool (interactive) | Drag to crop within element |
| Brightness | Slider | 0-200% |
| Contrast | Slider | 0-200% |
| Saturation | Slider | 0-200% |
| Blur | Slider | 0-20px |
| Border Radius | Slider | 0-50% |
| Shadow | Toggle + controls | Offset, blur, color |
| Replace Image | Button | Re-opens insert dialog |

**Video Properties:**

| Property | Control | Notes |
|----------|---------|-------|
| Object Fit | Select | Cover/Contain/Fill |
| Autoplay | Toggle | Play when slide appears |
| Loop | Toggle | Repeat when finished |
| Muted | Toggle | |
| Volume | Slider | 0-100% |
| Trim Start | Time input | Start point in source |
| Trim End | Time input | End point in source |
| Border Radius | Slider | |
| Replace Video | Button | |

**Audio Properties:**

| Property | Control | Notes |
|----------|---------|-------|
| Volume | Slider | 0-100% |
| Fade In | Slider | 0-5000ms |
| Fade Out | Slider | 0-5000ms |
| Trim Start | Time input | |
| Trim End | Time input | |
| Autoplay | Toggle | Play when slide appears |
| Loop | Toggle | |
| Visual Style | Select | Waveform / Icon / Hidden |
| Replace Audio | Button | |

**Text Properties:**

| Property | Control | Notes |
|----------|---------|-------|
| Font Family | Dropdown | Google Fonts search |
| Font Size | Number + presets | Auto-size option |
| Font Weight | Dropdown | Thin to Black (100-900) |
| Font Style | Toggle | Normal / Italic |
| Line Height | Dropdown | 1.0, 1.2, 1.5, 2.0 |
| Letter Spacing | Number | px |
| Text Align | Button group | Left/Center/Right/Justify |
| Vertical Align | Button group | Top/Middle/Bottom |
| Color | Color picker | |
| Background Color | Color picker | With opacity |
| Text Decoration | Button group | None/Underline/Strikethrough |
| Text Transform | Dropdown | None/Upper/Lower/Capitalize |
| Effect | Select | None/Shadow/Outline/Glow/Neon |
| Effect Color | Color picker | |
| Padding | 4-sided number inputs | |
| Border | Color + Width + Radius | |

**Shape Properties:**

| Property | Control | Notes |
|----------|---------|-------|
| Fill Color | Color picker | With opacity |
| Stroke Color | Color picker | |
| Stroke Width | Number | px |
| Stroke Style | Select | Solid/Dashed/Dotted |
| Border Radius | Slider | For rectangles |
| Points | Number | For stars (3-12) |

### 7.5 Slide Properties (when no element selected)

| Property | Control | Notes |
|----------|---------|-------|
| Background Color | Color picker | |
| Background Image | Image picker | Replace/remove |
| Background Fit | Select | Cover/Contain/Fill |
| Transition | Select | Transition into this slide |
| Transition Duration | Slider | 100-2000ms |
| Duration | Number input | For auto-advance (ms) |
| Speaker Notes | Textarea | Markdown supported |

### 7.6 Canvas Toolbar

```
┌──────────────────────────────────────────────────────────────────────┐
│ [Select] [Insert ▾] [Text ▾] [Shape ▾] | [Undo] [Redo] | [Zoom ▾] │
│                                          [Grid] [Snap]   [Present]  │
└──────────────────────────────────────────────────────────────────────┘
```

| Tool | Behavior |
|------|----------|
| Select (V) | Default mode: click to select, drag to move |
| Insert | Dropdown: Image, Video, Audio |
| Text | Dropdown: Heading, Subheading, Body, Caption |
| Shape | Dropdown: Rectangle, Circle, Line, Arrow, Star, Triangle |
| Undo (Ctrl+Z) | Undo last operation |
| Redo (Ctrl+Shift+Z) | Redo last undone operation |
| Zoom | Dropdown: Fit, 50%, 75%, 100%, 150%, 200% + scroll wheel zoom |
| Grid | Toggle grid overlay |
| Snap | Toggle snap-to-grid and snap-to-element guides |
| Present | Open presentation player fullscreen |

### 7.7 Undo/Redo System

**Approach:** Command pattern with immutable state snapshots.

Each canvas operation creates a `CanvasCommand` entry:
```typescript
interface CanvasCommand {
  id: string;
  type: "add_element" | "remove_element" | "move_element" | "resize_element"
    | "rotate_element" | "update_content" | "update_properties"
    | "reorder_zindex" | "add_slide" | "remove_slide" | "reorder_slides"
    | "update_slide_bg" | "update_slide_audio" | "batch";
  timestamp: number;
  // Snapshot of affected state before and after
  before: Partial<CanvasState>;
  after: Partial<CanvasState>;
}
```

- **Undo stack**: Max 100 commands (configurable)
- **Redo stack**: Cleared on any new command
- **Batch commands**: Group rapid changes (e.g., continuous drag movement) into a single undo step using debounce (300ms idle threshold)

---

## 8. Presentation Player

### 8.1 Player Modes

| Mode | Context | Features |
|------|---------|----------|
| **Inline Preview** | Canvas editor bottom bar | Small preview of current slide, play/pause, mini timeline |
| **Fullscreen Presentation** | Triggered from editor or library | Full-screen browser, keyboard nav, auto-advance, all transitions |
| **Shared View** | Read-only URL for non-editors | Fullscreen player only, no editing UI |

### 8.2 Fullscreen Player Architecture

```
PresentationPlayer (fullscreen container)
├── SlideRenderer (current slide)
│   ├── BackgroundLayer (color + image)
│   ├── ElementLayer[] (rendered in zOrder)
│   │   ├── ImageElementRenderer (img with CSS transforms)
│   │   ├── VideoElementRenderer (HTML5 <video> with controls)
│   │   ├── AudioElementRenderer (hidden <audio> elements)
│   │   └── TextElementRenderer (styled div)
│   └── TransitionWrapper (Framer Motion AnimatePresence)
│
├── AudioManager (manages all audio playback)
│   ├── GlobalAudioPlayer[] (background music, full narration)
│   ├── SlideAudioPlayer[] (per-slide audio clips)
│   └── ElementAudioPlayer[] (audio elements on canvas)
│
├── NavigationOverlay
│   ├── PrevButton (left 20% click zone, transparent)
│   ├── NextButton (right 20% click zone, transparent)
│   ├── SlideCounter ("3 / 12")
│   ├── ProgressBar (bottom, animated width)
│   └── ControlBar (appears on hover)
│       ├── PlayPauseButton
│       ├── PrevSlideButton
│       ├── NextSlideButton
│       ├── VolumeControl (master volume)
│       ├── FullscreenToggle
│       └── ExitButton
│
└── KeyboardHandler
```

### 8.3 Slide Transitions

Transitions are applied when moving from one slide to another. Implemented with Framer Motion `AnimatePresence` and `motion.div`.

| Transition | Animation Description |
|-----------|----------------------|
| `none` | Instant switch |
| `fade` | Opacity crossfade |
| `slide_left` | Current exits left, next enters from right |
| `slide_right` | Current exits right, next enters from left |
| `slide_up` | Current exits up, next enters from bottom |
| `slide_down` | Current exits down, next enters from top |
| `zoom_in` | Current zooms in and fades, next appears |
| `zoom_out` | Current zooms out and fades, next appears |
| `wipe_left` | Clip-path wipe from right to left |
| `wipe_right` | Clip-path wipe from left to right |
| `circle_open` | Clip-path circle expanding from center |
| `circle_close` | Clip-path circle contracting to center |
| `dissolve` | Pixelated crossfade |

### 8.4 Auto-Advance Logic

```typescript
function calculateSlideDuration(slide: Slide, presentation: Presentation): number {
  const baseDuration = slide.durationMs ?? presentation.playbackSettings.autoAdvanceMs;

  // If slide has audio, extend duration to match longest audio
  const slideAudioDuration = slide.slideAudio?.clips
    ?.reduce((max, clip) => Math.max(max, clip.trimEndMs - clip.trimStartMs), 0) ?? 0;

  // If slide has video elements with autoplay, consider their duration
  const videoElementDuration = slide.elements
    ?.filter(el => el.elementType === "video" && el.content.autoplay)
    ?.reduce((max, el) => Math.max(max, el.content.trimEndMs - el.content.trimStartMs), 0) ?? 0;

  // If slide has audio elements with autoplay
  const audioElementDuration = slide.elements
    ?.filter(el => el.elementType === "audio" && el.content.autoplay)
    ?.reduce((max, el) => Math.max(max, el.content.trimEndMs - el.content.trimStartMs), 0) ?? 0;

  // Slide duration = max of all durations
  return Math.max(baseDuration, slideAudioDuration, videoElementDuration, audioElementDuration);
}
```

**Auto-advance flow:**
1. Slide enters → transition animation plays
2. All autoplay media starts (videos, audio)
3. Timer starts: `slideDuration - transitionDuration`
4. Timer fires → begin transition to next slide
5. During transition: current slide's audio fades out, next slide's audio fades in
6. If `loop: true` and on last slide → wrap to slide 0

**Pause behavior:**
- Clicking pause stops the auto-advance timer
- All autoplay videos pause
- Audio continues playing (or pauses, configurable)
- Manual navigation (arrows, click) still works while paused

### 8.5 Audio Playback During Presentation

**Audio layering:**

```
Priority (loudest):
1. Slide narration (per-slide audio clips, type: "narration")
2. Slide sound effects (per-slide, type: "sound_effect")
3. Element audio (audio elements on canvas, autoplay)
4. Element video audio (video elements with muted: false)
5. Global narration (presentation-wide narration track)
6. Global music (presentation-wide music, lowest priority)

Audio ducking rules:
- When narration plays → global music volume reduces to 20%
- When narration stops → global music fades back to 100% over 500ms
- Ducking uses the same algorithm as the video editor (AudioDuckingPanel)
```

**Slide audio sync:**

```typescript
// When auto-advancing:
// 1. Enter slide N
// 2. Start slide N's audio clips
// 3. If global narration has slideSync points:
//    - Seek global narration to slideSync[N].audioStartMs
//    - Play until slideSync[N].audioEndMs
// 4. Slide duration = max(configured duration, audio duration)
// 5. Transition to slide N+1
```

### 8.6 Touch/Mobile Support

- **Swipe left** → Next slide
- **Swipe right** → Previous slide
- **Tap center** → Toggle controls overlay
- **Pinch** → No zoom (fullscreen presentation maintains aspect ratio)
- **Long press** → Show slide actions (share, download, etc.)

---

## 9. Audio & Narration System

### 9.1 Audio Types

| Type | Scope | Purpose | Duration | Sync |
|------|-------|---------|----------|------|
| **Global Music** | Entire presentation | Background ambiance | Loops or matches total duration | Continuous |
| **Global Narration** | Entire presentation | Single narration track with slide sync points | Matches total duration | Synced to slide timestamps |
| **Slide Narration** | One slide | Voice-over for specific slide | Determines slide display time | Per-slide |
| **Slide SFX** | One slide | Sound effects (whoosh, click, chime) | Short, plays on slide enter | Per-slide |
| **Element Audio** | Canvas element | Audio clip placed on canvas | Independent, autoplay optional | Element lifecycle |

### 9.2 TTS Narration Generation

**Generate narration from slide content or speaker notes:**

1. User selects slide(s) → clicks "Generate Narration"
2. System determines text source:
   - **From notes:** Uses `slide.notes` text
   - **From text elements:** Concatenates visible text elements in reading order (top-to-bottom, left-to-right)
   - **Custom text:** User enters custom script in dialog
3. TTS request:
   ```typescript
   // Per-slide TTS
   POST /api/v1/media/audio
   {
     model: "elevenlabs-tts",
     text: slideNarrationText,
     voice: selectedVoice,  // "alloy", "echo", "fable", "onyx", "nova", "shimmer"
     speed: 1.0,
     output_format: "mp3"
   }
   ```
4. Generated audio uploaded to S3 at `presentations/{tenantId}/{presentationId}/audio/slide-{sortOrder}-narration.mp3`
5. `slide.slideAudio.clips[]` updated with new clip entry

**Batch narration (all slides at once):**

1. User clicks "Generate All Narration" → dialog with voice/speed settings
2. System iterates all slides with text content
3. Uses batch endpoint: `POST /api/v1/media/batch` with `media_type: "audio"`
4. Each slide's narration generated in parallel via Celery
5. Progress shown in UI (slide-by-slide status)
6. On completion, all slides updated with narration clips
7. Slide durations auto-adjusted to match narration length

**Full narration mode (single continuous audio):**

1. User provides full script or clicks "Generate Script from All Slides"
2. LLM generates a cohesive narration script from all slide notes/text
3. Single TTS call generates one long audio file
4. User marks slide boundaries (or AI auto-detects based on pauses/sections)
5. Stored as `globalAudio.tracks[]` with `slideSync` points
6. During playback, the narration seeks to the appropriate position per slide

### 9.3 Audio Editor Controls (Bottom Bar)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Slide: 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │ 9 │ 10│              │
│ ──────────────────────────────────────────────────────────────────── │
│ 🎵 Global Music  ▐████████████████████████████████████████▌  🔊 80% │
│ 🎙 Global Narr.  ▐██▌  ▐████▌  ▐██████▌  ▐███▌  ▐██████▌  🔊 100%│
│ ──────────────────────────────────────────────────────────────────── │
│ Slide 3 Audio:                                                      │
│ 🎙 Narration     ▐████████████████████████▌  5.2s          🔊 100%│
│ 🔔 SFX           ▐██▌  0.5s                                🔊 70% │
│ ──────────────────────────────────────────────────────────────────── │
│ [▶ Play] [⏸ Pause] [⏮] [⏭]  Total: 2:35  │  [🔇 Master: 100%]   │
└──────────────────────────────────────────────────────────────────────┘
```

### 9.4 Audio Upload & Import

| Source | Flow |
|--------|------|
| Library | Query `library.listDocuments` with `itemType: "audio"` |
| Upload | File input → S3 upload via `storagePut` → create element or slide audio |
| AI Generate (TTS) | Skill form → ElevenLabs TTS → S3 → element or slide audio |
| AI Generate (Music) | Skill form → Suno v4.5 → S3 → global or slide audio |
| Record (future) | Browser MediaRecorder → S3 → slide audio |

---

## 10. Convert to Video

### 10.1 Overview

The "Convert to Video" feature transforms a presentation into an MP4 video using the existing FFmpeg rendering pipeline. This leverages the same `VideoEditorProject` JSON format and `render_mp4_h264` job type.

### 10.2 Conversion Pipeline

```
Presentation (DB) → VideoEditorProject (JSON) → MediaTimeline (wire format) → FFmpeg → MP4
```

**Step-by-step:**

1. **User triggers** "Export as Video" from editor or library
2. **Client builds** a `VideoEditorProject` object from the presentation:

```typescript
function presentationToVideoProject(
  presentation: FullPresentation  // includes slides + elements
): VideoEditorProject {
  const project = createEmptyProject();
  project.name = presentation.title;
  project.settings.width = presentation.canvasWidth;
  project.settings.height = presentation.canvasHeight;
  project.settings.fps = 30;

  // Track layout:
  // T1 — Text overlays from all slides
  // V2 — Image/video overlay elements
  // V1 — Slide backgrounds (primary video track)
  // A1 — Audio (narration + music + effects)

  let timelinePositionMs = 0;

  for (const slide of presentation.slides) {
    const slideDurationMs = calculateSlideDuration(slide, presentation);
    const transitionDurationMs = slide.transitionDurationMs
      ?? presentation.playbackSettings.transitionDurationMs;

    // --- V1: Slide background as an image clip ---
    if (slide.backgroundImageUrl) {
      const bgAsset = createAsset({
        type: "image",
        path: slide.backgroundImageUrl,
        duration: slideDurationMs / 1000,
        width: presentation.canvasWidth,
        height: presentation.canvasHeight,
      });
      project.assets[bgAsset.id] = bgAsset;

      const bgClip = createClip({
        assetId: bgAsset.id,
        trackId: "V1",
        startMs: timelinePositionMs,
        durationMs: slideDurationMs,
        inTransition: slide.sortOrder > 0
          ? mapSlideTransitionToClipTransition(slide.transition, transitionDurationMs)
          : undefined,
      });
      project.timeline.tracks.find(t => t.id === "V1")!.clips.push(bgClip);
    }

    // --- V2: Image and video elements ---
    for (const element of slide.elements ?? []) {
      if (element.elementType === "image" || element.elementType === "video") {
        const elAsset = createAsset({
          type: element.elementType,
          path: element.content.url,
          duration: element.elementType === "video"
            ? (element.content.trimEndMs - element.content.trimStartMs) / 1000
            : slideDurationMs / 1000,
          width: Number(element.width),
          height: Number(element.height),
        });
        project.assets[elAsset.id] = elAsset;

        const elClip = createClip({
          assetId: elAsset.id,
          trackId: "V2",
          startMs: timelinePositionMs,
          durationMs: element.elementType === "video"
            ? element.content.trimEndMs - element.content.trimStartMs
            : slideDurationMs,
          transform: {
            x: Number(element.x) / presentation.canvasWidth,
            y: Number(element.y) / presentation.canvasHeight,
            scaleX: Number(element.width) / presentation.canvasWidth,
            scaleY: Number(element.height) / presentation.canvasHeight,
            rotation: Number(element.rotation),
            opacity: Number(element.opacity),
          },
          zOrder: element.zOrder,
        });
        project.timeline.tracks.find(t => t.id === "V2")!.clips.push(elClip);
      }
    }

    // --- T1: Text elements ---
    for (const element of slide.elements ?? []) {
      if (element.elementType === "text") {
        const textClip = createTextClip({
          trackId: "T1",
          startMs: timelinePositionMs,
          durationMs: slideDurationMs,
          textConfig: mapTextElementToTextConfig(element.content),
          transform: {
            x: Number(element.x) / presentation.canvasWidth,
            y: Number(element.y) / presentation.canvasHeight,
            scaleX: Number(element.width) / presentation.canvasWidth,
            scaleY: Number(element.height) / presentation.canvasHeight,
            rotation: Number(element.rotation),
            opacity: Number(element.opacity),
          },
        });
        project.timeline.tracks.find(t => t.id === "T1")!.clips.push(textClip);
      }
    }

    // --- A1: Slide audio (narration, SFX) ---
    if (slide.slideAudio?.clips) {
      for (const audioClip of slide.slideAudio.clips) {
        const audioAsset = createAsset({
          type: "audio",
          path: audioClip.url,
          duration: audioClip.durationMs / 1000,
        });
        project.assets[audioAsset.id] = audioAsset;

        const aClip = createClip({
          assetId: audioAsset.id,
          trackId: "A1",
          startMs: timelinePositionMs,
          durationMs: audioClip.trimEndMs - audioClip.trimStartMs,
          volume: audioClip.volume,
        });
        project.timeline.tracks.find(t => t.id === "A1")!.clips.push(aClip);
      }
    }

    // --- A1: Audio elements on canvas ---
    for (const element of slide.elements ?? []) {
      if (element.elementType === "audio" && element.content.autoplay) {
        const audioAsset = createAsset({
          type: "audio",
          path: element.content.url,
          duration: element.content.durationMs / 1000,
        });
        project.assets[audioAsset.id] = audioAsset;

        const aClip = createClip({
          assetId: audioAsset.id,
          trackId: "A1",
          startMs: timelinePositionMs,
          durationMs: element.content.trimEndMs - element.content.trimStartMs,
          volume: Number(element.opacity) * element.content.volume,
        });
        project.timeline.tracks.find(t => t.id === "A1")!.clips.push(aClip);
      }
    }

    timelinePositionMs += slideDurationMs;
  }

  // --- Global audio tracks ---
  if (presentation.globalAudio?.tracks) {
    for (const track of presentation.globalAudio.tracks) {
      const audioAsset = createAsset({
        type: "audio",
        path: track.url,
        duration: track.durationMs / 1000,
      });
      project.assets[audioAsset.id] = audioAsset;

      const totalDurationMs = timelinePositionMs; // Total presentation duration
      const clipDurationMs = track.loop
        ? totalDurationMs  // Will be trimmed/looped by FFmpeg
        : Math.min(track.durationMs, totalDurationMs - track.startOffsetMs);

      const aClip = createClip({
        assetId: audioAsset.id,
        trackId: "A1",
        startMs: track.startOffsetMs,
        durationMs: clipDurationMs,
        volume: track.volume,
      });
      project.timeline.tracks.find(t => t.id === "A1")!.clips.push(aClip);
    }
  }

  // Configure audio ducking
  project.audioMixing.ducking = {
    enabled: true,
    threshold: -30,
    ratio: 6,
    attack: 50,
    release: 300,
    backgroundGain: -12,
  };

  return project;
}
```

3. **Client sends** the built project:
   - **Option A: Direct render** — Convert to `MediaTimeline` via `projectToTimeline()`, submit as `render_mp4_h264` job
   - **Option B: Open in video editor** — Save as `videoEditorProjects` record, redirect to `/video-editor?project={id}`

4. **FFmpeg renders** the video:
   - Stage 1: Assemble V1 background clips (concat with transitions)
   - Stage 2: Overlay V2 elements, burn T1 text, mix A1 audio
   - Output: MP4 (H.264, AAC) uploaded to S3

5. **Result stored** in:
   - S3: `presentations/{tenantId}/{presentationId}/exports/{id}-{timestamp}.mp4`
   - DB: `media_tasks` record (for download/tracking)
   - Optional: `library_items` record (for library visibility)

### 10.3 Transition Mapping

```typescript
function mapSlideTransitionToClipTransition(
  slideTransition: SlideTransition | null,
  durationMs: number
): ClipTransition {
  const map: Record<SlideTransition, TransitionName> = {
    "none": "none",
    "fade": "crossfade",
    "slide_left": "slideLeft",
    "slide_right": "slideRight",
    "slide_up": "slideUp",
    "slide_down": "slideDown",
    "zoom_in": "zoomIn",
    "zoom_out": "zoomOut",
    "wipe_left": "wipeLeft",
    "wipe_right": "wipeRight",
    "circle_open": "circleOpen",
    "circle_close": "circleClose",
    "dissolve": "blur",
  };
  return {
    name: map[slideTransition ?? "fade"],
    durationMs,
    alignment: "center",
  };
}
```

### 10.4 Export Options Dialog

```
┌─────────────────────────────────────────┐
│  Export Presentation as Video            │
├─────────────────────────────────────────┤
│                                         │
│  Resolution:  ● 1080p (1920×1080)       │
│               ○ 720p  (1280×720)        │
│               ○ 4K    (3840×2160)       │
│               ○ Custom: [____] × [____] │
│                                         │
│  Quality:     ● Standard (CRF 23)       │
│               ○ High     (CRF 18)       │
│               ○ Preview  (CRF 28, fast) │
│                                         │
│  Include Audio:  [✓] Narration          │
│                  [✓] Background Music    │
│                  [✓] Sound Effects       │
│                                         │
│  After Export:                           │
│    ● Download MP4                        │
│    ○ Open in Video Editor               │
│    ○ Save to Library                     │
│                                         │
│  [Cancel]              [Export Video]    │
└─────────────────────────────────────────┘
```

### 10.5 PDF Export

For static PDF export (no video/audio/animation):

1. Server-side rendering using Puppeteer/Playwright
2. Each slide rendered as a page at the canvas resolution
3. Text elements rendered as real text (searchable PDF)
4. Images embedded at original resolution
5. Output: `presentations/{tenantId}/{presentationId}/exports/{id}-{timestamp}.pdf`

### 10.6 ZIP Export

Download all assets as a portable bundle:

```
presentation-{title}.zip
├── manifest.json          # Full presentation JSON
├── slides/
│   ├── 000-background.webp
│   ├── 001-background.webp
│   └── ...
├── elements/
│   ├── {elementId}.webp
│   └── ...
├── audio/
│   ├── global-music.mp3
│   ├── slide-000-narration.mp3
│   └── ...
└── README.txt             # Human-readable summary
```

---

## 11. RAG Integration

### 11.1 Indexing Strategy

Each presentation is indexed as a single `library_items` record with multiple `library_chunks` (one per slide).

**On presentation save/update:**

1. Create or update `library_items` record:
   ```
   itemType: "presentation"
   source: "presentation_editor"
   title: presentation.title
   description: presentation.description
   status: presentation.status === "ready" ? "ready" : "indexing"
   metadata: {
     slideCount: presentation.slideCount,
     totalDurationMs: presentation.totalDurationMs,
     aspectRatio: presentation.aspectRatio,
     hasAudio: !!presentation.globalAudio,
     canvasWidth: presentation.canvasWidth,
     canvasHeight: presentation.canvasHeight,
   }
   thumbnailUrl: presentation.thumbnailUrl
   ```

2. For each slide, create/update `library_chunks`:
   ```
   libraryItemId: presentation.libraryItemId
   chunkIndex: slide.sortOrder
   content: buildSlideChunkContent(slide)
   contentType: "presentation_slide"
   metadata: {
     slideIndex: slide.sortOrder,
     slideTitle: slide.title,
     hasImage: !!slide.backgroundImageUrl,
     hasVideo: slide.elements?.some(e => e.elementType === "video"),
     hasAudio: !!slide.slideAudio || slide.elements?.some(e => e.elementType === "audio"),
   }
   ```

3. Queue `library_index_jobs` for vector embedding:
   - Text chunks → `docs-index-prod`
   - Image descriptions → `images-index-prod`

### 11.2 Chunk Content Assembly

```typescript
function buildSlideChunkContent(slide: SlideWithElements): string {
  const parts: string[] = [];

  if (slide.title) {
    parts.push(`Slide Title: ${slide.title}`);
  }

  // All visible text from text elements
  const textElements = slide.elements
    ?.filter(e => e.elementType === "text" && e.visible)
    ?.sort((a, b) => Number(a.y) - Number(b.y))  // top-to-bottom reading order
    ?.map(e => (e.content as TextElementContent).text)
    ?.filter(Boolean);

  if (textElements?.length) {
    parts.push(`Content: ${textElements.join(" | ")}`);
  }

  // AI description of the background image
  if (slide.aiDescription) {
    parts.push(`Visual: ${slide.aiDescription}`);
  }

  // Speaker notes
  if (slide.notes) {
    parts.push(`Notes: ${slide.notes}`);
  }

  return parts.join("\n");
}
```

### 11.3 Image Description Generation

When a slide's background image is set (either uploaded or AI-generated), queue an AI vision analysis:

```typescript
// Using existing Cloudflare Workers AI vision model
const description = await generateImageDescription(slide.backgroundImageUrl);
// Model: @cf/llava-hf/llava-1.5-7b-hf
// Prompt: "Describe this presentation slide image in detail. Include colors, layout, text visible, and main subject."

await db.update(slides)
  .set({ aiDescription: description })
  .where(eq(slides.id, slide.id));
```

### 11.4 Search Results

When a user searches and results include presentation slides:

```typescript
// Search result includes:
{
  libraryItemId: 42,
  libraryItem: {
    itemType: "presentation",
    title: "Product Launch 2026",
    thumbnailUrl: "...",
  },
  chunkIndex: 3,           // Slide index
  chunkMetadata: {
    slideTitle: "Key Features",
    slideIndex: 3,
  },
  relevanceScore: 0.87,
}
```

**UI behavior:** Clicking the search result opens the presentation editor at the matching slide (`?slideIndex=3`).

---

## 12. Document Management Integration

### 12.1 Library Item Integration

Presentations appear in the Document Management library alongside other document types.

**Library list view:**
- Icon: Presentation icon (slides stack)
- Thumbnail: First slide thumbnail
- Type badge: "Presentation"
- Metadata: `{slideCount} slides | {formattedDuration}`

**Preview panel (`DocumentPreviewPanel.tsx`):**
- For `itemType: "presentation"`:
  - Shows slide strip (horizontal scrollable thumbnails)
  - Clicking a thumbnail shows the slide in the preview area
  - "Open Editor" button → opens PresentationEditor
  - "Present" button → opens PresentationPlayer fullscreen
  - "Export" button → opens export dialog

### 12.2 Create New Presentation

**From Document Management:**
1. "New" button → dropdown includes "Presentation"
2. Dialog:
   - Title (required)
   - Aspect ratio preset (16:9, 4:3, 9:16, 1:1)
   - Template (blank, or future: AI-generated from prompt)
3. Creates `presentations` record + `library_items` record
4. Redirects to PresentationEditor

**From AI generation (skill-driven):**
1. User activates Image Prompt Engineer skill with `prompt_count: "6_3x2"` or similar
2. Skill generates 6 image prompts
3. Batch image generation creates 6 images
4. User clicks "Create Presentation from Images"
5. System creates presentation with 6 slides, each with a background image
6. Opens PresentationEditor for further editing

### 12.3 Sharing & Permissions

Presentations use the existing `library_permissions` system:

| Permission Level | Capabilities |
|-----------------|-------------|
| `read` | View presentation, play slideshow |
| `write` | Edit slides, add elements, change settings |
| `delete` | Delete presentation |
| `owner` | All of the above + manage sharing |

**Shared presentation view:**
- Read-only users see the PresentationPlayer only (no editor)
- Write-access users see the full PresentationEditor

### 12.4 Version History

Presentation versions are tracked via `presentations.version` (incremented on save).

For detailed undo beyond the current session, snapshots can be stored in `library_content_versions`:

```
libraryItemId: presentation.libraryItemId
versionNumber: presentation.version
content: JSON.stringify(fullPresentationSnapshot)
contentType: "presentation_snapshot"
changeDescription: "Added 3 new slides"
```

---

## 13. API Endpoints

### 13.1 tRPC Router: `presentation`

```typescript
// apps/web/server/routers/presentation.ts

presentationRouter = router({
  // ===== Presentation CRUD =====

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      canvasWidth: z.number().default(1920),
      canvasHeight: z.number().default(1080),
      aspectRatio: z.string().default("16:9"),
      theme: PresentationThemeSchema.optional(),
    }))
    .mutation(/* creates presentation + library_item, returns { id, libraryItemId } */),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(/* returns full presentation with slides and elements */),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      playbackSettings: PresentationPlaybackSettingsSchema.optional(),
      theme: PresentationThemeSchema.optional(),
      globalAudio: PresentationGlobalAudioSchema.optional(),
    }))
    .mutation(/* updates presentation fields */),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(/* soft-deletes presentation + library_item */),

  list: protectedProcedure
    .input(z.object({
      limit: z.number().default(20),
      offset: z.number().default(0),
      sortBy: z.enum(["createdAt", "updatedAt", "title"]).default("updatedAt"),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    }))
    .query(/* returns paginated list with thumbnails */),

  // ===== Slides =====

  addSlide: protectedProcedure
    .input(z.object({
      presentationId: z.number(),
      afterIndex: z.number().optional(),  // Insert after this index (-1 = beginning)
      title: z.string().optional(),
      backgroundImageUrl: z.string().optional(),
      backgroundImageKey: z.string().optional(),
      backgroundColor: z.string().optional(),
    }))
    .mutation(/* creates slide, reorders siblings, returns slide */),

  updateSlide: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      notes: z.string().optional(),
      backgroundColor: z.string().optional(),
      backgroundImageUrl: z.string().optional(),
      backgroundImageKey: z.string().optional(),
      backgroundFit: z.string().optional(),
      transition: z.string().optional(),
      transitionDurationMs: z.number().optional(),
      durationMs: z.number().optional(),
      slideAudio: SlideAudioConfigSchema.optional(),
    }))
    .mutation(/* updates slide fields */),

  deleteSlide: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(/* deletes slide + elements, reorders siblings */),

  duplicateSlide: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(/* deep-copies slide + elements, inserts after original */),

  reorderSlides: protectedProcedure
    .input(z.object({
      presentationId: z.number(),
      slideIds: z.array(z.number()),  // New order (array of slide IDs)
    }))
    .mutation(/* batch-updates sortOrder for all slides */),

  // ===== Slide Elements =====

  addElement: protectedProcedure
    .input(z.object({
      slideId: z.number(),
      elementType: z.enum(["image", "video", "audio", "text", "shape"]),
      x: z.number().default(0),
      y: z.number().default(0),
      width: z.number(),
      height: z.number(),
      rotation: z.number().default(0),
      zOrder: z.number().optional(),  // null = auto (max + 1)
      opacity: z.number().default(1),
      content: SlideElementContentSchema,
    }))
    .mutation(/* creates element, returns element */),

  updateElement: protectedProcedure
    .input(z.object({
      id: z.number(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      rotation: z.number().optional(),
      zOrder: z.number().optional(),
      opacity: z.number().optional(),
      visible: z.boolean().optional(),
      locked: z.boolean().optional(),
      name: z.string().optional(),
      content: SlideElementContentSchema.optional(),
      animation: SlideElementAnimationSchema.optional(),
    }))
    .mutation(/* updates element fields */),

  deleteElement: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(/* deletes element */),

  batchUpdateElements: protectedProcedure
    .input(z.object({
      updates: z.array(z.object({
        id: z.number(),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        rotation: z.number().optional(),
        zOrder: z.number().optional(),
        opacity: z.number().optional(),
      })),
    }))
    .mutation(/* batch-updates multiple elements (for multi-select moves) */),

  // ===== Auto-save =====

  autoSave: protectedProcedure
    .input(z.object({
      presentationId: z.number(),
      // Full slide state for the current slide only
      slideSnapshot: z.object({
        id: z.number(),
        elements: z.array(SlideElementFullSchema),
      }),
    }))
    .mutation(/* lightweight save of current slide state */),

  // ===== Export =====

  exportToVideo: protectedProcedure
    .input(z.object({
      presentationId: z.number(),
      quality: z.enum(["preview", "standard", "high"]).default("standard"),
      resolution: z.object({ width: z.number(), height: z.number() }).optional(),
      includeNarration: z.boolean().default(true),
      includeMusic: z.boolean().default(true),
      includeSfx: z.boolean().default(true),
    }))
    .mutation(/* converts to VideoEditorProject, submits render job, returns jobId */),

  exportToPdf: protectedProcedure
    .input(z.object({ presentationId: z.number() }))
    .mutation(/* submits PDF export job, returns jobId */),

  exportToZip: protectedProcedure
    .input(z.object({ presentationId: z.number() }))
    .mutation(/* builds ZIP bundle, returns download URL */),

  openInVideoEditor: protectedProcedure
    .input(z.object({ presentationId: z.number() }))
    .mutation(/* converts to VideoEditorProject, saves, returns projectId */),

  getExportStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(/* returns job status + download URL when complete */),

  // ===== Generation =====

  generateSlideImages: protectedProcedure
    .input(z.object({
      presentationId: z.number(),
      slidePrompts: z.array(z.object({
        slideIndex: z.number(),
        prompt: z.string(),
        model: z.string().default("flux-2.0"),
      })),
    }))
    .mutation(/* batch-generates images, updates slides on completion */),

  generateNarration: protectedProcedure
    .input(z.object({
      presentationId: z.number(),
      slideIds: z.array(z.number()),  // Empty = all slides
      voice: z.string().default("alloy"),
      speed: z.number().default(1.0),
      textSource: z.enum(["notes", "text_elements", "custom"]).default("notes"),
      customTexts: z.record(z.string()).optional(),  // slideId → custom text
    }))
    .mutation(/* generates TTS per slide, updates slide audio */),
});
```

### 13.2 REST Endpoints (Express)

For operations that don't fit tRPC (file uploads, SSE):

```
POST   /api/presentations/:id/upload-asset
       Content-Type: multipart/form-data
       Body: file, elementType, slideId (optional)
       → Uploads to S3, returns { storageKey, url }

GET    /api/presentations/:id/export-status/:jobId
       → SSE stream for export progress (reuses media-job-progress Redis pubsub)

GET    /api/presentations/:id/share/:token
       → Public shared presentation viewer (read-only, no auth required)
```

---

## 14. UI Component Architecture

### 14.1 New Components

```
apps/web/client/src/
├── pages/
│   └── PresentationEditorPage.tsx       # Route: /presentation/:id
│
├── components/presentation/
│   ├── PresentationEditor.tsx           # Main editor container (3-panel layout)
│   │
│   ├── canvas/
│   │   ├── CanvasViewport.tsx           # Zoom/pan container, aspect-ratio lock
│   │   ├── CanvasToolbar.tsx            # Insert, text, shape, undo/redo, zoom
│   │   ├── ElementRenderer.tsx          # Renders single element with drag/resize
│   │   ├── ImageElement.tsx             # Image element renderer
│   │   ├── VideoElement.tsx             # Video element with playback controls
│   │   ├── AudioElement.tsx             # Audio element visual representation
│   │   ├── TextElement.tsx              # Inline-editable text element
│   │   ├── ShapeElement.tsx             # SVG shape renderer
│   │   ├── SelectionOverlay.tsx         # Multi-select bounding box
│   │   ├── SnapGuides.tsx              # Alignment guide lines
│   │   ├── ResizeHandles.tsx            # 8-point resize + rotation handle
│   │   └── CanvasContextMenu.tsx        # Right-click menu on canvas
│   │
│   ├── slides/
│   │   ├── SlidePanel.tsx               # Left sidebar: slide list
│   │   ├── SlideThumbnail.tsx           # Single slide thumbnail (sortable)
│   │   ├── SlideContextMenu.tsx         # Right-click on slide thumbnail
│   │   └── AddSlideMenu.tsx             # "Add slide" dropdown
│   │
│   ├── properties/
│   │   ├── PropertyPanel.tsx            # Right sidebar: property editor
│   │   ├── CommonProperties.tsx         # Position, size, rotation, opacity
│   │   ├── ImageProperties.tsx          # Object-fit, crop, filters, border
│   │   ├── VideoProperties.tsx          # Playback, trim, volume
│   │   ├── AudioProperties.tsx          # Volume, fade, trim, visual style
│   │   ├── TextProperties.tsx           # Font, color, alignment, effects
│   │   ├── ShapeProperties.tsx          # Fill, stroke, style
│   │   └── SlideProperties.tsx          # Background, transition, duration, notes
│   │
│   ├── audio/
│   │   ├── AudioTimeline.tsx            # Bottom bar: audio track visualization
│   │   ├── AudioTrackRow.tsx            # Single audio track row
│   │   ├── NarrationGenerator.tsx       # TTS generation dialog
│   │   ├── AudioInsertDialog.tsx        # Pick from library / upload / generate
│   │   └── AudioVolumeControl.tsx       # Volume slider with icon
│   │
│   ├── player/
│   │   ├── PresentationPlayer.tsx       # Fullscreen player container
│   │   ├── SlideRenderer.tsx            # Renders a single slide (all layers)
│   │   ├── TransitionManager.tsx        # Framer Motion transition orchestration
│   │   ├── AudioManager.tsx             # Manages all audio playback + ducking
│   │   ├── NavigationOverlay.tsx        # Controls, slide counter, progress bar
│   │   └── PresenterView.tsx            # Current + next slide + notes + timer
│   │
│   ├── export/
│   │   ├── ExportDialog.tsx             # Export options (video, PDF, ZIP)
│   │   ├── ExportProgressDialog.tsx     # Progress bar during export
│   │   └── VideoExportPreview.tsx       # Preview before export
│   │
│   ├── insert/
│   │   ├── InsertMediaDialog.tsx        # Unified insert dialog (image/video/audio)
│   │   ├── LibraryMediaPicker.tsx       # Browse library items by type
│   │   ├── UploadMediaPanel.tsx         # Drag-and-drop file upload
│   │   └── GenerateMediaPanel.tsx       # AI generation inline form
│   │
│   └── hooks/
│       ├── usePresentationState.ts      # Main state management hook
│       ├── useCanvasHistory.ts          # Undo/redo command stack
│       ├── useCanvasSelection.ts        # Selection state (single/multi)
│       ├── useCanvasSnapping.ts         # Snap guide calculations
│       ├── useCanvasKeyboard.ts         # Keyboard shortcut handling
│       ├── useCanvasZoom.ts             # Zoom/pan state
│       ├── useSlideAudio.ts             # Audio playback state per slide
│       ├── usePresentationAutoSave.ts   # Debounced auto-save (5s)
│       └── useElementDrag.ts            # Drag/resize/rotate logic
```

### 14.2 Reused Existing Components

| Component | Source | Usage in Presentation Editor |
|-----------|--------|------------------------------|
| `ResizablePanelGroup` | `packages/ui` | 3-panel layout (slides / canvas / properties) |
| `Dialog`, `AlertDialog` | `@radix-ui/react-dialog` | Insert dialogs, export dialog, delete confirm |
| `ContextMenu` | `@radix-ui/react-context-menu` | Right-click on canvas, slides, elements |
| `Tabs` | `@radix-ui/react-tabs` | Property panel tabs, insert dialog tabs |
| `Slider` | `@radix-ui/react-slider` | Opacity, volume, zoom, font size |
| `Select` | `@radix-ui/react-select` | Font family, transition type, object-fit |
| `Popover` | `@radix-ui/react-popover` | Color picker, font picker |
| `Tooltip` | `@radix-ui/react-tooltip` | Toolbar button tooltips |
| `ScrollArea` | `@radix-ui/react-scroll-area` | Slide panel, property panel scrolling |
| `DropdownMenu` | `@radix-ui/react-dropdown-menu` | Add slide menu, insert menu |
| `TextClipEditor` patterns | `videoeditor/TextClipEditor.tsx` | Text element properties (font, effects) |
| `MediaLibraryPanel` pattern | `videoeditor/MediaLibraryPanel.tsx` | Library media picker for insert |
| Framer Motion `AnimatePresence` | `framer-motion` | Slide transitions in player |
| Framer Motion `motion.div` | `framer-motion` | Element drag interactions, transitions |

### 14.3 State Management

**Primary state:** React hooks + TanStack Query (server state)

```typescript
// usePresentationState.ts — Central state for the editor

interface PresentationEditorState {
  // Core data (from server, managed by TanStack Query)
  presentation: Presentation;
  slides: SlideWithElements[];

  // UI state (local)
  currentSlideIndex: number;
  selectedElementIds: Set<number>;
  isPlaying: boolean;
  zoom: number;  // 0.25 - 4.0
  panOffset: { x: number; y: number };
  activeTool: "select" | "text" | "shape";
  gridEnabled: boolean;
  snapEnabled: boolean;
  isDirty: boolean;  // Unsaved changes

  // Actions
  setCurrentSlide: (index: number) => void;
  selectElement: (id: number, addToSelection?: boolean) => void;
  deselectAll: () => void;
  updateElement: (id: number, changes: Partial<SlideElement>) => void;
  addElement: (element: NewSlideElement) => void;
  deleteSelectedElements: () => void;
  // ... etc
}
```

**Auto-save strategy:**
- Debounce: 5 seconds after last change
- Only saves current slide's element positions (lightweight)
- Full save on slide change, close, or explicit save (Ctrl+S)

---

## 15. Generation Pipeline

### 15.1 Create Presentation from AI Prompts

**Workflow:**

```
User enters topic → LLM generates slide outline → Image Prompt Engineer creates per-slide prompts
→ Batch image generation → Presentation created with slides → Optional: TTS narration per slide
```

**Step-by-step implementation:**

1. User clicks "New Presentation" → "AI Generated"
2. Dialog: Enter topic, number of slides (6, 8, 10, 12), style preferences
3. System calls LLM to generate outline:
   ```
   Generate a {slideCount}-slide presentation outline about: "{topic}"
   For each slide, provide: title, key points (2-3), and an image generation prompt.
   Output as JSON array.
   ```
4. For each slide, Image Prompt Engineer refines the image prompt
5. Batch image generation via `POST /api/v1/media/batch`
6. As each image completes:
   - Upload to S3 at `presentations/{tenantId}/{presentationId}/slides/{sortOrder}-background.webp`
   - Update `slides.backgroundImageUrl` and `slides.generationStatus = "ready"`
   - Generate AI description for RAG indexing
7. When all slides ready: `presentations.status = "ready"`
8. Optional: User clicks "Generate Narration" → TTS for each slide

### 15.2 Add Slides from Existing Media

1. User opens Insert dialog → "From Library"
2. Selects multiple images from library
3. Each image becomes a new slide background
4. Slides inserted at current position

### 15.3 Progressive Generation (Real-time Preview)

While images are generating:
- Slides show a loading skeleton with progress indicator
- `generationStatus: "generating"` → spinner overlay on thumbnail
- As each image completes → thumbnail updates, slide becomes editable
- User can edit already-completed slides while others are still generating

---

## 16. Keyboard Shortcuts

### 16.1 Canvas Editor Shortcuts

| Shortcut | Action |
|----------|--------|
| **V** | Switch to Select tool |
| **T** | Switch to Text tool (click to create text) |
| **Delete** / **Backspace** | Delete selected elements |
| **Ctrl+A** | Select all elements on current slide |
| **Ctrl+C** | Copy selected elements |
| **Ctrl+V** | Paste copied elements |
| **Ctrl+X** | Cut selected elements |
| **Ctrl+D** | Duplicate selected elements |
| **Ctrl+Z** | Undo |
| **Ctrl+Shift+Z** | Redo |
| **Ctrl+S** | Save presentation |
| **Escape** | Deselect all / Exit text edit mode |
| **]** | Bring element forward |
| **[** | Send element backward |
| **Ctrl+]** | Bring to front |
| **Ctrl+[** | Send to back |
| **Arrow keys** | Nudge element 1px |
| **Shift+Arrow** | Nudge element 10px |
| **Ctrl+0** | Zoom to fit |
| **Ctrl++** | Zoom in |
| **Ctrl+-** | Zoom out |
| **Space+Drag** | Pan canvas |
| **Enter** | Edit text element (when selected) |
| **Tab** | Select next element |
| **Shift+Tab** | Select previous element |

### 16.2 Slide Navigation Shortcuts

| Shortcut | Action |
|----------|--------|
| **Page Down** | Next slide |
| **Page Up** | Previous slide |
| **Home** | Go to first slide |
| **End** | Go to last slide |
| **Ctrl+Enter** | Add new slide after current |

### 16.3 Presentation Player Shortcuts

| Shortcut | Action |
|----------|--------|
| **Right Arrow** / **Space** / **Click** | Next slide |
| **Left Arrow** | Previous slide |
| **Home** | First slide |
| **End** | Last slide |
| **F** / **F11** | Toggle fullscreen |
| **Escape** | Exit presentation |
| **P** | Toggle play/pause (auto-advance) |
| **M** | Toggle mute |
| **Up Arrow** | Volume up |
| **Down Arrow** | Volume down |
| **1-9** | Jump to slide 1-9 |
| **B** / **.** | Black screen (pause) |
| **W** / **,** | White screen (pause) |

---

## 17. Security & Permissions

### 17.1 Access Control

| Operation | Required Permission | Enforcement Point |
|-----------|-------------------|-------------------|
| View presentation | `read` on library_item | tRPC middleware |
| Edit slides/elements | `write` on library_item | tRPC middleware |
| Delete presentation | `delete` on library_item | tRPC middleware |
| Share presentation | `owner` on library_item | tRPC middleware |
| Export to video | `read` on library_item | tRPC middleware |
| Generate narration | `write` on library_item + sufficient credits | tRPC middleware + credit check |

### 17.2 Tenant Isolation

- All queries filter by `tenantId`
- S3 keys include `tenantId` in the path
- Cross-tenant access is impossible by design

### 17.3 Asset Security

- Element URLs are S3 presigned URLs (time-limited)
- Shared presentations use a signed token in the share URL
- No direct S3 bucket access from client

### 17.4 Input Validation

- All element positions clamped to canvas bounds (server-side)
- Text content sanitized (strip HTML tags, prevent XSS)
- File uploads validated: type, size (max 50MB for video, 30MB for images, 20MB for audio)
- JSON content validated against Zod schemas

---

## 18. Performance Considerations

### 18.1 Lazy Loading

- **Slides:** Only load full element data for the current slide + 1 slide before/after
- **Images:** Use `loading="lazy"` for off-screen slide thumbnails
- **Videos:** Load poster frame only; full video loads on play
- **Audio:** Waveform data loaded on demand

### 18.2 Thumbnail Generation

- Slide thumbnails generated server-side (or via client Canvas API) at 400px width
- Cached in S3 at `presentations/{tenantId}/{presentationId}/thumbnails/`
- Re-generated when slide background or visible elements change
- Used in: slide panel, library list, search results

### 18.3 Auto-Save Optimization

- Debounced: 5s idle after last change
- Differential: Only sends changed elements (not full presentation)
- Optimistic updates: UI updates immediately, server save is background
- Conflict resolution: Last-write-wins (suitable for single-user editing)

### 18.4 Canvas Rendering

- Elements rendered as absolutely-positioned divs with CSS transforms (not HTML Canvas)
- Images use `<img>` with `object-fit` CSS
- Videos use `<video>` with poster frame
- Text uses standard DOM rendering (better for text selection, accessibility)
- Transform calculations memoized with `React.memo` and `useMemo`

### 18.5 Large Presentations

- Presentations with 50+ slides: Virtual scrolling in slide panel
- Presentations with many elements per slide: Group visibility culling
- Long audio tracks: Streaming playback via Range requests

---

## 19. Migration & Compatibility

### 19.1 Database Migration

**New tables to create:**
1. `presentations` — with all columns as specified in Section 5
2. `slides` — with all columns
3. `slide_elements` — with all columns

**Existing tables modified:**
- `library_items`: No schema change needed (already supports `itemType: varchar`)
- `library_chunks`: No schema change needed (already supports `contentType: varchar`)

**Migration risk:** LOW (only adding new tables, no existing data affected)

### 19.2 Backward Compatibility

- Existing `.pptx` files in library remain as `itemType: "document"` with Office preview
- Existing images/videos in library are not affected
- No changes to video editor data model or functionality

### 19.3 Feature Flags

```typescript
// Feature flags for progressive rollout
FEATURE_PRESENTATION_EDITOR: boolean;      // Enable presentation creation/editing
FEATURE_PRESENTATION_CANVAS: boolean;      // Enable canvas editor (vs. simple image-only)
FEATURE_PRESENTATION_VIDEO_EXPORT: boolean; // Enable video export
FEATURE_PRESENTATION_TTS: boolean;          // Enable TTS narration generation
FEATURE_PRESENTATION_AI_GENERATE: boolean;  // Enable AI-generated presentations
```

---

## 20. Future Roadmap

### Phase 1: Core Editor & Playback (This Spec)
- Canvas editor with image, video, audio, text, shape elements
- Fullscreen presentation player with transitions
- Per-slide and global audio
- Video export via FFmpeg
- RAG indexing
- Document Management integration

### Phase 2: Collaborative Features
- Real-time collaborative editing (CRDT/OT)
- Comments on slides
- Version history with diff viewer
- "Suggest edits" mode

### Phase 3: Advanced Animation
- Element-level enter/exit animations
- Keyframe animation timeline (similar to video editor)
- Auto-animate between similar slides (morph transition)
- Parallax effects on scroll

### Phase 4: AI Enhancements
- AI auto-layout (smart element positioning)
- AI design suggestions (color, font, layout)
- AI slide generation from document (paste article → get slides)
- AI narration script generation with timing
- AI background removal and image enhancement

### Phase 5: Templates & Branding
- Presentation templates (pre-designed slide layouts)
- Brand kit integration (logos, colors, fonts)
- Master slides (reusable layouts)
- Custom themes marketplace

### Phase 6: Interactive Presentations
- Embedded polls and quizzes
- Clickable hotspots and links
- Branching presentations (choose-your-own-adventure)
- Live audience Q&A integration

### Phase 7: Analytics & Distribution
- Presentation analytics (views, time per slide, drop-off)
- Embed code for websites
- Social sharing with OG previews
- Presentation scheduling (publish at specific time)

---

## 21. Appendices

### Appendix A: Aspect Ratio Presets

| Name | Ratio | Dimensions | Use Case |
|------|-------|-----------|----------|
| Widescreen | 16:9 | 1920 x 1080 | Standard presentations, video |
| Standard | 4:3 | 1440 x 1080 | Traditional slides, projectors |
| Portrait | 9:16 | 1080 x 1920 | Mobile, Instagram Stories, TikTok |
| Square | 1:1 | 1080 x 1080 | Instagram posts, social media |
| Ultra-wide | 21:9 | 2560 x 1080 | Cinematic, ultra-wide displays |

### Appendix B: Supported Media Formats

| Type | Formats | Max Size |
|------|---------|----------|
| Image | JPEG, PNG, WebP, GIF, SVG, BMP | 30 MB |
| Video | MP4, WebM, MOV | 50 MB |
| Audio | MP3, WAV, OGG, AAC, M4A | 20 MB |

### Appendix C: Existing System References

| System | Key Files |
|--------|----------|
| Document Management UI | `apps/web/client/src/pages/DocumentManagement.tsx` |
| Library Router | `apps/web/server/routers/library.ts` |
| Library Service | `apps/web/server/services/libraryService.ts` |
| Storage Service | `apps/web/server/storage.ts` |
| Media Generation Service | `apps/web/server/services/mediaGenerationService.ts` |
| Skill Executor | `apps/web/server/services/skillExecutor.ts` |
| Vectorize Indexing | `apps/web/server/services/vectorize-indexing.ts` |
| Video Editor Types | `apps/web/client/src/types/videoEditor.ts` |
| Video Editor Service | `apps/web/client/src/services/videoEditorService.ts` |
| Media Job Client | `apps/web/client/src/services/mediaJobClient.ts` |
| FFmpeg Render Worker | `python-backend/app/tasks/media_job_worker.py` |
| Cloud Run Entrypoint | `python-backend/app/video/entrypoint.py` |
| Kie.ai Provider | `python-backend/app/llm_proxy/providers/kie_ai_provider.py` |
| Audio Generation | `python-backend/app/api/v1/media_generation.py` |
| Drizzle Schema | `apps/web/drizzle/schema.ts` |
| Text Clip Editor | `apps/web/client/src/components/videoeditor/TextClipEditor.tsx` |
| Transform Keyframes | `apps/web/client/src/components/videoeditor/transformKeyframes.ts` |
| Preview Player (canvas drag) | `apps/web/client/src/components/videoeditor/PreviewPlayer.tsx` |
| Resizable Panels | `packages/ui/src/components/ui/resizable.tsx` |

### Appendix D: Audio Model Availability

| Model | Provider | Type | Status |
|-------|----------|------|--------|
| `elevenlabs-tts` | Kie.ai | Text-to-Speech | Available |
| `elevenlabs-sfx` | Kie.ai | Sound Effects | Available |
| `suno-v4` | Kie.ai | Music Generation | Mapped (needs media_models entry) |
| `suno-v4.5` | Kie.ai | Music Generation | Mapped (needs media_models entry) |
| `suno-v4.5-plus` | Kie.ai | Music Generation | Mapped (needs media_models entry) |
| `sound-effects` | Kie.ai | Sound Effects | Mapped (needs media_models entry) |
| `vocal-removal` | Kie.ai | Audio Processing | Mapped |
| `stem-split` | Kie.ai | Audio Processing | Mapped |
| `music-cover` | Kie.ai | Music Cover | Mapped |

### Appendix E: Video Editor Transition Compatibility

Slide transitions map to the video editor's existing transition system:

| Slide Transition | Video Editor Transition | FFmpeg Filter |
|-----------------|------------------------|---------------|
| `fade` | `crossfade` | `xfade=transition=fade` |
| `slide_left` | `slideLeft` | `xfade=transition=slideleft` |
| `slide_right` | `slideRight` | `xfade=transition=slideright` |
| `slide_up` | `slideUp` | `xfade=transition=slideup` |
| `slide_down` | `slideDown` | `xfade=transition=slidedown` |
| `zoom_in` | `zoomIn` | `xfade=transition=zoomin` |
| `zoom_out` | `zoomOut` | `xfade=transition=smoothdown` |
| `wipe_left` | `wipeLeft` | `xfade=transition=wipeleft` |
| `wipe_right` | `wipeRight` | `xfade=transition=wiperight` |
| `circle_open` | `circleOpen` | `xfade=transition=circleopen` |
| `circle_close` | `circleClose` | `xfade=transition=circleclose` |
| `dissolve` | `blur` | `xfade=transition=pixelize` |

---

*End of Spec 018*
