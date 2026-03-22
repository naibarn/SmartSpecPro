# Research Brief: Slide Background Rendering Pipeline

## Findings

The presentation render pipeline is a **full-stack flow** where Node.js generates a self-contained HTML page per slide, Playwright captures it as PNG, and the Python backend processes it into video/PDF/image formats. **Slide background colors/images are NOT currently rendered** — the slide canvas always has a hardcoded white background.

### Current Data Flow

```
Node.js Database (slideContent JSON)
  ↓
GET /internal/slide-render/:deckId/:slideIndex (slideRender.ts)
  ↓
Self-contained HTML with inlined slideContent JSON
  ↓
Browser JavaScript (renderElements())
  ↓
Playwright screenshot → PNG
  ↓
Python Backend (presentation_render.py)
  ↓
FFmpeg / Pillow post-processing
  ↓
MP4 / PDF / ZIP archive
```

### Key Architecture Points

1. **Data is stored in DB**: `presentationSlides.slideContent` is a JSON object containing `{ elements: [...], canvas: {...}, background?: {...} }`
2. **Background field EXISTS in schema** (line 342 of `contracts.ts`): `background: presentationSlideBackgroundSchema.optional()`
3. **Background is passed through render spec**: The `background` field is NOT stripped from slideContent when sent to Python
4. **Python receives raw slideContent**: The render spec contains `slides` array with `slideId`, `orderIndex`, `title`, `durationMs`, `transition`, but NOT slideContent
5. **Rendering is entirely browser-based**: Node.js inlines the JSON and JavaScript renders elements in the DOM

---

## Current Architecture

### Node.js: Slide Render Route (`apps/web/server/routes/slideRender.ts`)

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routes/slideRender.ts`

**Route**: `GET /internal/slide-render/:deckId/:slideIndex`

**Flow** (lines 44-783):
1. **Line 99**: Fetch slide from DB: `const slide = slides[urlSlideIndex]`
2. **Lines 100-104**: Escape slideContent JSON and embed it in HTML
3. **Lines 107-781**: Generate self-contained HTML with:
   - Inline JSON in `<script id="slide-data">` tag (line 147)
   - Base CSS styling (lines 118-144):
     ```css
     #slide-viewport { background: #fff; }
     #slide-canvas { position: absolute; ... }
     ```
   - JavaScript to render elements (lines 151-778)

**Critical CSS** (lines 118-125):
```css
html, body {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #fff;  /* <-- HARDCODED WHITE */
}
#slide-viewport {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #fff;  /* <-- HARDCODED WHITE */
}
```

**Current renderElements() Function** (lines 475-492):
- Loops over `slide.elements` array
- Calls `renderText()`, `renderImage()`, `renderVideo()`, `renderRect()`, `renderLine()`
- Does NOT read or apply `slide.background`

---

### Data Schema: SlideContent

**File**: `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts`

**Lines 336-343**:
```typescript
export const presentationSlideContentSchema = z.object({
  elements: z.array(presentationSlideElementSchema).max(PRESENTATION_LIMITS.maxElementsPerSlide),
  canvas: presentationCanvasSizeSchema.optional(),
  transition: presentationTransitionSchema.optional(),
  durationMs: z.number().finite().min(250).max(120_000).optional(),
  pendingMediaJobs: z.array(presentationPendingMediaJobSchema).max(32).optional(),
  background: presentationSlideBackgroundSchema.optional(),  // <-- DEFINED HERE
}).strict();
```

**Background Schema** (lines 331-334):
```typescript
export const presentationSlideBackgroundSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("color"), value: z.string().min(1).max(64) }),
  z.object({ type: z.literal("image"), url: z.string().min(1).max(500), libraryItemId: z.number().int().positive().optional() }),
]);
```

**Type Definition** (line 437):
```typescript
export type PresentationSlideBackground = z.infer<typeof presentationSlideBackgroundSchema>;
```

**So background can be**:
- `{ type: "color", value: "#FF0000" }` — CSS color string
- `{ type: "image", url: "https://...", libraryItemId?: 123 }` — URL to image

---

### Python Render Pipeline (`python-backend/app/tasks/presentation_render.py`)

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/presentation_render.py`

