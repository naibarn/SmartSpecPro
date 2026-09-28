# Deep-plan Interview Transcript — Feature 153

## Interview status

The stakeholder supplied the required product decisions in the conversation;
no additional blocking interview question remains. The decisions below are
treated as locked inputs for planning.

## Q1 — What is the quality target and episode-count behavior?

**Stakeholder answer:** The system should recommend no more than 120 episodes
for highest quality, with 120 episodes × 90 seconds being approximately three
hours. If the user enters more episodes, the product should still support it;
120 is a recommendation, not a hard rejection. Larger requests should use an
explicit extended mode and should not be presented as having the same quality
guarantee.

**Planning consequence:** Preserve the existing technical target count support,
add quality/extended admission profiles, and make cost/time/confidence visible.

## Q2 — Can new characters enter during a long series?

**Stakeholder answer:** Yes. Existing behavior creates too few characters and
long stories can feel visually and dramatically empty. The system should add
recurring, arc, faction, and late characters when story logic requires them,
with controlled cast growth rather than a fixed five- or six-person roster.

**Planning consequence:** Add character lifecycle and cast-density contracts;
every addition needs a purpose, knowledge boundary, visual identity, and
exit/payoff state.

## Q3 — What does “guest star” mean?

**Stakeholder answer:** It means a fictional in-story character who appears
unexpectedly and matters to the plot, not a real celebrity. Examples include a
childhood fiancé in the final two episodes, a new villain near the end, or a
relative believed dead who returns. The surprise must be important but must not
make the story impossible to close or erase the main plot's causal history.

**Planning consequence:** Permit seeded surprise, valid presumed-missing return,
and controlled new arrival. Require evidence/world-rule explanation, bounded
impact, protagonist agency, and a payoff/exit or approved sequel hook.

## Q4 — Which genres and media capabilities matter?

**Stakeholder answer:** Support imaginative fantasy, sci-fi, cartoon-like
exaggeration, miracles/high spectacle, future scenes, realistic combat, and
more convincing cinematic romance/intimacy as media models improve. The story
should become richer without relying on a particular provider implementation.

**Planning consequence:** Add genre/world/power rules and provider-neutral
capability tags. Keep safety, consent, adult-only intimacy, and fallback rules
explicit.

## Q5 — How should wardrobe and looks change?

**Stakeholder answer:** Characters should not wear the same clothes throughout.
If the synopsis/script says gala, rural home, travel, sleep, combat, or another
context, the system should create a matching look. The change must exist in the
story; otherwise the system should not recommend additional looks. User image
references may change, but the fictional character identity and story facts
must remain controlled by the system.

**Planning consequence:** Add a story-cued wardrobe/look ledger tied to episode,
scene, location/time/event, continuity state, and existing outfit variants.
No uncued automatic outfit generation.

## Q6 — What is the user's quality concern about long-form continuity?

**Stakeholder answer:** The story must be truly long-form, not drift into random
content, leave the audience confused, or open more mysteries than it can close.
Early mysteries that are promised to be answered at the end must remain present,
and the protagonist/antagonist advantage exchange and character-origin stakes
must continue to create curiosity episode by episode.

**Planning consequence:** Reverse-plan the finale, use arc/block gates, track
central mystery evidence and consequences, and make unresolved closure a
blocking final finding.

## Decisions not delegated to implementation

- 120 episodes is the recommended maximum-quality profile, not a hard input cap.
- “Guest star” is fictional narrative terminology and carries no celebrity or
  likeness licensing assumption.
- New wardrobe looks require story cues or explicit user-authored approval.
- Provider-specific capabilities remain unresolved until the provider registry
  confirms them; the story contract must stay provider-neutral.

## Q7 — What additional continuity control is required?

**Stakeholder answer:** The series needs a user-visible relationship map showing
family hierarchy and social links: parent/child, siblings, spouse, wife's
sister/in-law, grandparents, family side, friends, relatives, acquaintances,
and factions. It must prevent scripts from changing a relationship accidentally
and must support repair when an anomalous relationship is found.

**Planning consequence:** Add a canonical graph with normalized edge types,
family groups/sides, episode validity, disclosure/known-by state, provenance,
and evidence. Include it in generation/retrieval/finale contexts. Graph repairs
must compute affected episodes, dialogue, memory, and adjacent recaps, expose
the impact in the UI, and activate only through Feature 152 candidate/approval
rules.

## Q8 — How should “Chinese-drama quality” be treated?

**Stakeholder answer:** It is a primary quality goal, especially for complex
relationships and long-form engagement.

**Planning consequence:** Define a Chinese-drama-comparable benchmark with a
deterministic continuity/closure floor and a human/sample rubric for emotional
rhythm, relationship readability, reversals, reveal payoff, dialogue voice,
visual variety, and ending quality. Do not claim equivalence from schema
validity alone.
## Q9 — Draft-source-of-truth and repair precision

**Planning decision:** The existing `generateStoryBible` draft must produce a
graph-ready candidate before deep drafting. `generateStoryBibleDeep`, horizon
extension, premium revision, resume, and repair all use the same graph revision
and fingerprint. Episode relationship changes are typed graph deltas; the old
pair-state memory remains a compatibility projection. Each accepted edge gets
an atomic reverse dependency index so the user can see exactly which episodes,
shots, dialogue, memory, and neighboring recaps will be repaired.

## Q10 — Operational quality envelope

**Planning decision:** Before paid work, show a versioned SLO envelope for
calls, repair rounds, time, credits, checkpoint/context size, and partial
behavior. Benchmark samples are fixed by episode percentage, reviewed by at
least two independent reviewers, scored with critical floors, and adjudicated
when reviewers disagree.

## Q11 — Scale, duration, and information isolation

**Planning decision:** The 90-second mode is a registered nine-shot profile
whose durations and speech bands sum exactly to 90 seconds and are consumed by
planning, dialogue QC, storyboard, and production assembly. Season planning for
120–1000 episodes is chunked and resumable before shot drafting. Component
fingerprints are independent, secret facts are redacted by viewpoint, cast
density is enforced by versioned budgets, and strict activation cannot use the
legacy direct bible write.

## Q12 — Runtime reliability and semantic relationship safety

**Planning decision:** Reuse the existing speech/content-budget and story-job
lease/heartbeat/fence/checkpoint/resume contracts. Strict runs need a watchdog
for expired work, durable pause/cancel/resume with credit reconciliation, and a
hard spend ceiling. Relationship edges must separately track canonical truth
and viewpoint belief, with deterministic inverse/cardinality/parent-cycle
validation.

## Q13 — Multi-engineer handoff and finalization

**Planning decision:** Pin inherited contract/policy/vocabulary versions,
define a typed retry matrix and deterministic idempotency composition, perform
activation read-back before success, and require horizon extension to create a
new candidate with re-planned terminal closure. Every AC must have one primary
section owner and proof label.
