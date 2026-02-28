# Research Notes: AI Presentation Auto-Generation

## Codebase Recon
### Existing Architecture
- Presentations are managed via `apps/web/server/routers/presentation.ts` for TRPC endpoints.
- AI processing exists in the backend, utilizing `apps/web/server/services/llm.ts` and `openaiGateway.ts`, which we can leverage for prompting the LLM.
- The app uses Zod schemas (`presentationElementCoordinateSchema`, `presentationImageElementSchema`) in `contracts.ts` which require precise positioning (x, y, width, height) and newly added SVG properties (`svgContent`, `svgColor`).
- Current UI for presentation lives in `apps/web/client/src/pages/PresentationEditor.tsx` where we can add a new UI trigger for the AI generation feature.

### Impacted Areas
- `PresentationEditor.tsx`: Needs a new "Generate with AI" modal/button.
- `apps/web/server/routers/presentation.ts`: Needs a new TRPC mutation (e.g., `generateAIContent`).
- `apps/web/server/services/presentationLayoutEngine.ts`: Need to create this new service to house the predefined template layouts (SplitImageRight, FeatureBoxes, etc.).

### Dependencies
- LLM Gateway: use `invokeLLM` from the existing backend.
- Image generation: We need to see if `generateImage` is available in `services` or we use a placeholder image API for the MVP.

## Web Research
- SOTA tools like Gamma and Tome use a combination of structured LLM outputs (JSON) and predefined layout templates.
- Asking LLMs directly to generate x/y coordinates for a responsive canvas yields poor results. Template injection with LLM-generated text/image properties is the optimal approach for reliability and aesthetic quality.