**Key Functions**:

#### `render_presentation()` (lines 104-162)
- Main Celery task entry point
- Takes `render_spec: dict` (PresentationRenderSpec)
- Routes to screenshot or video mode

#### `_render_slides_to_screenshots()` (lines 283-354)
- Launches Playwright browser (line 302-307)
- For each slide (lines 312-348):
  1. **Line 313**: Creates JWT token for slide
  2. **Line 314**: Navigates to `{base_url}/internal/slide-render/{deckId}/{idx}`
  3. **Line 318**: `page.goto(url, wait_until="domcontentloaded")`
  4. **Lines 320-333**: Polls for `window.__slideReady === true` (readiness gate)
  5. **Lines 336-340**: Captures screenshot:
     ```python
     page.screenshot(
       path=out_path,
       clip={"x": 0, "y": 0, "width": width, "height": height},
       animations="disabled",
     )
     ```

**CRITICAL**: The screenshot is the **rendered DOM at that moment**. Whatever the browser has painted is what gets captured. The Python code does NOT post-process backgrounds.

---

## Risks

### Risk 1: Background Data Not Passed to Python
- **Issue**: The `PresentationRenderSpec` schema (line 364-381 of `contracts.ts`) does NOT include `slideContent`
- **Current flow**: Render spec contains slide metadata (`slideId`, `title`, `durationMs`) but NOT element details
- **Impact**: Python renderer has NO way to access background color/image — it only has access to what Playwright captured
- **Why**: Design decision to keep render spec lightweight; full slideContent stays in Node.js HTML

### Risk 2: External Image URLs Require Download
- **Issue**: If background is an image URL, Playwright must fetch it before screenshotting
- **Current pattern**: Playwright auto-downloads external images referenced in `<img src="...">`
- **Risk**: Slow URLs, broken links, CORS issues will cause timeouts
- **Mitigation exists**: Per-slide readiness gate (8-second hard timeout) already handles this for media elements
- **Location**: Lines 218-280 of `presentation_render.py` — but this only handles `<img>` and `<video>` tags in elements

### Risk 3: Background Not Part of Readiness Gate
- **Issue**: Current `waitForMediaThenReady()` (slideRender.ts lines 612-712) polls for `<img>` and `<video>` load events
- **Impact**: A slow background image might not block screenshot; screenshot happens before image loads
- **Solution required**: Must extend readiness gate to include background image loading

### Risk 4: Image Backgrounds Need URL Resolution
- **Issue**: `slideContent.background.url` might be a relative path or library item reference
- **Like audio tracks**: Audio tracks are resolved in `resolveAudioUrls()` (line 652-719 of `presentationPlaybackExport.ts`)
- **Need**: Similar resolution for background images BEFORE they reach the HTML
- **Current state**: NO resolution mechanism exists

---

## Options

### Option A: Render Background in Browser JavaScript (Recommended)

**Pros**:
- Uses existing Playwright + HTML rendering infrastructure
- Consistent with how elements are rendered
- Simple to implement: 30-50 lines of JS in slideRender.ts

**Cons**:
- Requires JS modification to readiness gate for image backgrounds
- Network delays in browser might slow down exports

**Insertion Points**:
1. **Resolution**: Add background URL resolution in `presentationPlaybackExport.ts` → `resolveSlideAudioUrls()` pattern
2. **HTML generation**: In slideRender.ts `renderElements()` function, add `renderBackground()` before rendering elements
3. **Readiness gate**: Extend `waitForMediaThenReady()` to include background image loading

