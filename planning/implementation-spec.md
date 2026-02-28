# AI Layout Auto-Generation Specification

## Core Objective
Implement a "Gamma-style" feature where users input a topic, and the system auto-generates a multi-slide presentation using LLMs, AI images (or placeholders), and our existing SVG graphics panel.

## Key Requirements
1. **Input**: A prompt containing the topic (e.g., "Why kids don't eat veg").
2. **LLM Generation**: Provide structured JSON defining 5 coherent slides. Each slide contains:
   - `Title`
   - `Body text` (paragraphs/bullets)
   - `Suggested image prompt`
   - `Suggested graphic category` (e.g., "Health", "Communication", mapping to `SVG_CATEGORIES`)
   - `Layout Type` (e.g., SplitTextRight, SplitTextLeft, FeatureGrid)
3. **Asset Gathering**:
   - Translate the image prompt to an Unsplash source URL (e.g., `https://source.unsplash.com/featured/?vegetables,kids`) or invoke any existing AI image wrapper.
   - Fetch SVG code from the `SVG_GRAPHICS` library matching the category.
4. **Layout Compilation**: 
   - A mathematical `LayoutEngine.ts` must map the text, image, and graphic elements onto specific `x`, `y`, `width`, `height` properties corresponding to `PresentationSlideContent`.
5. **Integration**:
   - TRPC route (`generateAIContent`).
   - UI "✨ Draft with AI" trigger.
