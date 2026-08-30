# Vertical Drama episode repair

Implement an episode-scoped repair workflow for one Vertical Drama sub-episode. The workflow must read the series bible, deterministic series memory, the previous episode, and a bounded future constraint from the next episode before generating a complete replacement for synopsis, dialogue, and exactly nine shots. It must reduce policy-sensitive story contexts before image/video generation and add an analogous safety preflight to initial story generation.

Assumptions: repair is asynchronous, tenant/user scoped, original content and media remain recoverable, successful repairs are promoted automatically after deterministic gates, and failed/unsafe candidates remain inspectable without being promoted or sent to paid media providers.

Non-goals: deleting old media, changing provider policy, bypassing provider moderation, or regenerating paid start frames/videos inside the text repair job.