**Implementation**:
```javascript
// After renderElements() (line 492 of slideRender.ts)
function renderBackground() {
  if (!slide.background) return;

  const canvas = document.getElementById("slide-canvas");
  if (!canvas) return;

  if (slide.background.type === "color") {
    canvas.style.background = slide.background.value;
  } else if (slide.background.type === "image" && slide.background.url) {
    const src = normalizeMediaSrc(slide.background.url);
    canvas.style.backgroundImage = `url(${src})`;
    canvas.style.backgroundSize = "cover";
    canvas.style.backgroundPosition = "center";
  }
}

// Call it in the main render flow (line 756)
renderBackground();  // Before renderElements()
```

---

### Option B: Post-Process in Python (Not Recommended)

**Pros**:
- Python has full control over image blending
- Can use Pillow to composite background onto rendered PNG

**Cons**:
- Requires slideContent to be passed through render spec (breaks architecture)
- Pillow blending is slower than browser rendering
- Cannot handle animated backgrounds (video)
- Defeats purpose of browser rendering

**Would require**:
1. Add slideContent to PresentationRenderSpec schema
2. New function in presentation_render.py: `_apply_backgrounds_to_screenshots()`
3. Pillow Image composition in _build_jpg_zip() / _build_png_zip()

---

### Option C: Hybrid: Cache Rendered Backgrounds as Data URIs

**Pros**:
- Backgrounds cached as base64 before export
- Single HTTP request per background

**Cons**:
- Complex: requires new cache layer
- Base64 inflation (image file size × 1.33)
- Overkill for presentation use case

---

## Recommendation

**Implement Option A: Render Background in Browser JavaScript**

### Rationale
1. **Consistent with architecture**: Rendering happens in browser, not post-processing
2. **Minimal changes**: ~40 lines of JavaScript
3. **Existing patterns**: URL resolution already done for audio; image loading already monitored
4. **Readiness gate already exists**: Just needs to be extended

### Implementation Phases

#### Phase 1: Background URL Resolution
**File**: `apps/web/server/services/presentationPlaybackExport.ts`
**After**: `resolveAudioUrls()` function (line 652)

Add function to resolve background image URLs from libraryItemId:
```typescript
async function resolveBackgroundUrls(
  renderSpec: PresentationRenderSpec,
  db: DrizzleDB,
): Promise<PresentationRenderSpec> {
  // Iterate through slideContent.background, resolve libraryItemId → presigned URL
  // Similar pattern to audio tracks (lines 652-719)
}
```

But WAIT: `renderSpec.slides` doesn't include slideContent! Need to either:
- Option A1: Add background resolution at a higher level before render spec is created
- Option A2: Pass slideContent through render spec (larger change)

**BETTER**: Add background resolution in `buildPresentationRenderSpec()` by reading the original `input.slides` which are `PresentationSlide[]` records that DO have slideContent.

#### Phase 2: HTML Background Rendering
**File**: `apps/web/server/routes/slideRender.ts`

1. **Line 124**: Change CSS to not hardcode white on `#slide-viewport`:
   ```css
   #slide-viewport {
     position: relative;
     width: 100vw;
     height: 100vh;
     overflow: hidden;
     /* background will be set by JS based on slide.background */
   }
   ```

2. **After line 492** (after `renderElements()`): Add `renderBackground()` function:
   ```javascript
   function renderBackground() {
     if (!slide.background) return;
     const canvas = document.getElementById("slide-canvas");
     if (!canvas) return;

     if (slide.background.type === "color") {
       canvas.style.background = slide.background.value;
     } else if (slide.background.type === "image" && slide.background.url) {
       const src = normalizeMediaSrc(slide.background.url);
       canvas.style.backgroundImage = `url(${src})`;
       canvas.style.backgroundSize = "cover";
       canvas.style.backgroundPosition = "center";
     }
   }
   ```

3. **Line 756**: Call `renderBackground()` before `renderElements()`:
   ```javascript
   renderBackground();
   fitCanvasToViewport();
   renderElements();
   ```

