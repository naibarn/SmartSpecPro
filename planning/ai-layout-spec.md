# AI Presentation Auto-Generation (Layout Engine)

## Overview
We need to build a feature inspired by tools like Gamma or Tome. Users will input a topic (e.g., "Why kids don't eat veg"), and the system will auto-generate a 5-slide presentation. The slides must have varied, aesthetically pleasing layouts that combine text, images, and our new SVG Graphics.

## Features
1. **LLM Content Generation**
   - Call an existing LLM gateway with a system prompt.
   - Return structured JSON (Title, Body paragraphs/bullets, suggested image prompt, suggested graphic category, suggested layout).
2. **Asset Pipeline**
   - Generate an image based on the `suggested_image_prompt` (using our existing image generator wrapper or returning a placeholder URL for MVP).
   - Select 1-3 SVG graphics from `SVG_GRAPHICS` matching the `suggested_graphic_category`.
3. **Template-Based Layout Engine**
   - Since LLMs are bad at estimating absolute (x, y) coordinates, build a `LayoutEngine(content, imageUrl, graphics, layoutType)`.
   - The engine generates valid `PresentationSlideContent` objects.
   - Need at least 2 predefined layout templates:
     - `SplitImageRight`: Left side text, right side image (half width), graphics overlaid.
     - `FeatureBoxes`: Image on one side, 2-3 rounded boxes (background color) on the other side containing grouped text and icons.
4. **UI Integration**
   - Add a "✨ Draft with AI" button in the `PresentationEditor`.
   - Provide a loading state while calling LLMs and APIs.
   - Append the generated slides to the end of the current deck upon success.

## Technical Constraints
- Output must conform to `PresentationSlideContent` schema (arrays of `PresentationElementType` items).
- Layout Engine must handle responsive canvas dimensions properly (e.g. 1920x1080 standard).
