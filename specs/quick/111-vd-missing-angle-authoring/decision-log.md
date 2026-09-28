# Decision log

- depth: standard quick-plan
- route: direct inline implementation after plan stabilization
- reason: medium UI/API workflow enhancement, but the server/data contracts and
  per-shot variant plumbing already exist; the main missing capability is local
  review/edit state in the existing storyboard card.
- reuse decision: reuse the existing Location Bible card, credit confirmation,
  model picker, candidate approval, authenticated media image, and shot-location
  picker patterns. Do not introduce a new dialog or schema.
- prompt editing decision: keep editing local to the card and pass the edited
  prompt directly as `approvedPrompt` to image generation. This avoids a second
  prompt-authoring call and duplicate prompt credit charge.
- primary-image decision: coverage-gap renders are linked with their selected
  coverage role, and approval must not set them as the location primary image.