#### Phase 3: Readiness Gate for Background Images
**File**: `apps/web/server/routes/slideRender.ts`

**Lines 612-712**: Extend `waitForMediaThenReady()` to include background image:

```javascript
function waitForMediaThenReady(done) {
  // ... existing code ...

  // Add background image to the wait list
  const bgImg = new Image();
  if (slide.background?.type === "image" && slide.background.url) {
    const bgSrc = normalizeMediaSrc(slide.background.url);
    bgImg.src = bgSrc;
    // bgImg will be loaded/error tracked below
  }

  var imgs = canvas.querySelectorAll("img");
  var videos = canvas.querySelectorAll("video");

  // Add background image to count if it exists and is being loaded
  var imgCount = (imgs ? imgs.length : 0) + (bgImg.src ? 1 : 0);
  var videoCount = videos ? videos.length : 0;

  if ((imgCount + videoCount) === 0) {
    done(false);
    return;
  }

  // ... existing element load tracking ...

  // Track background image separately
  if (bgImg.src) {
    if (bgImg.complete) {
      doneOne(false);
    } else {
      bgImg.addEventListener("load", function() { doneOne(false); }, { once: true });
      bgImg.addEventListener("error", function() { doneOne(true); }, { once: true });
    }
  }
}
```

---

## Open Questions

1. **Should background images be presigned/hosted?**
   - Current: If user provides a URL, Playwright fetches it directly
   - Question: Should we proxy through our storage? Firewall issues?
   - Decision needed: Security posture for external URLs

2. **What happens if background image fails to load?**
   - Current readiness gate marks as "degraded" if any media fails
   - Should we: Fallback to default background? Continue with transparent?
   - Recommendation: Mark as degraded (consistent with other media failures)

3. **Background image stretch behavior?**
   - Suggested: `backgroundSize: "cover"` + `backgroundPosition: "center"` (standard practice)
   - Alternative: Allow user to configure (stretch, tile, etc.)
   - Current recommendation: Use CSS cover/center for all

4. **Should background layer order change?**
   - Current: Background would be painted on `#slide-canvas` before elements
   - Elements are rendered AFTER background
   - This is correct: elements should appear ON TOP of background

5. **Do we need to handle video backgrounds?**
   - Current schema only supports color + image
   - Playwright can handle `<video>` but would need recording mode
   - Deferred: Out of scope for this phase

---

## Exact File Locations & Line Numbers

| File | Lines | Component |
|------|-------|-----------|
| `apps/web/shared/presentation/contracts.ts` | 331-334 | `presentationSlideBackgroundSchema` definition |
| `apps/web/shared/presentation/contracts.ts` | 336-343 | `presentationSlideContentSchema` includes background |
| `apps/web/server/routes/slideRender.ts` | 118-144 | CSS with hardcoded white backgrounds |
| `apps/web/server/routes/slideRender.ts` | 207-215 | `resolveFontFamily()` helper |
| `apps/web/server/routes/slideRender.ts` | 294-344 | `normalizeMediaSrc()` helper |
| `apps/web/server/routes/slideRender.ts` | 475-492 | `renderElements()` function |
| `apps/web/server/routes/slideRender.ts` | 612-712 | `waitForMediaThenReady()` readiness gate |
| `apps/web/server/routes/slideRender.ts` | 756-758 | Main render flow initialization |
| `apps/web/server/services/presentationPlaybackExport.ts` | 652-719 | `resolveAudioUrls()` pattern for reference |
| `apps/web/server/services/presentationPlaybackExport.ts` | 1019-1057 | `buildPresentationRenderSpec()` where render spec is assembled |
| `python-backend/app/tasks/presentation_render.py` | 283-354 | `_render_slides_to_screenshots()` Playwright capture |
| `python-backend/app/tasks/presentation_render.py` | 102-162 | Main `render_presentation()` task |
