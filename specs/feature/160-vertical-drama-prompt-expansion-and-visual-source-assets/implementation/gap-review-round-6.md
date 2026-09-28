# Gap review round 6 — implementation completeness audit

This round re-checked the five prior gap-review conclusions against runtime
call sites and closed the following additional gaps:

1. AI-generated source images were provider-only and could expire. The new
   server settlement procedure now ingests the completed task result into
   owner-scoped managed storage before attaching it to a Source Pack.
2. The prompt dialog displayed slot proposals but did not save them. Apply
   now persists the edited slot descriptions and semantic-role mapping with
   optimistic pack-version fencing.
3. The visual snapshot was accepted by the admission contract but omitted by
   plan/deep/extend/improve callers. All four callers now capture and pass the
   current source-pack snapshot.
4. B-roll persistence trusted client segment/media identity. Binding and
   validation now re-resolve canonical owner-scoped rows and require a live
   managed storage object for B-roll media.
5. News claim/evidence state was only in memory. List/save/correction routes
   now persist immutable claim/evidence revisions under tenant + user + series
   ownership.
6. The source-slot prompt route had no matching per-slot UI. Source Hub now
   provides both prompt generation and image generation actions and attaches
   the resulting managed asset back to the selected slot without changing its
   scene/reference/B-roll meaning.

No additional code gap was found in role separation: place/shop remains a
scene anchor while product/software remains a reference, and B-roll remains a
separate shot-binding table. External browser, DB migration, provider, and
deployment checks remain explicitly pending rather than marked passed.
