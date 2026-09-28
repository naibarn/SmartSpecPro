# Request

Add GPT Image 2.5 Flare and GPT Image 2.5 Sunburst to the Kie.ai media model catalog.

Requirements:

- one catalog row for Flare and one catalog row for Sunburst;
- do not expose separate Text-to-Image and Image-to-Image choices;
- select the Kie text-to-image operation when no image is attached;
- select the Kie image-to-image operation when one or more images are attached;
- use 70 credits per image, matching GPT Image 2;
- preserve unrelated dirty worktree changes and avoid paid provider calls.

Inferred repository constraints:

- reuse the existing `kie_model_id_with_references` routing contract;
- keep static registry, Kie seed, database migration, and focused tests in parity;
- use `input_urls` as an optional array with a maximum of 16 references;
- preserve the user-owned untracked migration `0288_feature_184_video_editor_revisions.sql`.

Non-goals:

- no new provider or environment variable;
- no separate frontend mode selector;
- no changes to existing GPT Image 2, Seedream, credit reservation, upload, or polling behavior;
- no deployment, restart, browser replay, or live Kie generation.
