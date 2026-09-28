# Image Prompt Safety Gate

## Scope

All application image-generation requests use the shared Node media service
gate. Video and audio requests are unchanged. Vertical Drama image requests
are identified by their trusted provenance/context markers and remain owned by
the existing Vertical Drama prompt and safety pipeline.

## Flow

1. The shared image service sends the provider-ready prompt to the
   `image-prompt-safety-rewriter` skill.
2. The skill returns structured JSON containing a minimally rewritten prompt,
   risk level, and preserved intent.
3. The rewritten prompt and a non-sensitive audit marker are sent to the
   selected backend. The marker contains prompt hashes, not prompt content.
4. The Python synchronous endpoint, asynchronous endpoint, and worker reject
   image requests without a valid marker before provider submission.

## Safety behavior

- Low-risk prompts may be returned unchanged.
- Sensitive but allowed prompts are rewritten toward neutral, age-appropriate,
  non-graphic framing while preserving subject and layout intent.
- Inherently disallowed prompts are blocked.
- If the review service is unavailable, sensitive prompts fail closed; low-risk
  prompts may use an unchanged fallback and remain marked as fallback.

This gate reduces avoidable policy failures but does not replace the image
provider's final policy enforcement.
