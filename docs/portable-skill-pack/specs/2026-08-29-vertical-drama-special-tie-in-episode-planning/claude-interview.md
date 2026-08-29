# Deep-plan interview transcript

No additional stakeholder round was necessary. The prior approved decisions in the
conversation are recorded below and are treated as the domain answers for this plan.

## Q1 — What is the intended user workflow?

The user starts from the existing Vertical Drama series/episode area, chooses the new
special sub-episode action, enters a free-form idea/brief, supplies optional product,
location, or store references, selects series characters, chooses duration/dialogue and
independent image/video models, and submits. The system creates the special episode and
automatically produces both start-frame image prompts and video prompts. It should look
and behave like a normal episode afterward, while normal story-driven creation remains
unchanged.

## Q2 — How should Marketplace Capture work?

It must be a real in-dialog browser, not a URL-only input. The user searches/filter the
Marketplace Capture product list, selects a product, loads its image list, selects the
specific one to three images, and confirms. The aggregate reference cap is three across
product/location/store references. Confirmed selections remain when the user changes the
pending product selection. Raw URLs are never the canonical API input.

## Q3 — What model and content isolation is required?

Special episodes have separate image-model and video-model selectors. Their selected IDs
and snapshots are episode-local and must not read or write normal series/model memory,
because tie-in work commonly uses different models. Special episode prompts are authored
by `idea-to-video-prompt`; the normal two-step prompt flow and normal episode behavior
must remain intact.

## Auto-decisions

- Use existing tRPC protected procedures, Drizzle schema conventions, Redis interactive
  jobs, media asset authorization, and Vitest patterns.
- Use a dedicated special adapter/job kind and an additive `episodeKind` branch instead of
  forking the normal episode page or modifying normal generation semantics.
- Use a monotonic per-series special sequence ledger so deleted records cannot reuse a
  visible special number.
- Treat 12 seconds as special-only additive support; do not change normal duration
  profiles.
- Keep provider calls and rendering explicit after prompt generation, preserving the
  normal credit and approval gates.
