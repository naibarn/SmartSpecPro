# Social Video Platform Expansion Interview Notes

Date: 2026-03-24

## Interview status

No live interview session was possible because the deep-plan task-list hook was unavailable in this environment. The planning artifacts below are therefore based on the written spec, codebase inspection, and official docs research.

## Assumptions Adopted

1. TikTok direct post and draft upload will both be supported in the first release.
2. YouTube upload / publish / schedule will be supported in the first release.
3. YouTube Shorts will be represented as a classification rule on the YouTube path.
4. The main integration surface will stay provider-neutral and background-first.
5. TikTok and YouTube comments can be deferred unless the implementation naturally extends moderation.

## Open Questions to Resolve During Implementation

1. Whether TikTok scheduling is exposed as a first-class action or represented as a draft until the provider confirms scheduling support for the target account.
2. Whether the UI needs a dedicated Shorts action or only a Shorts badge / classification flag.
3. Whether YouTube comment moderation is part of this feature or a follow-up.

