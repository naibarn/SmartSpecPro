# Implementation Plan: AI Presentation Layout Engine

## 1. Feature Overview
This plan outlines the steps to build the AI Presentation Auto-Generator. It relies on extracting JSON output from an LLM and mapping it into predefined geometric layouts `presentation_element` properties.

## 2. Component Scoping
### 2.1 Backend Architecture
1. **TRPC Mutation (`presentation_router.ts`)**
   - Provide an endpoint `generateAIContent({ prompt: z.string(), numSlides: z.number().default(5) })`.
   - Call the LLM (via `openaiGateway.ts`) with a structured Zod schema output format (using `zod-to-json-schema` or OpenAI function calling).
   - Fetch image assets based on the LLMs prompt selection.
   - Inject randomized SVG snippets matching selected categories from the `GraphicsPanel` SVG definitions.
2. **Layout Engine (`services/presentationLayoutEngine.ts`)**
   - Create mathematical templates:
     - `generateSplitSlide(content, image, graphic, orientation)`
     - `generateFeatureGridSlide(content, image, graphic)`
   - Takes raw content and returns fully compliant `PresentationSlideContent` objects.

### 2.2 Frontend Architecture
1. **UI Actions (`PresentationEditor.tsx`)**
   - Add a `<Button>` triggered modal: "What should your presentation be about?"
   - Show loading text sequentially ("Drafting outline...", "Selecting graphics...", "Generating layouts...").
   - Upon success, fetch the returned slides and append them to the existing slides array.

## 3. Execution Strategy (TDD)
- **Step A:** Scaffold the Zod types and Prompt generation string. Write unit tests to verify the LLM prompt is constructed with all required constraints.
- **Step B:** Implement `presentationLayoutEngine.ts`. Write parameter-driven unit tests verifying that text boxes, images, and graphics are positioned inside the valid 1920x1080 canvas without overlapping.
- **Step C:** Integrate the TRPC route mapping Step A to Step B.
- **Step D:** Build the UI components and test state updates.

## 4. Risks & Mitigations
- **High Risk**: LLM schema hallucination. 
  *Mitigation*: Use strict JSON structural prompts (OpenAI JSON mode or function calling). Validate the result against Zod, retrying once if parsing fails.
- **Data Safety Strategy**: No destructive or migration risks; slides are purely appended to frontend state or saved as new elements. No schema changes required for MVP.
- **Regression Safety**: The presentation array editor uses decoupled commands. The manual drag-and-drop toolbelt will not be modified.
