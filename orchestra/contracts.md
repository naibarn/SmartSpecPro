# Contracts

## Production Concept Card Contract

Owner: frontend UI implementation.

Input:
- `ProductionStoryConceptOption`
- selected concept id
- per-card loading/status fields
- callbacks for select, regenerate, generate infographic, fullscreen

Output:
- renders exactly one concept card
- never mutates sibling concepts directly
- emits card id for every card-level action

## Project Generation Defaults Contract

Owner: Media Studio orchestration and shared production types.

Shape:

```ts
generationDefaults?: {
  imageModelId?: string;
  videoModelId?: string;
  imageModelSource?: "project_default" | "media_tab" | "system_default";
  videoModelSource?: "project_default" | "media_tab" | "system_default";
};
```

Rules:
- image nodes use `generationDefaults.imageModelId` before tab/system fallback
- video nodes use `generationDefaults.videoModelId` before tab/system fallback
- never assign an image model to a video node or a video model to an image node

## Infographic Generation Contract

Owner: Media Studio orchestration.

Input:
- concept card
- production goal
- product truth/evidence context
- project default image model

Prompt intent:
- realistic polished infographic
- photorealistic supporting imagery
- storyboard/timeline visible
- concept understandable at a glance
- no unsupported product claims

Output:
- task id while generating
- image URL when completed
- card-level status/error on failure
