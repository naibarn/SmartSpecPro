---
spec_id: 249
numbering_status: PROVISIONAL — verify SmartSpecPro canonical registry, main, active PRs and worktrees before reservation
title: SmartAIHub Adaptive Multimodal Tutor & Course Foundry
version: 1.4-fourth-ten-pass-design-audit
last_audited: 2026-09-25
document_audit_passes: 40
created: 2026-09-25
status: FORTY-PASS DOCUMENT-AUDITED DESIGN / NOT IMPLEMENTED / NOT PRODUCTION-CERTIFIED
proposed_repository_path: specs/feature/249-adaptive-multimodal-tutor-course-foundry/spec.md
risk_class: medium-high; high for minors, sensitive educational content, and untrusted uploads
primary_owners: [Learning Product, Feature 196, UX, Retrieval, Trust & Safety]
canonical_authorities: [Feature 196, Spec 220, Spec 229, Spec 231, Spec 233, Spec 241, Spec 186, Spec 195, Spec 215, Spec 207]
related_specs: [186, 195, 196, 199, 207, 209, 212, 215, 220, 221, 222, 224, 225, 226, 229, 231, 233, 237, 238, 240, 241, 242, 243, 244, 246, 248]
release_flags_default: OFF
---

# Spec 249 — SmartAIHub Adaptive Multimodal Tutor & Course Foundry

> **Latest normative amendment:** R1.4 §26 contains audit passes R31–R40 and supersedes less restrictive earlier clauses on the same issue. The forty passes are *document/design review* only; no executable tests or live system certifications are implied.
>
> **Normative status and scope.** This is an *additive implementation design* synthesized from the Tutor product discovery session. It is not evidence that any dependent Spec is implemented, that Spec 249 has been reserved, or that the proposed endpoints/tables exist. The authoritative SmartSpecPro registry, main branch, PRs, worktrees, deployed code/schema and dependency certification MUST be inspected before creating the canonical repo path or enabling a release. If `249` is occupied, renumber **this new document**; do not overwrite an existing spec.
>
> **Immutable implementation boundary.** Specs 1–213, including 196/199/209/212/213, MUST NOT be retroactively rewritten. Spec 224 is currently in-flight and MUST NOT be modified by this effort. Capture required changes as *additive adapters, versioned contracts, compatibility backlog, migrations and tests* owned by a later spec. New Tutor features MUST NOT bypass any unresolved P213/Spec224 production admission gate.
>
> **Normative wording:** MUST/SHALL = release requirement, SHOULD = strong preference requiring documented exception, MAY = optional. Any numeric SLO or policy threshold marked `INITIAL PROPOSAL` must be baselined against telemetry before production commitment.

## 0. Executive decision

Create **one shared Adaptive Learning Runtime**, rather than separate English/Mathematics/Science/AI Tutor applications. It combines:

1. **Course Foundry**: reusable curated courses and user-defined micro-courses generated from natural language, each with explicit learning outcomes, competency graph, scope and evidence requirements.
2. **Conversational Tutor**: a bidirectional dialogue in which both the learner and the agent initiate questions, adapt explanations, stop unnecessary probing and permit topic detours within a governed curriculum.
3. **Evidence-Based Learner Model**: atomic competency states grounded in learner questions, explanations, practical artifacts and transfer exercises; no inference of mastery merely from confident chat responses.
4. **Multimodal/Visual Pedagogy**: text, live voice, uploaded images/screen captures, annotated examples, visual comparisons, infographics, interactives and subject-specific workspaces.
5. **Learning Workspace**: conventional Course Map and progress, contextual Tutor Chat, Canvas, revisit-able Learning Artifacts, learner-owned Memo/Notebook, progress evidence and bookmarks.
6. **Course Promotion Pipeline**: private on-demand courses can be refined into reusable catalog/Marketplace courses after quality, privacy, copyright and owner-review gates.

The central product invariant is **a stable learning goal, but a flexible pathway**. Two users may study the same course, ask different questions, follow different examples, skip different topics and create different final projects while meeting the same *applicable* learning outcomes.

**Working name:** Adaptive Multimodal Tutor & Course Foundry. It is not a separate general-purpose assistant, LMS replacement, third-party learning standard, independent job engine or universal credentialing authority.

## 1. Outcomes, personas and explicit non-goals

### 1.1 Target outcomes

- Learner starts from an existing course **or** a sentence such as “อยากเรียนสร้างภาพให้นางแบบดูโดดเด่น”; Tutor presents a small bounded course with `what you will be able to do`, relevant applications, approximate scope and first practice opportunity.
- Experienced learners bypass mastered topics *only where enough independent evidence exists*; unknown, rusty and contradicted knowledge remain distinct.
- When a learner cannot understand a question, Tutor changes wording, format, example and media while preserving the *diagnostic intent*, and does not equate misunderstanding of a question with lack of subject competence.
- Learner may ask questions at any point; Tutor answers first, uses learner questions as **weak/medium evidence**, scopes the detour, and can resume a bookmarked learning objective.
- User-provided images are first-class learning inputs and linked evidence; generated images/infographics are first-class teaching materials, with provenance and appropriate caveats.
- Course Map, Learning Artifacts, personal notes and raw conversation are navigable together without treating all of them as an undifferentiated memory.
- A selected on-demand course may be generalized and published for others **without carrying over personal chat, images, memos or identifying details**.
- Tutors in different domains use the same control plane but invoke domain-specific verifiers and pedagogical packs.

### 1.2 Personas

- Newcomer: starts with no technical vocabulary, needs concrete examples, short questions and visual demonstrations.
- Experienced but uneven: can create working apps yet may not know structured skill schemas, agent isolation or testing; needs targeted diagnostic paths.
- Domain professional: accountant, lawyer, salesperson, affiliate marketer or creator; wants the same foundational skills applied to different end-use projects.
- Educator / course author: curates competency graphs and assessment rubrics and reviews reusable courses.
- Guardian / institution admin (if minors are enabled): controls appropriate access, content and reports under scoped consent.

### 1.3 Non-goals

- Replacing qualified teachers for mandatory schooling, high-stakes certification or supervised lab work.
- Making claims of universal learning-style matching (e.g., permanently labeling a learner “visual learner”); optimize *observed support effectiveness* by task, not fixed psychological types.
- Auto-publishing individual learner conversations or uploading third-party material without rights.
- Making one LLM the sole authority over mathematics, scientific facts, graded practical results, authorization or payments.
- A new orchestration kernel, notification gateway, model router, vector database, skill registry, wallet or identity layer.
- Promise that a Skill always reduces token use or that longer prompts/camera specifications always improve image quality.

## 2. End-to-end user journeys

**J1 Curated / personalized.** Choose “Claude Vibe Coding: Zero to Production” -> see measurable outcomes, possible applications and modules -> permission-aware short conversational diagnosis -> skip supported topics -> guided development project with natural Q&A, code/visual comparison and progressive debugging -> final transfer exercise -> learning artifacts and review reminders.

**J2 Learner-defined micro-course.** Type “สร้างภาพอย่างไรให้นางแบบดูโดดเด่น” -> Course Foundry offers a bounded course, e.g. 4 competencies (subject separation, lighting, composition, reusable prompting), examples of resulting portfolio, exclusions, and first image comparison -> learner edits goal and selects fashion/ad/cinematic/anime -> AI tutors interactively using image examples and learner uploads -> proof-of-work and reflective summary -> private course version remains editable.

**J3 Conversational diagnostic rescue.** Ask “งานที่ทำซ้ำทุกวันจะสร้างระบบไม่เปลือง token อย่างไร?” -> learner is confused -> rephrase as “ทำงานอะไรซ้ำบ่อย?” -> learner says “สร้างภาพไปทำวิดีโอโฆษณา” -> ask for a real prompt, discover knowledge of people/clothes/place but uncertain automation -> compare prompt template vs Skill vs Workflow -> teach whichever prerequisite is actually missing. No endless questioning.

**J4 Learner interruption.** During Skills lesson, learner asks why `compact` appears and why multiple agent names are shown -> answer concise, distinguish confirmed from provider/UI-version uncertainty, ask for screenshot only if necessary, tag Context/Subagents as curriculum-adjacent, optionally create bookmark and return to Skill lesson at user's choice.

**J5 Visual evidence.** Learner uploads two generated portraits -> Tutor compares framing/lighting only within what can be inferred, overlays annotations with learner permission, asks learner to identify a difference, stores uploaded original and reviewed annotation as separately provenance-linked assets; avoids treating a subjective preference as objectively correct.

**J6 Learning notebook.** Learner pins Tutor answer, highlights text, pastes screenshot, writes personal Memo and later searches “Skill Cinematic vs Anime”; finds question/answer/artifact/original image, learner-authored note and last competency state; can reopen the exact original context.

**J7 Promote course.** Multiple private users request closely related micro-courses -> aggregate *non-identifying demand signals only* -> creator/admin proposes a generalized course -> deduplicate and review learning outcomes, assessments, rights, safety and quality -> publish versioned discoverable catalog entry; previous learners' content remains private.

## 3. Core architecture and ownership

```text
Web / Mobile / Tablet / Desktop: Tutor Learning Workspace
 ├─ Curated Catalog / On-demand Course Builder / Teacher Studio
 ├─ Course Map & Progress     ├─ Tutor Chat / Realtime Voice
 ├─ Visual Canvas / Practice  └─ Artifacts / Personal Notebook
                            |
                  Tutor Session API (additive)
                            |
             Feature 196 Assistant / Approval / Context
                            |
     Adaptive Learning Domain (Spec 249 — logical modules)
 ├─ Course Synthesis & Versioned Competency Graph
 ├─ Curriculum-Aware Conversation & Scope Guard
 ├─ Conversational Pedagogy / Visual Pedagogy
 ├─ Evidence Extractor / Diagnostic / Learner State
 ├─ Adaptive Learning Decision Policy / Practice Packs
 └─ Learning Artifact / Memo / Course Promotion Services
      |                |                |             |
  Spec 240         Spec 229         Spec 241/233   Spec 209/215
  GenUI            Vectorize        Memory         Workflow
      |                |                |             |
 Spec 237 live  Spec 231 route   Spec 220 auth   worker_jobs
      |                |                |             |
     R2 media / PostgreSQL canonical domain state / billing Spec 207
```

This diagram is a responsibility model, not a required number of deployed services or LLM agents. Start with one Tutor service / Feature 196 adapter and asynchronous bounded jobs; split only when actual isolation or scale evidence requires it.

### 3.1 Non-duplication matrix

| Concern | Existing authority (verify actual repository before binding) | Spec 249 additive contract |
|---|---|---|
| Conversation / agent lifecycle | Feature 196, Spec 226 compatibility | `tutor.session` profile, adaptive turn decisions, lesson bookmarks |
| Durable jobs, retries, idempotency, outbox | Feature 186/195 canonical `worker_jobs` | job payloads for media, evaluation, course materialization; no new queue authority |
| Workflow authoring and execution | Specs 209/214/215 | guided practice template adapters and Tutor workflow nodes only if absent |
| Identity, tenant scope, ACL, grants, privacy, approval | Spec 220 | stricter learner/teacher/guardian resource policy, consent UI, RLS bindings |
| Inference and budget | Spec 231 routing + Spec 207 ledger | pedagogical task labels/quality floors; token budgets, no second ledger |
| Retrieval, citations and vector index | Spec 229 + Cloudflare Vectorize | course/competency/artifact filters and scoped queries; Postgres as source of truth |
| Project memory | Spec 233 | Tutor links/projections only; no independent project-memory authority |
| Personal/shared memory governance | Spec 241 | Tutor namespace, source attribution, learner controls; no cross-user defaults |
| Agent-generated safe UI | Spec 240 | lesson card, multiple choice, image compare, infographic and notebook component schemas |
| Live voice/camera/screen | Spec 237 | Tutor turn-taking, transcript confidence, handoffs; no second realtime gateway |
| First-party Chat/mobile/tablet | Specs 225/226 | Workspace tabs, handoff and offline note drafts |
| Skills authoring, discovery, MCP distribution | Specs 221, 248 and 199 | supervised teaching/demo and approved public course examples; never execute imported Skill by default |
| Use-case/catalog marketplace | Implemented Spec 212 via additive extension + later product shell | Tutor course catalog record, review/publish adapter; do not rewrite Spec 212 |
| Alert/schedule | Spec 238 and notification authority | opt-in review nudges; no separate scheduler |
| Scientific simulation | Spec 246 only where justified | optional verified specialist practice pack, not MVP dependency |
| In-flight development runtime | Spec 224 unchanged | optional training examples/adapter later; not on critical path |

## 4. Course domain: familiar structure, adaptive delivery

### 4.1 Course modes

**A. Curated course**: reviewed and versioned; explicit audience, prerequisites, intended applications, competencies, outcomes, resource licenses, rubrics, expected final product, required verifiers and recommendation rules. Prebuilt catalog remains available if AI service is degraded.

**B. On-demand private course**: synthesized from a learner's objective, *not* immediately published. One topic may be a 20-minute micro-course or a long program. Presents proposed title, outcomes, in/out scope, initial examples, expected evidence, optional time preference and likely gaps. Learner can accept, edit, narrow, expand or stop; all changes versioned.

**C. Reusable/published course**: reviewed generalization of A or B with teacher/creator-owned licensed materials; no personal source data. Public catalog, marketplace and white-label distribution only through existing publication controls.

### 4.2 Course schema (conceptual)

`CourseDefinition {id, tenant_id, owner_id, visibility, origin_kind, title, locale, description, target_audience, applications[], outcomes[], scope_in[], scope_out[], prerequisite_edges[], competency_ids[], module_outline[], domain_pack_id, media_policy, assessment_policy, safety_policy, source_refs[], license_evidence[], version, status, created_at}`.

`LearningOutcome {id, observable_verb, context, minimum_evidence_types[], success_rubric_ref, real_world_application, verifier_type}`. Example: “Given a current image-prompt Skill, separate invariant instructions from style parameters, implement a controlled cinematic/anime switch, explain the trade-off and validate it with at least two distinct inputs.”

**Requirement:** Course version immutable once published; new content creates a new version with a compatibility/migration map for ongoing enrollments. Editing an active learner-specific path does not edit catalog canonical definitions.

### 4.3 Atomic Competency Graph

`CompetencyNode {id, version, canonical_name, precise_behavior, counter_examples[], misconception_tags[], prerequisite_node_ids[], related_node_ids[], transfer_targets[], evidence_policy, subject_pack, deprecation_map}`.

Represent prerequisite, related, alternative, enabling and specialization links explicitly; validate prerequisite graph acyclicity for a *given release* while permitting learner path repetition/review. Prefer a DAG for requirements, not a linear module list. Avoid unbounded automatic graph expansion; teacher-reviewed curation for public curricula.

Sample Claude image Skill subset: `prompt.basics`, `prompt.structured`, `prompt.reuse-template`, `skill.fundamentals`, `skill.parameters`, `skill.input-output-schema`, `skill.ui-projection`, `skill.testing`, `context.compaction`, `agents.delegation`. Different nodes can have independent knowledge states; a learner may know `prompt.basics` but not `skill.ui-projection`.

### 4.4 Module outline and progress semantics

A Course Map SHALL retain a conventional hierarchical display: Course > Module > Topic > Activity, with learning outcomes and estimated scope. The order is the **default traversal**, not the only permitted path. Per node: `not_started`, `exploring`, `evidence_needed`, `mastered`, `prior_knowledge_verified`, `review_due`, `blocked`, `not_applicable`. “Viewed” / “completed activity” MUST NOT automatically mean “mastered.” Progress UI displays coverage and confidence separately and marks adaptations made for the learner.

## 5. Course Synthesis Engine and course quality gates

Input request: language, learner purpose, available time (optional), practical target, relevant tools, prior knowledge (optional), media accessibility preferences (optional), age/permission policy, content license constraints.

Pipeline:

1. **Intent and scope framing**: infer a bounded course target; if vague, propose 2–3 concrete outcomes in one interaction, without lengthy intake questionnaire.
2. **Reuse-first retrieval**: query authorized curated courses and reusable competencies through Spec 229; deduplicate by semantic goal and rubric rather than title matching alone. Offer an existing course or personalized branch when truly equivalent.
3. **Competency planning**: build a minimum viable graph anchored to outcomes; include diagnostic points, misconceptions, first activity and optional advancement branches.
4. **Evidence planning**: each outcome has at least one learner-originated assessable action and, for important outcomes, a transfer task. A quiz-only micro-course is insufficient for practical skills.
5. **Safety and source review**: cite allowed provenance, version volatile vendor docs, screen for unsafe procedures, age restrictions, factual uncertainty, bias and licensing.
6. **Learner preview and acceptance**: show objectives, boundaries, possible applications, first lesson and the learner's right to adjust scope.
7. **Version and instantiate**: private course release + enrollment/personal learning plan snapshot; feature flags and policy gates enforced.

Course generation SHOULD compose preapproved concept and lesson templates rather than regenerate every media/assessment item. Missing authoritative material must be disclosed and not represented as verified fact. Vendor-specific Claude/OpenAI/Google tutorials require periodic version freshness checks; archived examples retain version metadata.

Promotion of a micro-course to catalog follows Section 13 and is never an implicit consequence of enrollment.

## 6. Evidence-Based Learner Model

### 6.1 Learning evidence taxonomy

- `question`: what the learner asked; identifies interest, vocabulary and possible uncertainty; **insufficient by itself for mastery**.
- `explanation`: learner restates or reasons independently, graded by rubric and degree of prompting.
- `response`: selected choice or short answer; record hint and option exposure; choosing correctly is not equivalent to open-ended articulation.
- `practice`: actual tool action, code/test output, authored prompt, annotated image, solved calculation or simulated experiment.
- `transfer`: novel use case without the demonstrated template; stronger evidence of generalization.
- `retention`: delayed revisit without immediate cue.
- `self_report`: reported experience/preference only; cannot certify ability.
- `counter_evidence`: incorrect explanation, inconsistent practice or verifier failure; retain contradictory history with timestamp.

`LearningEvidence {id, tenant_id, learner_id, enrollment_id, competency_id, source_type, source_ref, source_version, original_question_id, media_refs[], rubric_version, support_level, result, confidence, evaluator_kind, verifier_receipt, created_at, retention_class, visibility}`.

Source refs are immutable and permission-checked. AI summaries are *derived* evidence, not replacements for originals. Self-reported skills have status `reported_unverified`; malformed, stale, missing or unauthorized evidence MUST fail closed for mastery credit.

### 6.2 Competency state

`CompetencyState {learner_id, course_instance_id, competency_id, status, evidence_refs[], positive_evidence, conflicting_evidence, confidence_band, last_independent_success_at, review_due_at, updated_at, state_version}`.

`confidence_band` is an internal calibrated tier (`insufficient`, `emerging`, `supported`, `verified`) grounded in domain rubrics; **do not show a fabricated percentage precision** unless validation supports it. An LLM's self-reported confidence is not a mastery score.

Mastery decisions SHALL be delegated to a policy with domain-specific verifier floors and learner-visible reasons. Strong demonstrations may verify prior knowledge and skip introductory instruction; no general requirement for fixed Level 1→2→3 placement.

### 6.3 Detecting uncertainty and question misunderstanding

Classify only observable conversational signals: explicit “งง/ไม่เข้าใจ,” asks for rephrasing, answer addresses a different meaning, repeated inability to parse terms, or requests a format change. Record a **hypothesis**, not a cognitive diagnosis. Ask a short disambiguation where multiple causes are plausible; do not interpret accent, latency, silence or ASR artifacts as incompetence.

Separate `question_not_understood`, `knowledge_gap`, `partial_knowledge`, `expression_barrier`, `tool_or_access_problem`, `low_asr_confidence`, `off_scope` and `unknown`.

### 6.4 Evidence updates and conflict resolution

Append evidence atomically with a source/trace ID and idempotency key. Recompute node state only after verifying source and rubric version. Independent artifact/verifier evidence outranks a merely confident response for procedural competencies; retain exceptions for domains where open-ended reasoning is the core skill. On contradiction, use `evidence_needed` with a fresh transfer probe, never silently overwrite previous learner history.

Learner may view, dispute or correct context/memo claims; dispute cannot forge a verified task outcome. Recompute affected projections with audit trail and propagate deletion/revocation to embeddings and cached artifacts per existing governance.

## 7. Bidirectional conversational pedagogy

### 7.1 Invariants

- Learner ALWAYS has the floor to interrupt, ask, redirect, request simpler wording, request examples, attach media, switch modality or decline a question. AI MUST answer a learner-initiated question before opportunistically probing, except where policy/safety intervention is necessary.
- Tutor SHOULD normally ask only one pedagogically useful question at a time; multiple-choice, visual comparison, practical exercise and voice are equivalent *interaction options*, not equal-strength mastery evidence.
- Every Tutor question MUST carry `pedagogical_intent`, `target_competencies[]`, `scope_relation`, `expected_evidence_type`, `support_level` and `abort_if_no_value` in hidden structured metadata; these fields are not a license to expose chain-of-thought.
- When the learner says “ไม่เข้าใจคำถาม,” first rephrase and/or contextualize; DO NOT score it as lack of competence. After repeated failed rephrasing, teach or demonstrate rather than interrogate indefinitely.
- Tutor responds to the original learner question before connecting it back to the curriculum; never use “answer only by asking questions” as a universal policy.
- A conversational move MUST justify its relevance to a course learning objective or explicitly mark an opt-in side quest; irrelevant Tutor-generated questions are blocked.

### 7.2 Pedagogical move registry

`PedagogicalMove = OPEN_PROBE | REPHRASE_PLAIN | CONCRETE_EXAMPLE | BREAK_DOWN | CHOICE_SCAFFOLD | VISUAL_EXAMPLE | IMAGE_COMPARE | INFOGRAPHIC | LIVE_DEMO | PRACTICE | FEEDBACK | EXPLAIN | HINT | REFLECTION | TRANSFER_CHALLENGE | REVIEW | HANDOFF | RESUME`.

`REPHRASE_PLAIN` preserves assessment target, simplifies technical vocabulary and optionally ties a prompt to the user's real work. `CHOICE_SCAFFOLD` marks `support_level=guided` and cannot alone verify an unguided competency. `EXPLAIN` and `LIVE_DEMO` follow uncertainty; `TRANSFER_CHALLENGE` may only be used after enough background is taught or demonstrated.

Example decision policy (INITIAL PROPOSAL, tune on observed failures):

```yaml
learner_says_question_is_confusing:
  move: REPHRASE_PLAIN
  preserve: [target_competencies, diagnostic_intent, scope]
  if_confused_again: [CONCRETE_EXAMPLE, VISUAL_EXAMPLE, CHOICE_SCAFFOLD]
  if_still_blocked: [EXPLAIN, LIVE_DEMO, PRACTICE]
  never: [automatic_fail_grade, repeat_same_wording, aggressive_interrogation]
learner_asks_question:
  move: ANSWER_FIRST
  next: [extract_question_evidence, scope_check, ask_optional_follow_up]
learner_demonstrates_prior_knowledge:
  move: [TRANSFER_CHALLENGE, OPTIONAL_SKIP]
learner_requests_voice:
  move: HANDOFF_TO_SPEC_237
  carry: [session_id, topic_bookmark, learner_state_version, media_consent]
```

### 7.3 Scope guard (for BOTH tutor and learner)

Classify the relation to **current activity**, **course competency graph**, **learner application goal** and **allowed material** independently:

- `IN_ACTIVITY`: answer and continue, possibly change instructional move.
- `WITHIN_COURSE_DETOUR`: answer immediately; optionally introduce just-in-time prerequisite or bookmark an advanced topic; resume on learner choice.
- `APPLICATION_ADJACENT`: give bounded explanation; offer an explicit opt-in branch when it does not dilute required outcomes.
- `OUTSIDE_COURSE`: briefly answer only when permitted and user wants a brief detour; otherwise offer general Chat or save question; never arbitrarily broaden formal course outcomes.
- `RESTRICTED_OR_UNSAFE`: follow existing safety, age, privacy and external action rules; a curriculum label never authorizes prohibited execution.

Scope check MUST be semantic and graph-aware rather than keyword-only. Low classifier confidence should avoid falsely blocking a legitimate question; ask or offer a choice when necessary. The learner may temporarily leave and return. Protect a `return_bookmark {activity_id, question_id, state_version, created_at}` and display pending side quests without filling the official progress map with accidental topics.

**Tutor-question drift test:** ask “What observable distinction or learner action would this question reveal?” If none maps to an active learning goal, discard or reformulate it. For image-prompt Skills, do not launch an extended photography exam unless the learner explicitly opts into photography learning.

### 7.4 Learner-originated inquiry as evidence

Parse the learner's query into `intent`, `topic_entities`, `known_claims`, `stated_uncertainties`, `context`, `scope_links` and `follow_up_candidates`. Example question about cinematics/anime identifies existing Skill usage **as self-report**, uncertain parameterization, and expressed desire to vary media styles. It does not verify Skill authoring ability, schema expertise, or model selection proficiency.

Before probing, provide an accurate answer: one Skill MAY handle styles as parameters if it has a coherent shared responsibility; split only if workflows/resources/evaluation differ enough to justify separation. Recommend controlled comparison of generated outputs; do not claim every style change works on every provider/model.

### 7.5 Interruption and resume state machine

`ACTIVE -> QUESTION_INTERRUPT -> ANSWERING -> (OPTIONAL_PROBE | SIDE_QUEST | RETURN_BOOKMARK) -> ACTIVE`. Additional: `MEDIA_SWITCH`, `PAUSED`, `AWAITING_USER`, `NEEDS_HUMAN`, `COMPLETE`, `ERROR_RECOVERABLE`. A voice session drop shall retain a text-accessible transcript/bookmark and an unambiguous last committed turn; never double-award mastery after replay.

### 7.6 Reduce over-questioning

Per-turn policy SHALL support `question_budget`, explicit “skip explanation,” opt-out from diagnostic prompts, frustration/help signals and cooldown after repeated confusion. Choosing a brief explanation is valid participation and should not falsely mark mastery. Ask only questions whose expected information could alter a subsequent pedagogical decision.

## 8. Multimodal and visual pedagogy

### 8.1 Modality selector

`text`, `image_example`, `annotated_image`, `before_after_compare`, `infographic`, `concept_map`, `short_video`, `screen_capture`, `code_workspace`, `math_workspace`, `scientific_simulation`, `voice_live`, `accessible_transcript`, `choice_ui`.

Selection inputs: competency's representational requirements, current task, learner's expressed preference, observed comprehension of *this task*, accessibility constraints, client capabilities, provider health and estimated cost. Avoid inferring immutable learning styles. Offer text alternative / alt text for meaningful visuals and keyboard/low-bandwidth alternatives.

### 8.2 Visual examples

- Use an existing licensed, reviewed example first; generate new media when it materially improves explanation, personalization or hands-on practice.
- Visual learning units MAY have paired visuals: baseline vs modified prompt, style switch, image annotations and annotated counterexample. Each image must have provenance, generation prompt/model/version when applicable, content/license status and association with the relevant explanation.
- Diagrams/infographics SHOULD derive from verified underlying structured facts. Render textual labels accessibly; avoid using image generation as the only source of factual scientific/math diagrams. Distinguish illustrative simulation from experimentally established result.
- Keep external reference images and generated examples visually distinguished. Never claim an illustration is a real record of an experiment or learner's work.

### 8.3 Learner uploads and captures

On upload or screenshot: preview -> consent and audience controls -> malware/content screening -> canonical R2 asset with scoped metadata -> visual analysis -> optional learner confirmation -> teaching artifact and evidence links. Respect EXIF minimization, potential faces, school records, customers' data and bystander privacy; default to private, strip metadata not needed, apply tenant scope before image/vector indexing. A learner-supplied reference is NOT permission to republish or train on it.

Tutor must ask whether an uploaded image represents **desired reference, learner's own attempt, comparison example or screenshot of a tool error** when unclear; confidence about provenance affects evidence weight. OCR/vision errors cannot produce unreviewed high-stakes grades. Show image region references, correction controls and the original screenshot before accepting a conclusion.

### 8.4 Visual interaction and assessment

Provide vetted GenUI (Spec 240) component contracts for `ImageCompare`, `ImageRegionAnnotation`, `ChoiceCard`, `ConceptMap`, `RubricCard`, `StepTimeline`, `BeforeAfter`, `InfographicViewer`, `Scratchpad`, `LiveTranscript`. Components emit structured user actions and retain source refs; never execute agent-authored JavaScript. Visual answer scoring MUST distinguish aesthetic preference from identifiable constraints such as aspect ratio or explicit target placement.

### 8.5 Live voice

Reuse Spec 237 realtime provider/session gateway. Support interruptible turn-taking, transcript visibility and correction, optional camera/screen-share with explicit time-bounded consent, captioning, push-to-talk fallback, mute and immediate downgrade to text. Do not infer competence or emotion from voice characteristics; ambiguous or low-confidence ASR evidence is ungraded until confirmed. No recording or voice retention beyond policy consent.

### 8.6 Modality costs and fallback

Before initiating chargeable image/video generation or long live sessions, show forecast where feasible and enforce Spec 207 budget/quota and existing approvals. When voice/image providers are unavailable or over budget, recover to text, annotated existing visuals or delayed reviewed material *without losing session progress*. Heavy media rendering should occur in `worker_jobs`, not block the chat control loop.

## 9. Learning Workspace UX

### 9.1 Information architecture

Desktop layout (responsive and configurable):

```text
Course header: title | outcome | lesson | evidence-backed progress | return bookmark
+----------------------+--------------------------------+----------------------------+
| Course Map           | Tutor Conversation             | Learning Notebook          |
| module > topic       | text / image / voice           | Artifacts (AI-extracted)    |
| completed/verified   | learner interrupt anytime     | Personal Memo (user-owned)  |
| review_due           | contextual choice / uploads   | pinned question / answer   |
| learner branches     | linked Visual/Practice Canvas | media + version/provenance  |
+----------------------+--------------------------------+----------------------------+
Bottom / optional: full-screen Visual Canvas | Workbench | My Progress | Course Settings
```

Mobile: Chat/Voice and Canvas are primary; accessible tabs `Learn`, `Course`, `Notebook`, `Practice`, `Progress`. No required three-column UI. Tablet supports split pane. Preserve state across devices through existing Spec 225 contracts and content version guards. Users may hide progress/diagnostics in active practice to avoid anxiety and reopen them at will.

### 9.2 Course Map

Display conventional module/topic/lesson structure, prerequisites, observable outcomes, completion vs mastery, personal adaptation branch and explanation for `prior_knowledge_verified`, `review_due` and `blocked`. Each topic opens associated chat range, practice artifacts, pinned question, images, learning summary and eligibility to revisit. Do not invent completion percentages from unverified interactions.

### 9.3 Learning Artifacts (generated and revisitable)

An Artifact is an **inspectable, versioned derivative of learning interactions** with one or more source refs:

- Key question and contextual answer card.
- Lesson recap and “remember this” note.
- Image comparison with annotated before/after and prompts.
- Infographic/concept map grounded in verified lesson content.
- Learner practical output, code diff, math solution or science simulation receipt.
- Outstanding confusion/learning bookmark and next-step rationale.

Each Artifact shows `source conversation turn(s)`, media origins, curriculum link, confidence/review status, course/enrollment version, last edit, and whether it was auto-extracted or learner-pinned. A click returns to the exact originating chat context. Tutor must not silently replace an old meaning after course revisions; revisions create new versions or a visible diff.

Auto-extraction occurs at meaningful milestones (resolved question, demonstration, task feedback, session close), not for every chat message. Prefer rule-triggered extraction and low-cost models, batch nonurgent summarization, allow regeneration and correction, and cap notebook noise.

### 9.4 Personal Memo (learner-owned)

Rich but safe note editor supports typed text, copy/paste from any visible answer, selected quotes with source backlink, drawing/highlights, R2 image attachment, screenshot capture with OS/browser permission, tagged notebook organization, personal to-do and cross-device drafts. Learner controls content, visibility and deletion. Tutor MAY propose a summary but MUST NOT mutate learner-authored memo silently; offer preview/version diff and explicit accept.

Memo is not automatically evidence of mastery, not automatically authoritative course material and not automatically published or shared with teachers. If the learner explicitly authorizes reading a Memo as Tutor context, treat it as learner-authored claim with provenance, not as verified fact.

### 9.5 Learning memory partitions

1. **Raw Session History**: exact user/Tutor turns and media references; source of truth for what was said.
2. **Learning Artifact Index**: inspectable summaries and practice outputs linked to raw sources.
3. **Personal Memo**: learner-authored private notes with their own independent lifecycle.
4. **Learner Competency State**: evidence-derived learning status and review schedule.
5. **Course/Enrollment State**: canonical version, graph, user route and progress.
6. **Project/Personal Memory Links**: governed projections into Spec 233/241 when authorized.

These must remain separate at the domain-model and permission level; indexing a Memo does not make it teacher-visible. The learner can inspect and selectively authorize cross-course reuse. Deletion, correction, expiry and revocation MUST cascade to derived notebook/vector/cache projections with eventual-deletion receipt and auditable status.

### 9.6 Search and recall

Query “ภาพที่เคยใช้เทียบ cinematic กับ anime” -> authorized hybrid retrieval by course, competency, learner, provenance and media metadata -> show artifacts, referenced chat turns, attached image and related memo separately. Retrieval MUST not allow a tenant/course filter to be applied *after* unauthorized vector candidates have been disclosed. Preserve a fallback lexical/relational view if Vectorize is degraded.

### 9.7 Teacher and course creator surfaces

Editor for course outcome/rubric, competency DAG, exercise/visual bank, version diff and source rights; review queue for flagged inaccurate lessons; course analytics in minimum necessary aggregate form. Teacher access to individual learning conversations, images and Memo is **not** implied by enrolling in a course; explicit role/consent policy determines all visibility, with minors' access governed by legal policy.

## 10. Adaptive learning turn lifecycle

### 10.1 Normative per-turn algorithm

```text
A. Receive authorized learner event (text/voice/image/action)
B. Recover immutable session snapshot and current course/enrollment versions
C. Validate tenant/learner identity, grants, content/media policy, rate/budget
D. Determine primary intent: question | answer | upload | correction | topic change | pause
E. Retrieve minimal allowed context (active target + prior answer + approved notes)
F. Scope-check current learner question AND prospective Tutor response/question
G. If learner asks: ANSWER FIRST; if user confused: REPHRASE/DEMO before assessment
H. Select one bounded pedagogical move, media mode and specialist verifier if needed
I. Render safe response / GenUI / voice via existing runtimes
J. Extract only supported new evidence, with modality+hint provenance and consent
K. Validate external verifier receipts, recompute affected competency state
L. Commit turn, evidence and event atomically (outbox for async work)
M. Optionally produce linked Artifact/bookmark/recap; show next action, not a quiz barrage
```

Avoid one expensive orchestrator + multiple LLM subagents for every turn. Deterministic policy and static content handle routine navigation; a mid-cost tutor model handles ordinary dialogue, specialty models/verifiers handle critical reasoning, and background jobs handle visuals/course generalization. Route via existing Spec 231 with task labels `diagnose`, `tutor_dialogue`, `visual_explain`, `assessment`, `course_synthesis`, `artifact_extract`, `course_quality` and policy-set minimum capability floors.

### 10.2 Source of truth and consistency

Canonical learner/evidence/course state lives in PostgreSQL with tenant-scoped ownership. Cloudflare Vectorize is **derived search index only** and cannot become authoritative for grades, permissions or course versions. R2 media carries content-addressed reference/metadata and is policy-scoped. Versioned writes use `(tenant_id, entity_id, expected_version, idempotency_key)` and return `409` on genuine stale conflict. Async worker completion must match current enrollment/course/session version or be quarantined for review; never apply stale model evaluations to a newly edited course.

### 10.3 Degraded behavior

- No course generator: use published curated course or save private draft request without claiming generated content is ready.
- No image generation: use licensed existing visuals / text alternatives and continue lesson.
- No realtime: preserve transcript and switch to text.
- No vector index: Postgres-scoped exact metadata and already saved artifacts; avoid unsafe broad retrieval.
- No verifiable result: mark `evidence_needed`, allow teaching but no mastery promotion.
- No approval or incomplete privacy scope: prohibit outbound action and private asset sharing.

## 11. Subject packs: reuse the engine, specialize correctness

| Subject pack | Unique tools / evidence | Domain guardrails |
|---|---|---|
| Claude/AI Skills/Vibe Coding | sandboxed project tasks, versioned docs, prompt/spec/skill diff, cost receipts, tests/code review | vendor-version freshness; run only in approved isolated environment; tool/Skill install consent; code security |
| English/other languages | listening, speaking, reading, writing, contextual scenarios, optional CEFR-aligned rubrics | ASR uncertainty; neutral dialect/accents; accessible alternatives; no accent-based competence assumptions |
| Mathematics | equation editor, graphs, steps, symbolic verifier (e.g., SymPy), independent worked examples | verify symbolic/math outputs; hints tracked; no sole-LLM final grading |
| Science | visual diagrams, source-backed explanations, safe simulations, measurement/error analysis | distinguish simulation vs physical experiment; hazardous procedures require age/safety constraints and human oversight |
| Creative visual production | before/after image comparison, prompt iterations, shot/style parameter practice | aesthetics are goal-dependent; model/provider/version affects outputs; copyright/likeness rights |

A subject pack SHALL declare supported modalities, rubric/verifier capability, prerequisite graph fragments, factual sources/freshness, allowed external tools, safety class and fallback when a verifier is absent. A general Tutor SHALL NOT grade subject-specific work beyond its available verified competence.

## 12. Domain model and proposed API contracts

The names below are **new logical contracts**, not a statement of deployed endpoints or schema. Before migration, map to actual database conventions, RLS policies, existing event tables and API namespaces.

### 12.1 Proposed relational entities

| Entity | Minimum fields / uniqueness | Purpose |
|---|---|---|
| `tutor_course` | tenant_id, id, owner_id, source_kind, visibility, status; unique tenant+id | private/catalog course shell |
| `tutor_course_version` | tenant_id, course_id, version, immutable_definition_json, checksum, reviewer_id | stable outcome/scope/competency release |
| `tutor_competency` | tenant_id, id, version, behavior, rubric_ref, verifier_ref | atomic reusable competence |
| `tutor_competency_edge` | tenant_id, src_id, dst_id, edge_kind, course_version | prerequisite/related/specialized graph |
| `tutor_enrollment` | tenant_id, id, learner_id, course_version, goal_snapshot, visibility, state_version | personal course instance |
| `tutor_learning_session` | tenant_id, id, enrollment_id, canonical_chat_ref, topic_bookmark, last_committed_turn | session binding to Feature 196 |
| `tutor_evidence` | tenant_id, id, enrollment_id, competency_id, type, source_ref, rubric_version, support_level, verifier_receipt, idempotency_key | append-only proof/claim history |
| `tutor_competency_state` | tenant_id, enrollment_id, competency_id, state, evidence_refs, review_due_at, version | derived current state |
| `tutor_artifact` + `artifact_version` | tenant_id, id, enrollment_id, source_turn_refs[], source_asset_refs[], type, content_hash, review_state | curated learning derivative |
| `tutor_memo` + `memo_version` | tenant_id, id, owner_learner_id, selected_source_refs[], attachment_refs[], private_acl, version | independent learner notes |
| `tutor_course_candidate` | tenant_id, source_course_id, generalized_manifest, license_receipts, review_state, origin_consent_state | promotion proposal without raw data |
| `tutor_turn_decision` | tenant_id, session_id, turn_id, intent, target_competency_ids[], move, scope_relation, policy_version | inspectable decisions and safeguards |

RLS/authorization and deletion semantics are mandatory for every entity and every join. Use existing append-only audit and outbox patterns; a separate Tutor-specific “master” audit ledger is forbidden.

### 12.2 Core JSON contracts

```json
{
  "TutorTurnInput": {
    "session_id": "uuid",
    "course_instance_id": "uuid",
    "expected_session_version": 12,
    "client_turn_id": "uuid",
    "intent_hint": "ask|answer|upload|practice|pause|resume",
    "text": "ต้องสร้าง skill ใหม่ไหม",
    "media_refs": [],
    "preferred_modality": "auto|text|voice|visual",
    "consent_refs": []
  },
  "TutorTurnResult": {
    "turn_id": "uuid",
    "response_blocks": [{"type":"text|image_compare|choice|practice|artifact_link", "payload_ref":"opaque"}],
    "topic_link": "skill.parameters",
    "scope_relation": "IN_ACTIVITY",
    "next_action": "optional_follow_up",
    "bookmarks": [],
    "evidence_receipts": [],
    "session_version": 13,
    "estimated_cost_receipt_ref": "opaque"
  }
}
```

`response_blocks` are declarative host-rendered trusted schemas, NOT runnable code. Backend validates schema version, content length, source ownership and component whitelist. Never send prompts, API keys, private notes or hidden rubrics to untrusted components.

### 12.3 Additive route proposal

| Route (proposal only) | Verb | Behavior |
|---|---|---|
| `/v1/tutor/courses/synthesize` | POST | scoped draft outline + provenance + estimate |
| `/v1/tutor/courses/{course_id}/versions` | POST/GET | version preview, explicit publish/edit governance |
| `/v1/tutor/enrollments` | POST | enroll and bind course/version/goal |
| `/v1/tutor/sessions` | POST | create Feature 196-backed Tutor session |
| `/v1/tutor/sessions/{id}/turns` | POST | idempotent turn/action/media-bound execution |
| `/v1/tutor/enrollments/{id}/progress` | GET | mastery vs completion vs review due |
| `/v1/tutor/artifacts` | GET/POST | source-backed artifact list and user pin |
| `/v1/tutor/memos` | GET/POST/PATCH/DELETE | learner-owned rich memo and revisions |
| `/v1/tutor/media/upload-intent` | POST | auth/consent-scoped upload token via existing media layer |
| `/v1/tutor/courses/{id}/promotion-proposals` | POST | generalized draft, explicit creator/reviewer workflow |

All mutations require authenticated identity, `tenant_id` enforced server side (never trusted from client), role-aware access, idempotency key and expected entity version as appropriate; all reads must enforce resource-level ACL. New endpoint exposure is feature-flagged. SSE/realtime streaming reuses existing channels and approval scopes.

## 13. Course lifecycle, promotion, licensing and marketplace

`PRIVATE_DRAFT -> USER_APPROVED_PRIVATE -> ACTIVE_PRIVATE -> GENERALIZATION_PROPOSAL -> CONTENT_REVIEW -> LICENSE_REVIEW -> SAFETY_REVIEW -> CURATED_REUSABLE -> PUBLISHED_VERSION -> REVISED_VERSION / UNPUBLISHED`.

- **Demand discovery**: aggregate de-identified searches, course-request clusters, enrollment attempts and opt-in feedback. Analytics MUST apply minimum aggregation thresholds and protect rare queries from re-identification. Demand by itself does not imply educational validity.
- **Reuse vs duplicate**: semantic course similarity and matching outcome/competency rubrics detect existing courses; prefer attaching a new case study or specialization where appropriate.
- **Generalization**: create a new generic outline and curated examples from public/authorized materials. An individual's private notes, media, questions, employer/customer information, identifying metadata and conversation excerpts MUST NOT be copied to a generalized manifest by default. “Remove name” alone is not enough.
- **Creator ownership and consent**: original learner retains private course instance ownership unless terms explicitly grant a publishable authored contribution. Obtain a separate explicit creator contribution license for any included learner-authored exercises/media. Do not claim transfer of rights from ordinary enrollment.
- **Publish review**: knowledgeable reviewer validates learning outcomes, graph, assessment rubrics, examples, model/vendor freshness, provenance, content rights, safety class, accessibility, privacy and version migration. Mandatory review policy is configured by course domain.
- **Marketplace**: bind to existing Spec 212 catalogs/creator rules through additive adapter. Publication, pricing, revenue splits and refunds are governed by existing product/ledger owners; Tutor-specific “publish” does not bypass marketplace policy.
- **Release and retire**: immutable release snapshot, manifest checksum, changelog, deprecation/migration map, public issue flag and revocation. Rollback stops new enrollments on a faulty version but retains audit links for prior learners.

### 13.1 Review rejection examples

Reject auto-promotion if there is a personally identifying screenshot, private client invoice, copyrighted commercial image without reuse permission, unverified high-stakes health/legal advice, unsupported scientific claims, untested rubric, a public course with inaccessible images and no alt text, or a near-duplicate lacking genuinely different outcomes. Provide concrete correction tasks instead of silently dropping the proposal.

## 14. Safety, privacy, trust and youth safeguards

### 14.1 Threat model

Threats include prompt injection in learner uploads/third-party web content, malicious published courses/Skills, misleading generated visuals, unauthorized cross-tenant retrieval, permission escalation via teacher roles, leakage of personal Memos into course catalog, model hallucination presented as verified learning, external voice/video retention, abusive long-form assessment, fake evidence receipts, replay/double-credit and stale course-version writes.

### 14.2 Mandatory controls

1. Enforce Spec 220 authorization before retrieval, after course/context resolution and before disclosure/action; deny-by-default for optional media share, teacher visibility, agent tool and cross-course memory projection.
2. Uploaded image/document text is untrusted **content**, never system instruction. Tool execution must use existing capability registry and approval. A generated lesson may propose a Skill, but installation, retrieval, invocation and remote distribution follow Specs 221/248 plus current authorization.
3. Learner-visible evidence explanation and provenance: display what was observed, what remains inferred, which hint or model was used and when evidence becomes stale. An incorrect screenshot interpretation is reversible and should not irreversibly mark failure.
4. Age-appropriate access is a separate product gate: require age policy, parent/guardian consent where applicable, content filters, bounded late-night alerts, restricted outbound links and human escalation policy **before** marketing to minors. Do not claim legal compliance without local legal review.
5. Sensitive professions: for law, accounting, medicine or science, professional course examples are educational and MAY need licensed domain review; do not issue binding legal/medical determinations or unsafe lab instructions as a tutoring shortcut.
6. Keep learner preference data optional and edit-able; no fixed labels about intelligence, disability, psychological traits, or demographic-based proficiency. Do not use unverified facial/voice emotion inference for grading or personalization.
7. A learner can export, delete, correct and selectively revoke notes/artifacts where authorized. Cross-index deletion in Vectorize must be tracked and verified after Postgres authority changes; R2 object lifecycle aligned to retention and legal hold policy.
8. Sandbox all learner code with existing execution isolation, quotas and network/secret restrictions. Untrusted program output cannot mutate courses, graders or learner state except through validated results.
9. Respect “do not retain voice/camera” session preferences. Transcript/recording mode, asset scope and deletion policy must be explicit before a live session starts.
10. Anonymous operational metrics may count general improvement and errors, but raw student prompts/media are not a general training or marketplace data feed.

### 14.3 Human oversight

Teacher/guardian review (when authorized) and learner dispute flow for graded high-impact outcomes. Tutor must surface uncertainty and offer escalation after repeated misunderstanding, potentially misleading AI feedback or unsafe practical instruction. High-stakes grade/certificate release requires domain-specific validation and a separately reviewed product policy; MVP does not certify formal qualifications.

## 15. Reliability, cost, observability and evaluation

### 15.1 Performance targets (INITIAL PROPOSAL — revise after baseline)

- Text turn: first readable response p95 target ≤ 4 s under nominal provider health, excluding optional background image/video generation. Voice target is subject to Spec 237 observed transport/model budgets, not an independent invented SLA.
- Learner interruption: accept and persist the new learner question without losing the active activity bookmark; streamed stale responses must be fenced.
- Resume: preserve last committed course version, artifacts and memo when switching eligible devices or after interrupted provider sessions.
- Cost: track per-turn token in/out, model, visual generation, live duration, verifier and background job costs; define per-course/tenant/user budget and explicit overrun policy via Spec 207.
- Media: show placeholder plus source/rights state for delayed jobs; never block course navigation on nonessential infographic generation.

### 15.2 Evaluation metrics (not vanity counts)

Primary outcome metrics: independent post-practice proficiency, delayed retention and novel transfer success at competency level, with caveats for domain-verifier availability. Supporting metrics: recovered misunderstandings after rephrase, median questions per useful decision, time to first meaningful practice, effective skip precision, false-mastery reversals, learner interruptions answered correctly, off-scope Tutor question rate, artifact recall usefulness, cost per verified competency, image accessibility completion and user-controlled deletion correctness.

Avoid using answer length, chat messages, generated media count, course enrollments or satisfaction as substitutes for learning outcomes. A/B comparisons need matched competence/starting level, stable rubric and appropriate privacy safeguards; distinguish correlation from causal improvement. Published claims about improving learning require prospective evaluation rather than model self-judgment.

### 15.3 Trace/audit payload

`trace_id`, `session_id`, course/competency version refs, policy version, turn decision type, media types (not unnecessary raw media), model/provider logical route, token/cost receipt, retrieval source IDs, verifier status, current evidence state transition, safe UX error code. Store raw content only under resource-specific retention and access policies. Use existing operational audit authority; Tutor analytics consumes redacted events.

## 16. Implementation plan: independent vertical slices and rollout

All phases must begin with **repository reality check**: authoritative Spec number, deployed schema/migrations, Feature 196 and Spec 240/237/241/229/231 maturity, active 224 worktree conflicts, Spec 213 certification state, tenant access tests, existing UI components and flags. A design document alone is not proof of readiness.

### P0 — Foundation and course-chat MVP (bounded launch)

**Slice 0 — Contract and consent gate.** Reserve actual number, define Tutor domain schemas and migration reversibility, audit existing registry/ownership, baseline cost/security; create `tutor_enabled=false` for general users, internal cohort flag and authorized asset storage. Ship full tenant/ACL/idempotency test scaffolding.

**Slice 1 — Curated course vertical.** Manually author ONE course: `Claude Vibe Coding: From Repeated Image Prompting to Reusable Skills`. Build 12–20 atomic nodes as an INITIAL CONTENT TARGET, 3–5 practical checkpoints, 2 distinct application paths and clearly bounded in/out scope. Display conventional Course Map, outcomes and learner-owned session. Reuse existing Feature 196 Chat; no new Agent framework.

**Slice 2 — Bidirectional teaching loop.** Implement answer-first interruptions, confusion recovery, question intent/scope metadata, one-question policy, resumption bookmark, short multiple-choice scaffolds and deterministic evidence receipt. A brief learner-originated inquiry must be permitted without creating a separate course.

**Slice 3 — Notebook MVP.** Pin Q&A and images, append reviewed learning recap, link raw chat source, offer learner-owned text/image Memo with explicit permissions. Show separate types in UI and permit instant jump to source. Implement scoped search in canonical Postgres metadata before optimizing Vectorize.

**P0 exit:** at least three distinct personas can reach practical outcomes through different paths; demonstrate no automatic mastery from prompted choices, no cross-learner leakage, easy resume and success when external visual generation is disabled. Internal pilot only until operational/admission gates are satisfied.

### P1 — On-demand course and multimodal teaching

**Slice 4 — Course Foundry.** Natural-language course synthesis, reuse-first matching, editable preview, competency graph, versioned enrollment, short vs extended courses, content provenance and rubric review; private by default. Do not auto-publish.

**Slice 5 — Visual pedagogy.** Safe GenUI image compare, uploads, screenshot preview, region annotations, infographics from reviewed facts, practice Canvas and linkable media evidence. Add verification and attribution where content is factual. Test accessibility and unreliable vision.

**Slice 6 — Live multimodal.** Integrate only when Spec 237 transport/approval is certified; move from text to voice without losing context, with transcript correction and media-consent controls. Text-only P1 remains independently releaseable.

**Slice 7 — Review & retention.** Independent transfer challenge, stale evidence expiry/review, learner correction/dispute, optional reminder via existing Spec 238/notification stack. No fabricated percentages.

### P2 — Education platform and marketplace

**Slice 8 — Subject packs.** Mathematics with symbolic checker; English with separate speaking rubric and ASR uncertainty; science with verified safe simulations. Each pack ships a validator and fixtures; none gets automatic high-stakes grading rights.

**Slice 9 — Teacher Studio / course promotion.** Author/review rubrics, review uploaded media rights, generalized public course pipeline, duplicate detection, marketplace adapter and immutable publish manifest. Support opt-in white-label only after authorization/billing owner sign-off.

**Slice 10 — Optimization.** Improve route/cache selection, specialist evaluation, validated proactive probes and adaptive media choice using measured learning and budget outcomes. Never use private conversation content for generalized course creation absent separate permission.

### 16.1 Deployment dependency and reversibility

- Phase flags: `tutor.core`, `tutor.course_synthesis`, `tutor.visual`, `tutor.realtime`, `tutor.course_promotion`, `tutor.subject_math`, `tutor.subject_science`, `tutor.teacher_portal`; all OFF by default.
- Each phase must be deployable without modifying implemented Specs 1–213 or rewriting in-progress 224, and must have safe downgrade behavior for older Chat clients. Existing Chat continues if Tutor flags are off.
- Database migrations are additive, reversible when no protected user data would be lost, guarded by backfill/cutover checks and observable in existing migration system.
- Spec 240/237/241 etc are design candidates until actual integration validation. A phase depending on an uncertified feature can ship its lower-tech fallback independently, but MUST NOT claim that feature is production-ready.
- Internal pilot -> closed opt-in beta -> staged tenant release -> verified GA; require admission gates appropriate to risk and operational dependency status.

## 17. Acceptance criteria: executable behavior contract

| ID | Scenario | Required observable result |
|---|---|---|
| AC-001 | User selects reviewed curated course | sees explicit outcomes, applications, scope, module map and at least one practical task |
| AC-002 | User says “อยากเรียนสร้างภาพให้นางแบบดูโดดเด่น” | private editable micro-course draft with bounded outcomes, suggested visual examples and first diagnostic |
| AC-003 | Learner previously built ten apps but has not learned Skill schema | may skip supported app-building basics without being marked competent in Skill I/O or UI schema |
| AC-004 | Learner says “ไม่เข้าใจคำถาม” | Tutor rephrases contextualized original intent, creates no automatic failure evidence |
| AC-005 | Learner still confused after rephrase | Tutor changes to visual/example/choice then demonstrates, without repeating a barrage of questions |
| AC-006 | Learner chooses correctly from prompted multiple-choice | records guided response, does not certify independent mastery without applicable independent evidence |
| AC-007 | Learner interrupts to ask about `compact` | Tutor answers within verified provider/version limits, classifies course relation, offers bookmark/resume |
| AC-008 | Learner asks about multiple agent names | Tutor avoids asserting screenshot-specific identity without evidence, links to Subagents concept conditionally |
| AC-009 | Tutor's next proposed question is irrelevant to competency | question rejected/reformulated or opt-in detour explicitly offered |
| AC-010 | Learner attaches two generated portraits | original files remain separate with source/consent/provenance; Tutor can compare or ask visual question |
| AC-011 | Visual model misreads an uploaded screenshot | learner can correct interpretation; incorrect evidence is reverted/recomputed with audit trail |
| AC-012 | Learner asks for voice then returns to text | preserves course/version/bookmark, transcript correction and consent boundaries |
| AC-013 | Learner pins a Q&A and copies an image to Memo | separate artifact and memo objects exist, with source backlinks and independent edit/visibility controls |
| AC-014 | Learner asks “ภาพ cinematic ที่เคยเทียบอยู่ไหน” | finds authorized original question, recap and linked images; no cross-user results |
| AC-015 | Learner has prior verified knowledge | optional skip has visible evidence reason; course remains revisitable and transfer/review may still be required |
| AC-016 | Existing course has same target outcome | course synthesizer offers reuse/specialization rather than immediately creating duplicate public listing |
| AC-017 | Private course proposed for public catalog | approval, rights, privacy/safety/content checks and generalized content review are mandatory |
| AC-018 | A private Memo includes client's invoice | raw Memo/media never appears in public course, another learner's Tutor or unconsented teacher view |
| AC-019 | Vectorize offline | authorized relational catalog and previously saved artifacts still accessible; no authorization fail-open |
| AC-020 | Media model fails after image job queued | learning session continues in text, job reports recoverable failure, no phantom mastery/cost receipt |
| AC-021 | Stale async assessment returns after course edited | stale result quarantined; no incorrect state mutation; correct retry follows versioned policy |
| AC-022 | Learner disputes wrong competency inference | UI presents evidence, allows correction, retains provenance and recalculates non-forged derived state |
| AC-023 | Learner shares image while live voice is active | consent checked before capture/view; transcript uncertainty is not scored as incompetence |
| AC-024 | Learner asks Tutor to leave course | user can pause, bookmark, opt into general Chat and resume original learning context |
| AC-025 | Parent/child mode not certified | feature remains unavailable for underage accounts; no false youth-safety claim |
| AC-026 | Attempted cross-tenant access to course/media/evidence | denied before retrieval or disclosure; existing audit records denial without leaking object metadata |
| AC-027 | Existing Feature 196 / jobs / billing unhealthy | Tutor shows fallback or admission block; it never creates a parallel ungoverned authority |
| AC-028 | Learner deletes a Memo with linked vector entry | authoritative deletion/revocation and derived index cleanup verified within declared retention policy |
| AC-029 | New vendor doc invalidates part of a published course | version marked for review, affected lessons show freshness warning, older cohort source refs remain traceable |
| AC-030 | Replayed/resubmitted learner turn | same idempotency key returns original receipt, no double charge, duplicate evidence or duplicate artifact |

## 18. Testing and release gate matrix

### 18.1 Unit, contract and integration tests

- **Course graph**: DAG validation, typed relation checks, alias/translation stability, goal-to-outcome mapping, version immutability and private/public separation.
- **Dialogue simulation**: confusion/rephrase with unchanged pedagogical target; “answer first”; interruption; optional side quest; user refusal; frustration guard; no repetitive questions; fallbacks without provider-specific magic strings.
- **Evidence**: self-report vs independent proof; hint-effect correction; contradictory proof; transfer task; stale rubric/version; human reviewer override where permitted; idempotency and replay.
- **Visual**: EXIF strip, media role confirmation, rights metadata, untrusted screenshot injection rejection, faulty annotation rollback, accessibility alternatives and content moderation.
- **Notebook**: auto-generated artifact vs authored Memo mutation boundary, source backlinks after message archival, consent-aware retrieval and deletion propagation.
- **Cross-spec**: Spec 220 authorization contract, 229 filtered retrieval, 231 routing/207 budget receipt, 237 fallback, 240 schema whitelist, 241/233 memory sharing, Spec 212 additive publication, worker_jobs fencing and outbox.
- **Security**: malicious course instructions disguised as teacher policy, MCP Skill embedded in learner course, foreign tenant document, private R2 URL reuse, prompt injection in OCR/screenshots and privilege escalation from an unauthorized instructor account.

### 18.2 Evaluation fixture set (minimum release candidate)

`F-01 Beginner visual creator`, `F-02 Advanced app creator unfamiliar with Skill schemas`, `F-03 Skilled Skill creator unfamiliar with Subagents`, `F-04 Confusing technical question in Thai`, `F-05 Voice transcript error`, `F-06 Learner interrupts with Compact question`, `F-07 Unrelated topic bait`, `F-08 Copyrighted image upload`, `F-09 Private client invoice in Memo`, `F-10 Model outage mid-media render`, `F-11 Reused course request`, `F-12 Stale assessment after course version bump`, `F-13 Math wrong answer with plausible verbal explanation`, `F-14 Inaccurate model-generated scientific infographic`, `F-15 Kid sign-up without required guardian flow`, `F-16 User requests deletion after course-derived embedding was created`.

For each fixture record initial state, learner events, expected pedagogical move, permitted media, source constraints, evidence decision, resulting state, audit events and expected error path. Use human educator review and real opt-in pilot results for pedagogical effectiveness; synthetic fixture success alone does not establish learning benefit.

### 18.3 Exit gates

**G0 architecture:** canonical spec number reconciled; existing owner contracts and deployed migrations audited; security threat model and consent matrix approved; no edits to historical specs; feature flags OFF.

**G1 P0:** AC-001,003–009,013–015,019,021–022,024,026–027,030 pass against relevant available dependencies; independent verifier confirms no cross-tenant/ungoverned authority paths and evidence provenance. No claim of certified skills or voice at P0.

**G2 P1:** AC-002,010–012,016,020,023,028–029 plus full visual and voice integration *where feature flags enabled*. If Spec 237 is uncertified, voice remains OFF and does not block text+visual beta when policy permits.

**G3 publication:** AC-017–018 plus privacy, copyright, educator review, immutable release and market owner approvals. A private course feature may ship without public publishing.

**G4 GA:** staged tenant rollout with rollback, durable job reconciliation, cost telemetry, consent/deletion drills, factual/visual quality eval and measured post-practice learning outcomes in the pilot cohort. Define quantitative thresholds based on pilot and domain risk, not unsupported invented guarantees.

## 19. First reference course: Claude Vibe Coding through visual production

**Course title:** “Claude Vibe Coding — จาก Prompt สั้นสู่ Skill ที่ใช้ซ้ำและแอปที่ตรวจสอบได้”

**Promise:** Starting from no coding assumptions, learner progressively creates a prompt-generation Skill for multi-style images; builds a simple user interface from explicit input/output contracts in SmartAIHub's own approved extension format; learns when to use a reusable prompt, a Skill, a Workflow and an Agent; evaluates cost, context, tests, review and eventual production quality. This is one adaptable course rather than many disconnected introductory YouTube-style tutorials.

**Core outcomes:**

- Compare the quality of a short prompt, structured prompt and a written specification against the *same objective* using an observable rubric and recorded costs.
- Extract stable constraints (e.g. target subject) and variable parameters (`style`, `wardrobe`, `location`, `ratio`) from a real user workflow.
- Explain when one multi-style Skill is appropriate and when different workflows/quality gates justify multiple Skills.
- Distinguish Claude/provider-native Skill conventions from SmartAIHub's optional extension files such as `input.schema.json`, `ui.schema.json`, `output.schema.json`; do not misrepresent platform-specific extensions as universal native requirements.
- Diagnose why `compact` may appear, recognize uncertain UI-version-specific agent labels, and explain the benefit and risk of task delegation at a conceptual level.
- Design a tested Skill/workflow, articulate acceptance criteria, run controlled comparisons, review generated code/images and fix regressions.
- Extend an illustrative project for distinct end-use goals: product ads, affiliate visuals, fashion creative, accounting document UI, or sales proposal UI without changing the shared learning outcomes.

**Illustrative module order (adaptive, not strict):**

1. Practical goal and baseline artifact: current image prompt and output.
2. Short prompt vs structured prompt: controlled before/after.
3. Prompt template and variable fields: repeatable work without unnecessary retyping.
4. Skill fundamentals: boundaries, discovery, selection and trade-offs.
5. Multi-style Skill: `photorealistic / cinematic / advertising / anime`, parameter schema and output conventions.
6. Testing & visual QA: evidence under model/provider/cost variation.
7. Specification & planning: acceptance criteria, task decomposition and change control.
8. UI/UX: accessible input form, safe dynamic UI, useful output display and visual comparison.
9. Context / Compact / Subagents: what is observed vs what the actual provider implementation guarantees.
10. TDD / review / debugging / deployment: production considerations and approved execution environments.

**Sample decision path:** learner says “Skill คืออะไร?” -> answer with their own prompt workflow -> show simple reusable template vs Skill example -> ask which fields should change (not a definition quiz) -> if learner supplies fields, offer a guided implementation -> if confused, show visually highlighted invariant vs variant prompt segments -> validate with two scenarios -> award only the appropriate evidence status.

**Sample visual task:** learner uploads two images and a prompt; chooses the intended goal (“fashion editorial”, “cinematic scene”, or “social product ad”). Tutor labels subjective composition choices as hypotheses, identifies visible differences, asks learner to suggest a modification and tests a new controlled prompt. Never declare an aesthetic comparison universally superior.

## 20. Cross-spec impact backlog (not retroactive edits)

| Existing owner | Additive work item | Boundary / release condition |
|---|---|---|
| Feature 196 / Spec 226 | Tutor session profile and turn interruption/bookmark adapter | reuse session context and approvals; no replacement Chat runtime |
| Spec 209/215 | optional Tutor activity/practice nodes and outcome receipts | no change to already implemented workflow semantics without versioned additive contract |
| Spec 212 | Tutor course catalog/Marketplace entry adapter | add new feature spec and API, do not rewrite implemented Spec 212 |
| Spec 220 | role-based course and Memo sharing policies; minor-specific gate | fail closed on unset learner/teacher/guardian grants |
| Spec 221/248/199 | approved Skill demo/discovery in AI Skills Tutor | no installation/remote execution from an instructional example by default |
| Spec 225/226 | responsive Learning Workspace, resume and notification preference | no duplicate mobile sync or Notification Gateway |
| Spec 229 | index schemas and ACL-filtered course/artifact retrieval | Vectorize remains derived; Postgres remains canonical |
| Spec 231 | pedagogical task labels and route budget/quality floors | do not duplicate model routing or claim Spec 231 number collision resolved |
| Spec 233/241 | learner memory namespace and explicit links to existing project/personal memory | no silent memo-to-shared-memory promotion |
| Spec 237 | voice teaching turn taking, corrected transcript, capture consent | dependent live transport/approval must pass own certification |
| Spec 238 | opt-in spaced review trigger/profile | existing alert/notification scheduling only |
| Spec 240 | declarative Tutor UI blocks, image comparisons and notebook cards | host-vetted actions only, no arbitrary LLM HTML/JS |
| Spec 242/243 | approved managed practice environment *if implemented* | optional; no cloud sandbox required for conversational P0 |
| Spec 244 | optional course source research, freshness and controlled exploration | review required before publishing volatile vendor facts |
| Spec 246 | optional science specialization | no dependency for first-course MVP |
| Spec 224 | optional later software practice evidence bridge | in-progress spec untouched; no dependency for Tutor initial release |

## 21. Decision log, deferred choices and design rules

**Agreed for this design:**

- One Adaptive Learning Runtime with domain-specific subject packs.
- Conventional visible course structure coexists with dynamic, individual non-linear traversal.
- Both curated courses and learner-created bounded on-demand courses, including micro-courses.
- Learner-initiated questions are first-class; answer before opportunistic evaluation; a question alone never proves mastery.
- Tutor questions must be learning-goal relevant; scope includes active topic, overall course and learner's application goal.
- Image, infographic, annotation and uploaded screenshot are teaching, questioning and evidence media; accessibility alternatives required.
- Artifacts, user-authored Memo, conversation, competency state and course progress have distinct provenance/permissions.
- Safe course promotion is opt-in/reviewed, not automatic cross-user data sharing.
- Deployed authorities from SmartAIHub are reused; history and in-flight specs remain untouched.

**Still research/validate empirically (do not block bounded MVP):**

- Best selection algorithm for next pedagogical move and question budget by subject; begin with explicit auditable policy + small eval corpus, not a black-box adaptive score.
- Calibration and comparative value of learner-question evidence vs direct task evidence for each competency type.
- Practical session and media budgets for cloud/local models, and acceptable live-voice latency by device/network.
- Teacher and learner preference for course map versus conversational mode; iterate on real usability tests and accessibility audits.
- Whether/when institutional LMS interoperability, formal certificates or grade export is justified; do not announce interoperability until conformance tested.
- Legally appropriate youth launch jurisdictions, consent details and sensitive domain curricula; separate release programs.
- Mapping logical services and proposed routes onto real SmartSpecPro code and deployment; no assumption any dependent candidate spec is completed.

## 22. Definition of Done

The Spec 249 vertical slice is complete only when a learner can select or create an appropriate **private** course, see exactly what successful learning means, enter an authorized multimodal-capable Tutor session (text minimum), ask and interrupt naturally, obtain a rephrased/visualized explanation when confused, demonstrate a capability through a real task, understand why a topic was marked learned or still uncertain, revisit linked questions/images via Learning Artifacts, maintain private user-authored notes, resume on supported devices and leave with an accurate Course Map. All reads/writes must be tenant-scoped, versioned, auditable and billed through existing authorities. Publication, realtime voice, advanced science and institution-grade certification remain separately gated enhancements.

**Implementation evidence required at handoff:** canonical registry proof; dependency/feature gate matrix; schema migration/rollback evidence; API and UI contract fixtures; all applicable AC results; independent security/access review; consent/deletion smoke test; pilot educator usability report; cost trace; known limitations and recovery path. Mark `READY_FOR_IMPLEMENTATION` only after contract reconciliation; mark `PRODUCTION_READY` only after executed tests and release approvals, never because the specification itself is comprehensive.

---

## 23. R1.1 normative amendment — ten-pass gap audit (2026-09-25)

**Status:** Ten distinct DOCUMENT/DESIGN review passes of the v1.0 source above, with gaps corrected here. This is not ten independent code verifications, repository conformance, an effectiveness trial, or certification. The rules below supersede any less restrictive or ambiguous v1.0 statement for the same concern. Existing authority and immutable-implementation boundaries in §3 remain unchanged. These additions are implementation requirements, not claims that their APIs/tables already exist.

### Pass 01 — Course graph integrity, generated-course containment, and outcome traceability

**Gap:** v1.0 permits generated micro-courses and editable competency graphs, but did not explicitly define cycle rejection, orphan outcomes, validation of scope changes or bounded course expansion. A plausible-looking generated course could omit an outcome's verifier, strand a required competency, or indefinitely expand via detours.

**R1.1 correction (NORMATIVE):**

1. Course synthesis SHALL emit a machine-validatable `CourseDraftManifest` with immutable `draft_id`, `source_intent_ref`, `scope_in`, `scope_out`, `learning_outcomes[]`, `competency_nodes[]`, `prerequisite_edges[]`, `outcome_competency_links[]`, `evaluation_rubric_refs[]`, `mandatory_vs_optional`, `estimated_activity_count`, `created_by`, `model_run_receipt` and `schema_version`. A private draft can be edited or discarded; publication requires a reviewed immutable version.
2. Validation SHALL reject duplicate node identities, broken references, forbidden/self cycles in prerequisite edges, required outcomes without mapped competencies and verifiable assessment, unbounded auto-generated prerequisites, and a course whose intended audience is incompatible with its media/safety requirements. `related` and `advanced_optional` edges MAY be cyclic; `prerequisite` edges MUST form a DAG per released version. Detect cycles before enrollment or generating progress.
3. The adaptive path MAY change module ordering but MUST retain every mandatory outcome unless the learner deliberately selects a **new scoped course version**. Neither a detour nor a failed synthesis attempt silently changes the contracted learning outcomes. Show the learner the consequence of narrowing/expanding scope and retain enrollment on its prior version until explicit migration.
4. On-demand generation SHALL stop at an approved depth/size/budget bound and offer subdivision into a course plus separately named extensions. The learner MAY begin from a single small question without forced lengthy onboarding; use progressive disclosure to add modules only when necessary.
5. Every practice activity and diagnostic question SHALL map to at least one versioned competency/outcome; optional enrichment is explicitly marked and may never be counted toward mandatory completion without rubric equivalence review.

**Tests G01:** Graph property tests for 1–N nodes; reject cyclic/self/dangling prerequisite links; reject orphan outcomes and unbounded recursive expansion; verify detour does not mutate scope; verify a one-topic 10–20-minute micro-course is accepted if it has a measurable outcome and practice.

### Pass 02 — Learner-state provenance, calibrated mastery, and anti-gaming

**Gap:** Existing evidence types were strong but did not fully bind prompt/hint exposure, artifact authorship, verifier trust, repeat attempts, model/rubric changes and domain calibration to the same promotion decision.

**R1.1 correction (NORMATIVE):**

1. A learner evidence event SHALL record `assistance_level`, `hint_ids[]`, `answer_exposure`, `learner_authorship_provenance` (`self_reported|observed|verified|unknown`), `assessment_item_version`, `rubric_version`, `verifier_version`, `model_provider_version_if_used`, `evaluation_trace_ref` and `attempt_group_id`. Preserve the event's source, consent scope and correction history. A learner-uploaded artifact is not automatically learner-authored proof.
2. Mastery policy SHALL be **competency-specific** and configurable by reviewed rubric; for procedural skills, at least one independently observed or independently verifiable application plus a sufficiently distinct transfer probe is required for verified mastery unless a reviewer-approved equivalent exists. A question alone indicates interest/uncertainty, not verified ability. Correct guided multiple-choice answers SHALL NOT alone award `verified`.
3. A repeated same-item attempt after revealing the answer is remediation evidence, not an independent assessment; generated variants MUST be checked for semantic near-duplicates and leaked answer content before being counted independently. Support legitimate accessibility assistance without automatically treating assistive technology as a hint.
4. Subjective tasks (image quality, aesthetics, composition) SHALL separate `technical_constraints_met` from `rubric_scored_quality`, `learner_preference` and `reviewer_disagreement`. Never grade a subjective style choice as objectively incorrect simply because the Tutor prefers a different image.
5. When a verifier, course rubric, model or assessment item changes materially, old evidence remains immutable but competency projections SHALL be marked `revalidation_required` where the new rubric cannot be mapped defensibly; show a learner-visible explanation rather than silently changing past results.
6. Before high-stakes assertions of mastery, evaluate calibration across language, experience bands and allowed accessibility modalities; report false-pass, false-fail and abstention rates. Never infer protected characteristics from media; use voluntary, privacy-reviewed study cohorts only when lawful and necessary.

**Tests G02:** Simulated copied artifact fails verified authorship; identical retry after shown solution fails independent-credit; verified transfer passes with correct provenance; aesthetic disagreement does not trigger hard-fail; changed rubric causes explainable revalidation; missing verifier fails closed, not a fabricated mastery percentage.

### Pass 03 — Bidirectional dialogue, pedagogical equivalence and drift control

**Gap:** The tutor may preserve an intent label while changing a question so much that it measures a different skill; the previous guard lacked a concrete equivalence contract and cumulative detour budget.

**R1.1 correction (NORMATIVE):**

1. Each diagnostic `QuestionIntent` SHALL bind `target_competency_id+version`, observable construct, allowed and disallowed supports, required answer evidence and `equivalence_group_id`. Rephrased text, image or multiple-choice variants MUST be checked against the same construct. If changing form changes what is measured, start a **new** evidence item and preserve both; do not quietly substitute it.
2. `REPHRASE_PLAIN`, `EXAMPLE`, `CHOICE_SCAFFOLD`, `VISUAL_DEMO`, `TEACH_THEN_PRACTICE` SHALL be a finite recovery ladder (configurable per course). The Tutor MUST answer learner interruptions first when safe, ask permission before resuming intrusive testing and always provide `stop_questions`, `explain`, `show_example`, `switch_modality` and `resume_later` choices.
3. Scope Guard SHALL classify **Tutor-proposed questions and generated explanations**, not just learner messages, against active outcome, course graph and opt-in detour. A cumulative detour counter and explicit checkpoint SHALL prevent visually interesting examples from silently replacing the course: e.g., a Skill-design lesson does not become a long photography lesson without consent.
4. A learner-led side quest remains an ordinary question until the learner explicitly opts into turning it into a course objective. Neither clickstream inference nor an LLM's guess may amend contracted course outcomes.
5. When the learner challenges an explanation, the Tutor SHALL be able to acknowledge uncertainty, retrieve a verified source or run a subject verifier, correct the prior artifact with a linked revision and avoid entrenching the wrong answer as memory.

**Tests G03:** Confused learner receives shorter real-work question rather than failing grade; two failed rephrasings trigger example/practice; multiple choice records support; learner interruption is answered before resumption; Tutor's off-topic photography interrogation rejected; contradiction triggers correction-linked artifact revision.

### Pass 04 — Multimodal authenticity, generated-visual fidelity, and accessible alternatives

**Gap:** v1.0 had upload privacy and modality selection but lacked a guaranteed original-to-annotation chain, representation-level evaluation equivalence and generated image/chart accuracy checks.

**R1.1 correction (NORMATIVE):**

1. Each image/screenshot/video excerpt SHALL retain immutable original `asset_ref+hash`, transform lineage, uploader/producer, upload consent, origin course/session and item-level ACL. An annotation is a new derived object with region coordinates in the original's coordinate system; preserve source resolution, rotation and crop transforms. No silent overwrite of learner originals.
2. Generated diagrams, infographics and simulated scientific visuals SHALL pass domain-appropriate factual/label checks before being shown as authoritative; unverified AI-generated media is labeled as illustration. Science simulation MUST display model assumptions, approximations and units. Do not use aesthetically plausible generated images as sole evidence of a physical mechanism.
3. Any visual-only assessment SHALL have an accessible path testing the **same construct** when feasible (alt text, keyboard controls, textual descriptions or alternative demonstration); if equivalence is impossible, disclose the limitation and offer human review rather than grading disability/access constraints as incompetence. Voice MUST provide captions/transcript alternatives and controllable pace.
4. Learner may answer with annotated image or screenshot without typing; distinguish selecting an example, editing AI output and independently producing original work. Screenshots showing third-party data MUST be redacted or explicitly permission-scoped before reuse or sharing.
5. Media analysis should prefer existing files/transform metadata where available, and SHALL display uncertainty where a poor-quality image or OCR/ASR error makes interpretation unreliable; ask for a better capture or text confirmation rather than fabricate details.

**Tests G04:** Rotate/crop and annotate without incorrect region drift; deleted original revokes derived embeddings/annotation on policy schedule; wrong diagram label gets flagged; screen reader/keyboard can complete equivalent exercise; voice transcript correction changes evidence before scoring.

### Pass 05 — Durable turns, voice reconnect, concurrency, and replay fencing

**Gap:** A session-version field and idempotency key alone do not specify partial-stream semantics, cancel/interrupt races, media upload ordering or protection against stale evaluator jobs awarding duplicate credit.

**R1.1 correction (NORMATIVE):**

1. Add Tutor-specific **logical** turn states `RECEIVED -> AUTHORIZED -> INPUT_READY -> RESPONDING -> RESPONSE_COMMITTED -> EVIDENCE_PENDING -> EVIDENCE_COMMITTED` and terminal `CANCELLED|FAILED|SUPERSEDED`. Map durable execution to existing Feature 196, worker_jobs, outbox and lease/fencing authorities; do not create a second job-control plane.
2. A `turn_id`, client idempotency key, `session_generation`, expected session version, content hash and parent `activity_id` SHALL accompany each mutation and async evaluator. Stale generation or mismatched content MUST fail closed. Partial streaming output is **not** a committed answer or mastery evidence.
3. For a live voice reconnect, resume from the last committed event sequence; show unresolved transcript as pending and never grade an interrupted utterance without an explicitly finalized transcript/learner correction window. A late tool/evaluator result after pause, delete, revoke or superseding answer MUST NOT write learner state.
4. `pause`, `cancel`, `delete` and media-consent revocation SHALL fence subsequent tool/media work, including delayed R2 and Vectorize projections; retries SHALL not repeat paid media generation without existing ledger/idempotency reconciliation. Explicitly expose `partial_response` with a retry/resume action if streaming fails.
5. Concurrent browser/mobile edits to notebook or course goals SHALL use optimistic version/CAS and deterministic conflict UI; do not resolve conflicts by last-writer-wins when doing so could erase learner notes or widen permissions.

**Tests G05:** Voice websocket drop at each state; duplicated turn submits; race of learner interrupt vs grader completion; media-consent revoked while job queued; mobile offline note collides with desktop edit; retries produce one learner-evidence receipt and no duplicated paid generation.

### Pass 06 — Memory lifecycle, retention, deletion, and cross-scope projections

**Gap:** Five learning-memory partitions were established but data propagation and revocation across source chat, personal notes, course artifacts, inferred knowledge states, embeddings and exported/signed media URLs needed an explicit dependency ledger.

**R1.1 correction (NORMATIVE):**

1. Every Tutor derivative SHALL carry `source_refs[]`, `source_acl_snapshot_ref`, `source_consent_refs[]`, `retention_policy_id`, `derived_index_refs[]`, `lineage_version` and a `visibility` no broader than authorized sources. Resolve live ACL at retrieval and at disclosure; snapshots alone never grant access. Private learner notes SHALL be excluded from training, cross-user reuse and course-demand mining by default.
2. Implement a deletion/revocation dependency traversal: source chat/media -> learner artifacts/memos (as applicable) -> competency projections -> Vectorize embeddings -> cache -> signed/share links -> pending evaluator jobs. Track states `REQUESTED|FENCED|PROPAGATING|VERIFIED|EXCEPTION_REVIEW` with receipts and bounded retry using existing jobs. A legal hold may constrain physical erasure but MUST prevent ordinary disclosure immediately where policy allows.
3. Distinguish learner-owned Memo from AI-generated Artifact and canonical Project Memory. A pinned Tutor summary is not permission to persist it in Team/Tenant Memory. Cross-course evidence reuse requires explicit purpose-compatible authorization; a new course enrollment does not automatically import private notes.
4. Export SHALL include provenance, learner-created notes, human corrections and assessment explanations in a usable format, with redaction for third-party copyrighted/confidential data where necessary. Signed image URLs require short lifetime and per-open authorization for sensitive learner assets.
5. A learner changing a source answer or disputing an image interpretation causes derivative re-evaluation with source-accurate labels, not historical evidence deletion disguised as correction.

**Tests G06:** Source revoke during queued summarization; delete a screenshot referred to by three artifacts and one Vectorize record; prohibited team-share does not leak a personal memo; signed link expiry; concurrent retrieval after ACL downgrade fails; deletion exception stays visible until reconciled.

### Pass 07 — Course promotion, privacy-preserving demand signals, and supply-chain freshness

**Gap:** v1.0 described review and aggregation but not explicit promotion consent separation, poisoning/near-duplicate resistance or how changing third-party AI tools invalidate a course's instructions and screenshots.

**R1.1 correction (NORMATIVE):**

1. Generalize a private course by **regenerating from a clean approved topic/outcome manifest**, never by merely stripping names from private chat, notes, screenshots, learner code or R2 assets. Raw learner context must not enter marketplace reviewer tools by default; a separately authorized contribution is explicitly attached and licensed with provenance.
2. Demand aggregation SHALL exclude private memo contents and media, apply minimum cohort and rarity safeguards configured with privacy review, and suppress identifying combinations. No auto-publication based on enrollment count or model-generated quality scores alone. Require approved course creator/reviewer identity, conflict-of-interest policy, domain-specific validation, rights evidence and a rollback owner.
3. Published course SHALL pin dependency/version manifests for vendor/model/tool instructions, external Skills, linked sources and media licenses. A freshness monitor MAY flag `OUTDATED_REVIEW_REQUIRED` on an upstream breaking change; no automatic rewrite of a published course or unseen replacement of a learner's active version. Critical security/incorrect instruction findings can unpublish new enrollment and alert existing students.
4. Near-duplicate clustering compares measurable outcomes, competency/rubric overlap and permissible example variation; provide merge, specialization and independent-course decisions with reviewer audit. Do not merge distinct protected or culturally specialized teaching needs on semantic similarity alone.
5. Imported course templates, repositories, screenshots and Skills are untrusted. Apply existing Spec 220 policy, Spec 221 review and Spec 248 MCP distribution gates before exposure or execution; teaching a Skill is not approval to install or run it.

**Tests G07:** Privacy-canary phrase placed in private memo never appears in promotion output, search index or demand summary; malicious course prompt injection fails tool boundary; vendor-version drift creates reviewer alert; duplicate and genuinely distinct micro-courses routed appropriately; unpublish revokes new enrollment but retains valid prior learning evidence.

### Pass 08 — Pedagogical adaptation experiments and measurable outcome validity

**Gap:** Completion and engagement can rise while independent learning falls. v1.0 needed a falsifiable way to evaluate adaptive dialogue, visuals, user-initiated inquiry and question rewrites without overclaiming causality.

**R1.1 correction (NORMATIVE):**

1. Define a pre-registered Tutor evaluation plan for the initial Claude course: baseline task, unassisted post-task, novel transfer task, delayed retention (where participation allows), rubric-blinded review where feasible, independent-verifier receipts, session abandonment, question-confusion recovery, user-initiated-question usefulness and total cost per verified competency. Do not claim generalized improvements from completion rate, subjective enjoyment or Tutor LLM grades.
2. Compare at least a conventional structured-course experience with adaptive dialogue while keeping target outcomes and approved assessment rubrics constant; optional ablations test visual examples and question reformulation separately. Do not randomly withhold critical accessibility support or needed safeguarding from a control group.
3. Record outcome validity threats: answer leakage, repeated question exposure, cross-user contamination, developer/tester familiarity, device/modal mismatch, teacher assistance and differential dropout. Separate self-reported satisfaction from actual transfer evidence.
4. Grade externally verifiable tasks (e.g., Skill parameter schemas, generated UI contracts, passing tests) with deterministic tools when possible; use multiple reviewer judgments or adjudication for subjective image outcomes. LLM graders must be calibrated and may abstain; their output alone does not gate a high-impact education claim.
5. Release gates SHALL publish both gains and regressions by exercise and supported modalities; set a stop/rollback rule before launch for material independent-learning regression, unexplained false mastery, privacy leakage or materially higher burden on novice learners.

**Tests G08:** Assessment leaks deliberately planted in practice context are detected; evaluator refuses to infer causal gain from unpaired completion counts; grader uncertainty generates human-review path; voice/text cohorts get comparable construct coverage; opt-out learners remain usable without analytics consent.

### Pass 09 — UX, accessibility, learner autonomy, and failure-path completeness

**Gap:** Desktop/mobile layout was described, but action-specific behavior for autosave, course-map progress transparency, offline edits, overwhelmed novices, and accessibility needed explicit acceptance requirements.

**R1.1 correction (NORMATIVE):**

1. Learning Workspace SHALL provide persistent access to four concerns on mobile, tablet and desktop: Tutor dialogue, Course Map, Artifact Timeline and Personal Memo. On narrow screens these MAY be tabs/sheets rather than simultaneous columns. Preserve the current question/media and scroll anchor when switching surfaces or modalities.
2. The Course Map SHALL distinguish `not_assessed`, `in_progress`, `evidence_needed`, `verified`, `skipped_verified`, `review_due`, `blocked_dependency` and `optional`. Each shown `verified/skipped` outcome has a learner-readable evidence explanation and an appeal/correction control. Do not represent a guess as a precise percentage.
3. Artifact Timeline SHALL offer `pin_turn`, `save_question_answer`, `save_original_media`, `annotate`, `compare_versions`, `open_original_context`, `edit_summary_with_version`, `delete/revoke` and `resume_from_bookmark`. Memo SHALL support free text, pasted text/image, file attachments and device captures with explicit permission, drafts/autosave and conflict resolution. Copying a chat answer to Memo preserves the user-editable copy and its source link, never a hidden auto-edit to learner text.
4. Long sessions SHALL provide an optional digest of main question, established knowledge, remaining uncertainties, files/visuals used and next actionable step. Distinguish **Tutor summary** from **learner's own notes**, and require a source-link before using summary claims to award mastery.
5. UI components MUST support keyboard-only operation, screen-reader labels, alt text, visible focus, text resize, reduced motion, sufficient contrast and captions/transcript control; voice and image are optional rather than mandatory for course completion unless a reviewed subject outcome genuinely requires them.
6. If synthesis, Vectorize, image generation or live voice is unavailable, existing reviewed course content, original uploads and local note drafts MUST remain accessible where authorized. Show `not yet synced`/`assessment pending` clearly; never declare a course complete because an async verifier timed out.

**Tests G09:** 320px/mobile and tablet layout, RTL/Thai+English text wrapping, screen-reader course-map status announcements, clipboard screenshot paste, pause and return after reconnect, denied camera permission graceful fallback, offline/online memo version conflicts, 100+ artifact timeline pagination and full source recall.

### Pass 10 — Cross-spec migration, billing, release flags, and operational rollback

**Gap:** Spec 249's proposed contracts did not make compatibility-contract versioning, feature-gate prerequisites, untrusted tool cost boundaries and rollback behavior for partially migrated enrollments sufficiently explicit.

**R1.1 correction (NORMATIVE):**

1. Before implementation create a checked-in `spec249-dependency-map` from the **actual** SmartSpecPro main/PR/worktree/deployed API and migration state: canonical chat context and approvals (196/226), `worker_jobs` (186/195), authentication (220), ledger (207), retrieval (229/Vectorize), routing (231, after resolving its documented ID collision), project/personal memory (233/241), UI (240), realtime (237), catalog (212), Skills (221/248). Mark each `implemented|available_behind_flag|design_only|blocked` with owner and conformance test. No circular startup dependency on in-flight Spec 224 or unresolved P213 admission.
2. Tutor additions SHALL use versioned request/response schemas and explicit forward/backward compatibility where clients differ. Database migrations must be additive and reversible or safely forward-only with a tested rollback application path; no destructive rewriting of existing Chat/LMS/Marketplace or spec 1–213 files.
3. Feature flags default OFF by **tenant + course + capability**: `tutor_core`, `tutor_course_synthesis`, `tutor_media`, `tutor_live_voice`, `tutor_promotion`. Rollout may enable text-only private curated Tutor without depending on experimental GenUI/live voice/Skills distribution. On dependency failure, degrade to safe text or pause the affected function without falsifying mastery or leaking drafts.
4. At every proposed paid call (media synthesis, provider tool, lengthy evaluation or external Skill execution) show relevant cost class / estimate where feasible; enforce preflight quota and post-use Spec 207 ledger reconciliation with idempotency. Choice of a cheap or expensive model is a teaching experiment only with learner opt-in, budget cap, consistent comparison conditions and explicit uncertainty about quality.
5. Observability SHALL include correlation ID across transcript, course version, turn, evidence, media and existing job receipts, with privacy-safe traces, tenant fencing and short-lived debugging access. Launch checklist MUST include data/ACL backup recovery, replay tests, expense ceilings, prompt injection red team, migration rollback drill, performance baseline and learner-visible incident handling.
6. Do not mark `IMPLEMENTED`, `VERIFIED`, `LIVE` or `PRODUCTION_CERTIFIED` based solely on this ten-pass review. Require independent reviewer sign-off, CI evidence, staging functional testing and actual source/repository reconciliation before release.

**Tests G10:** Startup rejects unresolved collision in canonical spec registry; text-only MVP works when optional visual/voice/retrieval features fail; forbidden cross-tenant course launch is denied; rollback mid-enrollment preserves original content and learner notes; duplicate billed job is charged exactly once under existing ledger contract; P213/Spec224 blocked status cannot be bypassed by Tutor flag.

### 23.1 Revised end-to-end acceptance supplement

The following **supplements rather than replaces** §17; each group is a release-blocking suite for any shipped capability it touches. P0 core requires G01–G03, G05–G06, applicable G08–G10; media adds G04; marketplace adds G07; voice adds the G05 live-reconnect and G09 voice accessibility cases. Dependency states of `design_only` or `blocked` forbid enabling their feature flag, not the entire safe text-only Tutor.

| Audit pass | Minimum closure evidence | Owner | Target phase |
|---|---|---|---|
| G01 graph | DAG/manifest property tests; learner-approved scope versioning | Course Foundry | P0 |
| G02 evidence | authorship/hints/verifier and rubric-change fixtures | Learning Assessment | P0 |
| G03 conversation | confusion ladder; equivalent probes; detour budget traces | Tutor/Pedagogy | P0 |
| G04 visual | media lineage, diagram QA and accessible alternate tasks | Media/Accessibility | P1 |
| G05 concurrency | duplicate, cancel, reconnect, stale-lease and replay tests | Runtime/Realtime | P0; live P1 |
| G06 memory | delete/revoke lineage receipts and cross-scope deny tests | Privacy/Memory | P0 |
| G07 promotion | clean-source rebuild, rights proof, poisoning and freshness | Catalog/Marketplace | P2 |
| G08 evaluation | independently scored post/transfer fixtures and rollback rule | Evaluation/Education | P0 |
| G09 UX | usability + accessible mobile/keyboard/screenshots/offline tests | Learning UX | P0; media P1 |
| G10 integration | real dependency map, flag matrix, ledger/rollback drill | Platform Release | P0–P2 |

### 23.2 Additional versioned logical contracts

```yaml
QuestionIntent:
  question_id: uuid
  competency_id: uuid
  competency_version: string
  observable_construct: string
  equivalence_group_id: string
  expected_evidence_type: explanation|response|practice|transfer
  support_allowed: [none, hint, visual_example, choice, assisted_tool]
  scope_relation: IN_ACTIVITY|WITHIN_COURSE_DETOUR|APPLICATION_ADJACENT|OUTSIDE_COURSE
  question_version: string
  schema_version: 1
TurnCommit:
  session_id: uuid
  session_generation: integer
  turn_id: uuid
  client_turn_id: uuid
  content_hash: string
  expected_session_version: integer
  committed_event_seq: integer
  state: RECEIVED|AUTHORIZED|INPUT_READY|RESPONDING|RESPONSE_COMMITTED|EVIDENCE_PENDING|EVIDENCE_COMMITTED|CANCELLED|FAILED|SUPERSEDED
  idempotency_receipt_ref: opaque
SourceLineage:
  original_ref: opaque
  original_hash: sha256
  source_consent_refs: [opaque]
  source_acl_ref: opaque
  transform_refs: [opaque]
  derivative_refs: [opaque]
  retention_policy_id: string
  deletion_state: ACTIVE|REQUESTED|FENCED|PROPAGATING|VERIFIED|EXCEPTION_REVIEW
  lineage_version: integer
```

**Authoritative source reminder:** These are Spec 249 domain payloads/projections. Auth, durable execution, accounting, version arbitration and notifications are delegated to their existing canonical SmartAIHub owners. Validate against real deployed naming before generating migrations.

### 23.3 Audit result and remaining external blockers

**Document review outcome:** All ten passes above identified at least one actionable gap and supplied a normative correction and concrete test suite. This revision now expresses the intended behavior for graph correctness, assessment, dialogue, multimodal evidence, concurrent operation, privacy lineage, course publication, effectiveness evaluation, accessible UX and release control. It does **not** claim these tests were executed in a SmartAIHub application. The following remain explicitly open: authoritative Spec 249 number collision check; actual repository/API/schema discovery; dependency-level integration and performance baselines; privacy/legal review for minors and third-party media; calibrated outcome study; staging/live release certification. Their lack of closure MUST be visible as blockers, never converted into a synthetic PASS by document review.

---

## 24. R1.2 normative amendment — second independent ten-pass gap audit (2026-09-25)

**Precedence:** This section is an additive normative correction to R1.0 and R1.1. For the same concern, apply the stricter requirement. These are ten additional **document-design review passes**, yielding 20 cumulative passes; none represents executed product tests, live repository verification or educational outcome certification. All new components are logical Tutor-domain profiles that reuse existing SmartAIHub ownership, not new competing orchestration, identity, authorization, memory, payment, search or execution authorities. Preserve Specs 1–213 unchanged; integrate with in-flight Spec 224 via additive contracts only. Reserve number 249 only after checking the authoritative repo registry, branches, open PRs and worktrees.

### Pass 11 — Verifier trust boundaries and assessor independence (NEW GAP R11)

**Finding:** R1.1 requires domain verifiers and authorship-aware evidence but does not specify how evaluator independence, hidden answers, grader prompt injection, verifier drift and conflicts among assessors are handled. A fluent LLM grader could incorrectly certify its own generated lesson or accept tampered learner artifacts.

**Correction (normative):**

1. Every consequential `AssessmentRun` SHALL bind `course_version`, `competency_version`, `rubric_version`, `assessment_item_version`, `grader_version`, `grader_kind`, `source_content_hash`, `assistance_manifest`, `evaluator_separation` and `decision_provenance` before mastery projection. Grader prompt/instructions and answer keys must be stored in access-controlled assessment material distinct from ordinary course/chat RAG; learner-submitted text/images/code MUST be treated as untrusted data.
2. For deterministic assessable constructs use deterministic or sandboxed verifiers as the ground truth where feasible (e.g. exact math equivalence with valid domains; automated unit tests with test coverage; schema validation); LLM evaluations SHALL be calibrated against independently reviewed anchor examples and may provide feedback, not automatically invent an authoritative grade. Subject packs must declare which skills require a human reviewer or multiple independent evidence types.
3. The authoring or tutoring model SHALL NOT be the sole unchecked authority for high-impact mastery on its own question, solution and learner submission. A separate versioned evaluation route or human review is required for consequential decisions. Record disagreements; if unreconciled use `evidence_needed`, not a fabricated pass/fail.
4. Dynamic question variants MUST declare answer/solution provenance, equivalence to the competency's observable construct, difficulty/assistance level and leakage-control metadata. A leaked or seen answer must not count as a fresh independent transfer item.
5. Continuous grader canaries SHALL detect rubric regression, adversarial text in files, poisoned screenshots and label skew; disable automated mastery for the affected domain pack after a failed gate while keeping ungraded practice usable.

**Tests R11:** LLM-only verifier cannot certify itself; assessment prompt injection is ignored; answer-key retrieval denied from Tutor RAG; conflicting evaluators generate review state; leaked items cannot count as unseen transfer; a verifier downgrade pauses new mastery updates.

### Pass 12 — Goal renegotiation and bounded course branching (NEW GAP R12)

**Finding:** Learners may redefine goals during an ongoing course, ask about adjacent topics, switch professions or prefer a short micro-course. Existing scope guard and graph version rules do not define a reversible goal-change transaction that prevents corrupting progress against original outcomes.

**Correction (normative):**

1. Distinguish `course_canonical_scope`, `learner_goal_snapshot`, `active_activity_goal` and `inquiry_detour`. A Tutor SHALL explain any proposed change to expected outcomes, scope, estimated effort, required prerequisites and existing mastery coverage before it changes the active learner goal.
2. Goal changes SHALL be atomic, versioned `GoalChangeProposal` records: `old_goal_ref`, `new_goal_ref`, `scope_diff`, `preserved_competency_refs`, `orphaned_activity_refs`, `cost_delta_estimate`, `consent_receipt`, `activation_at` and undo/revert pointer. Allow learners to keep the original course and add an elective, switch to a new personalized branch or open a separate course; NEVER silently edit a public course version.
3. A learner-initiated inquiry within bounds may interrupt immediately; an adjacent request may be answered briefly and bookmarked; a durable scope expansion, paid course addition or permission increase requires explicit learner acceptance. A refusal must resume the prior activity exactly once.
4. Prevent graph/branch explosion: configurable maximum outstanding detours, due bookmarks and synthesis budget; show a learner-friendly "back to our original goal" affordance. Transfer evidence can be shared across courses only when construct, rubric, verification and authorization are equivalent.

**Tests R12:** mid-course goal switch preserves source progress; rejected proposal leaves state unchanged; resumed interruptions do not duplicate the question; elective creates no unauthorized shared memory; over-branching prompts learner choice rather than generating unlimited courses.

### Pass 13 — Volatile knowledge and vendor-version dependency (NEW GAP R13)

**Finding:** AI tooling and vendor UX evolve rapidly; R1.1 has source freshness but no operational definition of when a previously verified lesson, screenshot, Skill instruction or tool demonstration becomes stale or is invalidated by an upstream change.

**Correction (normative):**

1. Each version-sensitive `LearningResource` SHALL include `vendor`, `product`, `product_version_or_snapshot`, `doc_source_ref`, `last_verified_at`, `freshness_ttl_policy`, `api_or_ui_surface`, `license_basis`, `applicable_course_versions` and `supersession_refs`. If an exact upstream version is unavailable, disclose the observation date and uncertainty.
2. Trigger an asynchronous **advisory** revalidation when provider changelogs, supported tool schemas or manually reported UI changes suggest drift. Revalidation uses the existing retrieval/jobs plane, with bounded cost and author/reviewer gate; no autonomous silent rewrite of published learning outcomes or rubrics.
3. On expiry or a confirmed breaking change, show an `outdated_example` or `verification_pending` banner, offer a maintained substitute if available, and suspend assessments that rely on invalid obsolete behavior. Stable underlying concepts may remain mastered; tool-version-specific mastery requires recheck only if the underlying construct changed.
4. Retain access-controlled historical snapshots for existing enrollments when licensing/retention permits, and include a learner-visible "what changed" summary for any migrated resource. Do not claim an old screenshot reflects current Claude/OpenAI/Google UI without re-verification.

**Tests R13:** obsolete UI tutorial flagged; hard API break blocks incompatible task evaluation; stable concept evidence retained; newer version cannot silently overwrite old enrollment; unavailable upstream docs yield explicit unknown state, not invented freshness.

### Pass 14 — Multimodal temporal grounding and evidence integrity (NEW GAP R14)

**Finding:** R1.1 media lineage handles images and transcripts, but ambiguous cropping, OCR-like text extraction, annotation coordinates, asynchronous image variants and voice transcript edits can mismatch the exact material a learner saw. Assessment could then cite the wrong frame or picture.

**Correction (normative):**

1. Every visual/audio/video evidence fragment SHALL bind an immutable original asset hash plus `transform_chain[]` (crop, resize, rotation, blur, frame extraction, transcription, annotation), transform parameters/version, source timestamps/time ranges, coordinate system, displayed variant ref and content-disclosure rights.
2. A generated teaching infographic has `claim_refs[]` linking each checkable factual assertion to vetted material or clearly marked illustrative status. Generated visuals SHALL NOT be used as literal evidence of a real-world fact or real experiment without independently sourced observation.
3. Image comparisons SHALL retain rendering/model/settings where relevant, or explicitly label uncontrolled variables. If the learner annotates or selects a region, record coordinates in the displayed variant and map to the original with validation; a transformed asset without stable coordinate mapping cannot support pixel/region-specific grading.
4. Live ASR preliminary transcripts are not durable grading input until learner-confirmed or sufficiently final under a tested domain policy; corrected transcripts create a new revision, and dependent provisional evidence must be invalidated/recomputed.
5. Missing images or inaccessible media must retain textual description, related question and artifact context; provide an equivalent nonvisual assessment where valid, or offer a human-assisted path if the construct is intrinsically visual.

**Tests R14:** rotated/cropped screenshots map to original correctly; deleted image cannot leave a valid visual mastery receipt; speculative infographic facts are marked; ASR correction invalidates superseded assessment; video frame timestamp points to the exact learner-visible clip.

### Pass 15 — Retrieval contamination and epistemic conflict (NEW GAP R15)

**Finding:** Reuse-first curriculum synthesis, personalized retrieval and learner notes can create a feedback loop in which an earlier Tutor mistake becomes a retrieved "fact" and strengthens future misleading answers, particularly when generated public courses borrow from prior generated drafts.

**Correction (normative):**

1. Retrieval SHALL expose `source_class = authoritative_reference | reviewed_course | learner_original | tutor_generated | external_unverified`, along with rights, freshness, source hash and trust rank. Generated summaries, private memos and model outputs MUST NOT be promoted to independent corroborating sources by embedding or paraphrase.
2. Tutor responses based on contested or insufficient material must present uncertainty or compare eligible sources; a contradiction against authoritative references triggers `content_dispute` and blocks mastery that depends on the disputed answer until resolution.
3. Retrieval filters and deduplication SHALL collapse derivation chains: ten copied versions of one generated explanation count as one originating claim, not ten corroborating sources. Distinguish a learner's hypothesis from an established answer.
4. Catalog promotion requires clean-room source rebuild from rights-cleared references; generated drafts may inform topic demand and structure but cannot provide independent factual verification. Corrected or retracted lessons trigger descendant artifact/course impact checks and learner-facing corrections for consequential errors.

**Tests R15:** self-citation loop fails source verification; a learner memo cannot silently override a reviewed theorem; conflicting source versions surface discrepancy; revoked material does not remain searchable as corroboration; dependent published lesson is flagged after source correction.

### Pass 16 — Instructor collaboration and delegated-access constraints (NEW GAP R16)

**Finding:** Teacher surfaces, guardian controls and privacy are specified, but the permission model for feedback, grading overrides, classroom enrollment, teacher changes, sharing learner artifacts and conflicting edits is not explicit enough to implement without accidental over-broad access.

**Correction (normative):**

1. Add scoped `TutorClassroomMembership`, `CourseAssignment`, `ReviewerAction` and `LearnerShareGrant` as additive projections under existing Spec 220 authority. Membership NEVER implies access to unrelated personal Memo, voice recordings, private courses, other projects or raw assessments. A learner's private artifacts remain private until a purpose-limited, revocable grant or applicable minor safeguarding policy permits access.
2. Instructor feedback SHALL preserve original learner work and grader outcome; grading override requires author, reason, policy/rubric version, evidence references, timestamp and authorized second review for high-impact changes. A teacher cannot silently change a published rubric mid-cohort.
3. Classroom/white-label export must produce the minimum outcome/progress fields under explicit institutional policy, never raw chat transcript by default. Teacher reassignment revokes prior access promptly and fences caches, shared links and pending grading jobs.
4. Conflict handling for concurrent educator/learner edits SHALL use optimistic versions and clear merge/resolve UX; no last-write-wins deletion of private learner notes.

**Tests R16:** teacher role cannot read personal Memo without grant; cross-classroom share denied; revoked teacher loses cached and active links; conflicting teacher edits preserve audit history; high-impact override without required review is blocked.

### Pass 17 — Offline-first mobile sync and partial-failure recovery (NEW GAP R17)

**Finding:** Prior UX includes mobile, resume and offline tests, but no concrete sync contract for captured photos, user memos, queued questions and voice interruptions when a learner has intermittent connectivity. A naïve replay can duplicate tutor turns, paid jobs or competency evidence.

**Correction (normative):**

1. A minimal offline client MAY edit private Memos, capture/annotate local media, read explicitly cached rights-eligible lessons and stage a question. It MUST NOT claim an offline AI answer, confirmed progress, server-shared grant or verified mastery unless there is an approved on-device verifier with distinct recorded proof.
2. Each queued mutation SHALL carry `client_operation_id`, `base_revision`, tenant/course/session binding, content hash, client timestamp and ordered dependency refs. On reconnect, authenticate before upload, obtain server authorization for each operation, de-duplicate by operation ID and deterministically resolve current version and retention policy.
3. Memos should support revision-aware merge for nonoverlapping edits, visible conflict UI for overlapping edits and encrypted local storage where supported; queued media must observe upload limits, user deletion and permission changes before syncing. A revoked or deleted artifact may not be resurrected by stale offline replay.
4. Queued conversation sends require explicit learner reconfirmation if course scope/assessment context materially changed while offline. Live voice packets are never blindly replayed as new assessment attempts. Any queued paid action requires a fresh budget/approval check.

**Tests R17:** flight-mode memo persists and syncs once; stale revoked photo never uploads; duplicate queued question does not double bill; expired course prompt triggers reconfirmation; conflicting memo edits surface both revisions; offline UI clearly distinguishes pending from server-confirmed work.

### Pass 18 — Accessible assessment equivalence, inclusion and agency (NEW GAP R18)

**Finding:** R1.1 requires alt text and alternative tasks but does not define how to preserve the tested construct when switching modality; a verbal description can inadvertently reveal the answer to a visual discrimination assessment. Nor are accommodations consistently represented in evidence policy.

**Correction (normative):**

1. Subject packs SHALL declare for each competency: `essential_construct`, `permitted_modalities`, `accessibility_accommodations`, `equivalence_evidence`, `non_equivalent_fallback` and a reviewed alternative task if one exists. Alternative presentations should not introduce hints that change the target construct without recording the adjusted assistance level.
2. Allow learner-directed choice of text/voice, captions, reduced animation, larger type, keyboard access, readable diagrams and time flexibility as appropriate. Do not derive a medical condition or fixed learning-style label from accessibility choices; choices are preferences and may change at any time.
3. When a modality is essential to the actual outcome (e.g. English pronunciation or visually identifying image composition), an alternative task must be transparently described as an **alternative outcome** or support activity, not automatically scored as identical mastery. For accessible comparable pathways, document a human-reviewable equivalence rationale.
4. Assess responsive designs against realistic low-bandwidth and screen-reader environments; support interrupted transcription review and user-controlled text corrections without penalizing fluency or accent unrelated to the target outcome.

**Tests R18:** visual-answer-revealing alt text does not certify visual construct; voice-to-text accommodation retains eligible reasoning evidence; pronunciation construct cannot be silently mastered through multiple choice; screen-reader/mobile flows support note capture and resume; accessibility preference change does not alter assessed competency state without evidence.

### Pass 19 — Educational impact, experimental ethics and stopping rules (NEW GAP R19)

**Finding:** R1.1 introduces A/B evaluation but lacks explicit controls for self-selection, domain/age cohort differences, assessment leakage, excessive probing and experiment halt conditions; an optimization loop might maximize engagement or short-term scores while impairing actual learning.

**Correction (normative):**

1. Define prospective `EvaluationProtocol` with target population, domain, consent/ethics route, baseline assessment, pre-registered primary construct, post/retention/novel-transfer measures, blinded or independently scored rubrics, inclusion criteria, missing-data handling and analysis window. Do not generalize results across age groups, subjects or cultures without evidence.
2. Personalization changes MUST be evaluated for harm as well as gains: repeated confusion, avoidable over-questioning, accessibility failure, disproportionate costs, false mastery, disengagement and loss of autonomy. Learners can skip, pause, reject adaptivity and switch Tutor mode without invalidating historical evidence.
3. Do not claim an improvement from a single model-scored interaction, biased opt-in sample or unblinded item set. Keep benchmark items isolated from course-generation retrieval and training feedback; log contamination incidents and invalidate affected measurements.
4. Establish experiment stopping rules before rollout: material privacy leakage, unsafe guidance, sustained false-mastery increase, negative independent learning outcomes or unexpected severe cost spikes pause the affected policy/segment pending review. Show clear learner benefit and viable no-adaptation baseline for comparison.

**Tests R19:** leaked benchmark item invalidates study; a harmful adaptation can be disabled independently; interrupted learners counted correctly in analysis; adverse impact by defined eligible cohort triggers review; all promoted efficacy claims link to a dated validated evaluation report.

### Pass 20 — Full restoration, portability and economic viability (NEW GAP R20)

**Finding:** R1.1 covers failure fallback, retention and cost per competency but does not close the restoration path for an entire Learning Workspace after a regional/provider outage or account move, or distinguish cost of instruction from costly generated-media/assessment loops.

**Correction (normative):**

1. Create an export manifest containing course/version/outcome snapshots, permitted competency evidence references, progress decisions, learner-owned Memos and authorized Artifacts/media with source lineage and license restrictions. Export SHALL avoid leaking hidden answer keys, other learners' work, tenant-private rubrics and provider secrets. Import into another tenant is a new authorization/rights evaluation, not an automatic privilege transfer.
2. Restore drills SHALL reconcile PostgreSQL-authoritative enrollments, learner revisions, R2 media hashes and asynchronously rebuilt Vectorize indexes. Search-index loss must degrade to source-backed search/fallback without changing the truth of mastery. Honor active deletion tombstones and revocations before restoring backup snapshots; deleted private data may not silently reappear.
3. Declare per-course cost budgets by modality and operating tier; measure `cost_per_retained_competency` and marginal cost of image generation, speech, verifier and human review separately. Cache only license/ACL-compatible shared instructional assets; do not share private generated images or learner response context across tenants to save cost.
4. Introduce bounded escalation: cheap classification/rule pass → ordinary Tutor response → specialist verifier/generator only when needed; keep one canonical billing receipt under Spec 207 and job authority under existing worker_jobs. Media/voice failures cannot force costly loops or block an accessible text learning path.
5. A release gate SHALL require an observed staging restore and a fault-injected degraded-mode run for the actual deployed dependency set, not solely a written RTO/RPO promise; document measured recovery and unmet targets.

**Tests R20:** restore after Vectorize loss retains canonical progress; backup rehydration respects deletion tombstones; export omits hidden test keys/private peer assets; cross-tenant import reauthorizes rights; cached asset ACL fence prevents leak; image-generator outage still allows text tutorial without duplicate charge.

### 24.1 Second-audit acceptance gates (R11–R20)

These **supplement**, not replace, §17 and §23.1. The owning feature flag cannot be enabled until all applicable gates pass in staging, with source-linked CI receipts and an independent reviewer. Gates for deferred capabilities do not block a safe text-only private Tutor.

| Gate | Blocking proof | Earliest phase |
|---|---|---|
| R11 Verifier independence | rubric/answer isolation, adversarial grader canaries, disagreement flow | P0 |
| R12 Goal renegotiation | versioned scope proposal, branch/undo, cross-course evidence validation | P0 |
| R13 Freshness | versioned vendor snapshot, expired-assessment block, content-revision notification | P0 for vendor topics |
| R14 Media integrity | immutable transform chain, corrected-ASR invalidation, visual provenance | P1 media/voice |
| R15 Retrieval contamination | derivation dedup, disputed-source hold, clean-room publication | P0 retrieval; P2 publication |
| R16 Instructor access | classroom ACL, share-grant revocation, audited grading override | P2 teacher portal |
| R17 Offline sync | authorization on replay, local tombstones, no duplicate billing | P1 offline clients |
| R18 Assessment accessibility | construct-preserving modality alternatives and non-equivalence labels | P0 text; P1 modality |
| R19 Outcomes & ethics | registered evaluation, contamination guard, stopping-rule drill | P0 study design; P2 claims |
| R20 Restore & economics | measured staging restoration, privacy-safe portability and media cost ceilings | P0 restore; P1 export/media |

### 24.2 Additional domain event contracts (illustrative, additive)

```yaml
AssessmentRun:
  assessment_id: uuid
  source_content_hash: sha256
  rubric_version: string
  grader_version: string
  grader_kind: deterministic|independent_llm|human
  evaluator_separation: independent|reviewed_exception
  assistance_manifest_ref: opaque
  answer_leakage_state: clear|suspected|confirmed
  decision: verified|evidence_needed|rejected|review_required
  verifier_receipt_ref: opaque
GoalChangeProposal:
  proposal_id: uuid
  enrollment_id: uuid
  old_goal_ref: opaque
  new_goal_ref: opaque
  scope_diff_ref: opaque
  preserved_competency_refs: [opaque]
  consent_receipt_ref: opaque|null
  state: DRAFT|PREVIEWED|ACCEPTED|REJECTED|ACTIVATED|REVERTED
LearningResource:
  resource_id: uuid
  source_class: authoritative_reference|reviewed_course|learner_original|tutor_generated|external_unverified
  source_lineage_ref: opaque
  vendor_snapshot_ref: opaque|null
  last_verified_at: timestamp|null
  freshness_policy_ref: opaque
  rights_policy_ref: opaque
MediaEvidenceFragment:
  evidence_id: uuid
  original_asset_hash: sha256
  transform_chain_ref: opaque
  display_variant_ref: opaque
  source_time_range_ref: opaque|null
  transcript_revision_ref: opaque|null
OfflineOperation:
  client_operation_id: uuid
  tenant_id: uuid
  enrollment_id: uuid
  base_revision: integer
  content_hash: sha256
  dependency_refs: [opaque]
  state: LOCAL_PENDING|SYNCING|SERVER_COMMITTED|CONFLICT|REJECTED
```

**Implementation caution:** These are proposed Tutor-side contracts, not claims about deployed table names or currently supported clients. Map them to real schema, current ACL, billing, R2, Vectorize, Spec 237 and Feature 196 APIs at implementation start. All irreversible side effects require existing authority and fencing. No spec approval implies permission to bypass any open security/production gate.

### 24.3 Updated definition of done and residual risks

- 20 distinct document-audit passes (R1.1 ten + R1.2 ten) have documented findings, normative corrections and adversarial test cases. **Design validation only.**
- A release candidate requires all applicable §17, §23.1 and §24.1 gates, including independent outcome verification, concrete authorization tests, reproducible restore evidence, observed performance/cost baselines, safe subject-pack evaluation and learner-controlled visibility.
- Still externally **OPEN**: authoritative Spec 249 number check in SmartSpecPro Git registry/main/PR/worktrees; deployed schema/API mapping; real provider interop; educator/user research and calibration; local legal/privacy review (especially minors and copyrighted media); measured staging/live readiness. Any inability to verify must remain a blocker rather than a synthetic PASS.

---

## 25. R1.3 normative amendment — third ten-pass gap audit (2026-09-25)

**Review basis:** The complete R1.2 source (§§0–24, 1,168 lines) was reviewed against ten NEW failure scenarios beyond passes R01–R20. This section closes design-contract gaps but does not demonstrate a deployed implementation, a measured educational outcome, live provider conformance, or a verified canonical spec number. Prior clauses remain normative unless expressly tightened here; where two clauses differ for the same capability, enforce the stricter privacy, safety, evidence and release gate. No change is authorized to Specs 1–213 or the in-flight Spec 224. Proposed names below MUST be reconciled with the real repository before generating code or migrations.

### Pass 21 — Pedagogical context integrity across compaction and long sessions (R21)

**Inspected baseline:** §7.5 interruption/bookmarks; §§9.3–9.6 artifact/memo/memory; §10 learner turn lifecycle; R05 replay fencing; R15 source-lineage contamination. **Residual gap:** They do not specify a durable, minimal *instructional* checkpoint when a long Tutor dialogue is compacted, switched between providers/devices or reconstructed after loss of conversational context. A conversational summary can silently drop the exact question still being answered, essential learner misunderstanding, outstanding assessment assistance or the approved goal boundary.

**Correction (normative):**

1. Define `PedagogicalCheckpoint` as a versioned PostgreSQL Tutor-domain projection referencing existing canonical session/turns. Required fields: `tenant_id`, `enrollment_id`, `session_ref`, `session_generation`, `course_version`, `goal_version`, `active_competency_refs[]`, `question_intent_ref`, `last_committed_turn_ref`, `current_move`, `pending_learner_question_refs[]`, `unresolved_confusion_refs[]`, `assistance_so_far_ref`, `side_quest_return_ref`, `unverified_evidence_refs[]`, `consent_scope_ref`, `source_turn_range`, `checkpoint_revision`, `source_hash`. It is NOT a competing chat-memory store; original authorized turns remain canonical evidence.
2. Checkpoint atomically with the committed turn/outbox before any model context-compaction boundary, provider/model switch, voice/text transition, session suspend or applicable restart. Prefer a deterministic state projection from committed events; LLM summaries can supply display prose but MUST NOT independently create or upgrade mastery, alter goal scope or overwrite current unconfirmed learner answers. If the atomic commit is unavailable, block a consequential next-step assessment and show `recovery_pending`.
3. Restore order MUST be: re-authorize identity/tenant → load canonical course and consent versions → load latest valid checkpoint → validate referenced source-turn hashes and open assessment state → retrieve minimum permitted source turns → resume or request learner confirmation if an essential referent is irrecoverable. No raw private Memo is implicitly folded into provider context merely because it exists.
4. Context reduction MUST protect the active learner question, incomplete explanation, rubric/assistance state and return bookmark from being replaced by generated summary claims. Record `compaction_generation`, pre/post-context evidence decision parity and token budget telemetry. Display a concise learner-visible "Where we left off" card after a material recovery, with an edit/correction option.
5. If a deleted/revoked source turn underlies a checkpoint, invalidate that checkpoint and rebuild only from still-authorized sources; never resurrect its content from caches or a stale device. Async evaluation from an earlier generation is quarantined by existing turn/session fencing.

**Tests R21:** (a) simulate 200+ turns and compact during an unanswered learner question; active question and diagnostic intent survive; (b) provider switch while awaiting a visual/voice correction preserves correct assistance state; (c) revocation of a Memo reference eliminates it after restore; (d) corrupted checkpoint fails closed without invented mastery; (e) mobile reconnect does not award duplicate evidence. **Phase:** P0 for text checkpoint, P1 for multimodal transitions.

### Pass 22 — Assisted practice authorship and autonomous-tool contamination (R22)

**Inspected baseline:** §6 evidence taxonomy; §11 subject packs; §14.2 sandbox; R02 learner evidence and R11 verifier separation. **Residual gap:** A capable agent can complete the learner's practical task end-to-end, potentially making AI-generated code, prompt, infographic or workflow look like independent learner proficiency despite recorded hints. Generic `support_level` alone cannot account for tool actions, edit attribution or whether the learner understood the result.

**Correction (normative):**

1. Every assessable practice activity SHALL declare `practice_mode = OBSERVE | CO_EDIT | GUIDED_EXECUTION | INDEPENDENT | TRANSFER`; the user can switch modes, but a move from CO_EDIT to INDEPENDENT starts a fresh evidence window. Record a content-addressed `ContributionManifest` with learner-authored steps, AI-suggested edits, AI-applied edits, external Skill/subagent calls, reference material shown, hidden tests touched and any manual reviewer intervention. Capture diffs or typed action receipts when the environment supports them; do not pretend perfect authorship detection for pasted or externally produced work.
2. The Tutor SHALL offer "show me", "help me do it" and "let me try" as explicit options for practical tasks. Demonstrations may teach and inform a progress view but MUST NOT alone certify practical mastery. Independent mastery requires a fresh, learner-controlled action or reasoning task under the subject pack's specified verifier and assistance policy; if provenance is insufficient use `evidence_needed`.
3. Each external tool/Skill/subagent exercise must use the existing capability registry, Spec 220 scoped grants, approval and budget receipts, sandbox isolation and canonical worker_jobs. Defaults: synthetic/sanitized data, no live customer credentials, no real paid deployment/purchase, no network egress unless separately authorized. The Tutor's "practice" mode SHALL not execute potentially irreversible real-world actions without the normal user approvals.
4. Verifier inputs MUST distinguish results of test runs generated by the agent from tests the learner authored and interprets. A red/green TDD demonstration is not evidence the learner can design tests; ask for an explanation or novel test selection as appropriate. Verifier source separation and hidden-item protection from R11 continue to apply.
5. Disclosure UI SHALL explain when an artifact was principally generated by AI and which independent learner action is still necessary for the claimed learning outcome. Authorship and assistance traces are learner-private unless purpose-limited sharing was authorized.

**Tests R22:** (a) agent produces a working app unassisted by learner → no independent mastery; (b) learner corrects a failing hidden test and explains why → eligible evidence per reviewed rubric; (c) pasted third-party code cannot be assumed learner-authored; (d) Skill requests network egress and secrets in a practice sandbox → denied until correct independent approval; (e) agent runs an authorized dry run → no duplicate live billing or permission inheritance. **Phase:** P0 for text/practice attribution; P1 for connected tools and sandbox exercises.

### Pass 23 — Competency identity, evolution and cross-course credit portability (R23)

**Inspected baseline:** §4.3 graph; §6.4 state updates; §12 entities; R01 graph integrity; R12 transfer-sharing when equivalent; R13 vendor-version freshness. **Residual gap:** Equivalence is named but a deterministic workflow to map changed competency identities/rubrics, split/merge skills or revoke obsolete transferred credit is missing. Otherwise a learner could earn mastery of a similarly named but materially different skill in an unrelated course.

**Correction (normative):**

1. Introduce versioned `CompetencyEquivalenceDecision` linking `source_competency_id@version`, `target_competency_id@version`, `source_rubric_hash`, `target_rubric_hash`, `construct_comparison_ref`, `permitted_credit_kind = NONE | EXPLORATION | PREREQUISITE | MASTERY`, `evidence_floor`, `reviewer_ref`, `decision_version` and `expires_at`. Neither title similarity nor vector proximity authorizes credit. A declared `same_as` link across different domains is a reviewable claim, not a global identifier merge.
2. Graph revisions that split, merge, retire or reframe competencies MUST issue an immutable migration manifest stating which evidence remains applicable, which newly required dimensions are unverified, and which completed outcomes are unaffected. The enrolled historical version remains reproducible; changing the course alone NEVER silently upgrades or revokes a verified historical outcome.
3. Cross-course reuse SHALL use authorized **evidence references** and an equivalence decision, not a copy of private learner media/chat into a second course. On evidence revocation, rubric retraction or broken equivalence, invalidate downstream derived credit and emit an understandable reason; user-authored Memos stay separately scoped. Review-due is not a failure grade.
4. Prerequisite waivers may be based on portable credit at a lower evidence floor but must not be presented as mastery where the destination rubric demands a novel independent assessment. Detect and reject cyclical credit chains in which two courses certify one another without original assessment evidence.
5. API responses SHALL expose `source_enrollment_ref`, `mapping_version`, `credit_kind`, `original_evidence_refs[]`, `projection_status` and `review_due_reason`; prohibit user/tenant mismatches before emitting course names or proof metadata.

**Tests R23:** (a) similarly named but differently scoped Skills do not share mastery; (b) split schema competency generates partial carry-forward plus unverified new dimensions; (c) source evidence deletion retracts transferred credit without deleting unrelated course progress; (d) mutual credit-only cycles cannot self-certify; (e) cross-tenant private evidence mapping denies before existence disclosure. **Phase:** P1 cross-course; P0 if P0 already reuses prior competency results.

### Pass 24 — Retention practice, review scheduling and learner autonomy (R24)

**Inspected baseline:** §6 `retention` and `review_due_at`, §9 Course Map, §16 Slice 7, R02 mastery states and R19 evaluation. **Residual gap:** No scheduling contract prevents redundant reminders across courses, premature auto-downgrades, repeat testing of the same leaked item, or a constant stream of review prompts that overwhelms learner-initiated inquiry.

**Correction (normative):**

1. Define `ReviewPlan` per learner/competency with `mastery_evidence_refs[]`, `last_independent_demonstration_at`, `next_review_window`, `review_reason`, `review_item_exposure_set`, `priority`, `notification_consent_ref` and `policy_version`. The initial spacing heuristic is a **proposal**, not a universal scientifically validated schedule; tune by subject, observed retrieval performance, learner preference and independent outcome checks.
2. A review becomes due based on the declared policy and elapsed observation window; elapsed time alone SHALL NOT silently convert `mastered` to `failed`. Represent stale evidence as `review_due` or `evidence_needed` while preserving original historical attainment. A failed fresh review triggers appropriate diagnostic re-teaching and a reversible state transition with provenance.
3. Deduplicate reminders for shared eligible competencies across courses and batch notification requests via existing Spec 238/notification authority, honoring learner quiet periods, opt-out and any youth restrictions. Adaptive Tutor may propose a one-question recap inside an existing session but may not interrupt a learner-originated question merely because review is due.
4. Delayed transfer items must be meaningfully different from the instruction and hidden previous assessment; record exposure, modality and scaffolding. An optional reminder or spaced review is NOT a paid automatic evaluation job unless the learner has opted in under an enforceable budget.
5. Provide a learner-visible "why this review" explanation and snooze/skip controls. Repeated review refusal may update preference, not competence or inferred motivation/psychological traits.

**Tests R24:** (a) two courses referencing the same eligible competency schedule one authorized reminder, not two; (b) old mastery remains auditable when review becomes due; (c) a seen answer cannot count as a fresh delayed transfer item; (d) quiet hours and opt-out prevent outbound notifications; (e) active learner question is answered before any review prompt. **Phase:** P1 review scheduling; P0 course-map state if `review_due` is displayed.

### Pass 25 — Policy-driven intervention calibration and semantic question invariance (R25)

**Inspected baseline:** §7.2 move registry; §7.3 scope guard; §7.6 anti-interrogation; R03 pedagogical equivalence; R19 controlled outcomes. **Residual gap:** The specification describes valid moves but not a traceable selector proving why the next question has pedagogical value, distinguishing prompt simplification from answer leakage, or detecting regressive policies in unfamiliar learner populations.

**Correction (normative):**

1. Each `PedagogicalDecision` SHALL bind `policy_version`, `observable_input_refs[]`, `target_construct`, `expected_decision_value`, `move_candidates[]`, `selected_move`, `assistance_delta`, `scope_check_ref`, `cost_class`, `stop_or_escalation_reason` and an outcome event. This is a concise operational rationale, not hidden chain-of-thought. Begin with explicit, auditable rules; any learned selector must pass offline and limited cohort evaluation before replacing an approved rule.
2. Before delivering a rephrased question, compare its *observable construct* and required cognitive operations to the source question. If examples, answer-shaped choices or a translated prompt reveal the solution, label the activity as `GUIDED_PRACTICE`, do not inherit the independent-assessment item ID or claim equivalent mastery. Repeated rephrase failure routes to example/demonstration or human help, not perpetual questioning.
3. The question selector MUST honor learner interruptions, fatigue/self-reported preference, per-session probe budget, spend cap, modality access and safety. It MUST NOT infer intelligence, diagnosis or fixed "learning style" from unanswered prompts, appearance, accent or speaking speed.
4. Test and monitor for selector regressions using frozen dialogues covering Thai/English, short/no response, ambiguity, adversarial tangents, multimodal input and prior-knowledge skip; collect independent educator decisions on disputed equivalence. Failing canaries disable only the affected adaptive policy; resume with a reviewed deterministic fallback.
5. A proposed proactive question with no plausible consequence for the next instructional decision SHALL be omitted; the Tutor should instead answer, summarize, give a practice choice or stop. The learner may switch to direct explanation at any time.

**Tests R25:** (a) rephrase that embeds the answer loses independent assessment eligibility; (b) semantic drift after Thai paraphrase triggers review; (c) five failed near-duplicate probes lead to explanation rather than an interrogation loop; (d) learner interruption wins over queued review; (e) a learned policy regression restores the deterministic selector without altering historical evidence. **Phase:** P0 selector, P1 learned optimization.

### Pass 26 — Subject-pack capability certification and trustworthy domain fallbacks (R26)

**Inspected baseline:** §11 subject-pack table; §§14,17 safety and acceptance; R11 independent grading; R13 vendor freshness; R18 modality equivalence. **Residual gap:** The design requires domain verifiers but lacks a uniform conformance manifest that prevents an installed subject pack from silently claiming capabilities it cannot validate, or from mixing instruction-only features with grading authority.

**Correction (normative):**

1. Each subject pack MUST publish a versioned `SubjectPackManifest`: `pack_id`, `pack_version`, `supported_competency_versions[]`, `authoritative_sources[]`, `factual_freshness_policy`, `instruction_modalities[]`, `assessment_modalities[]`, `verified_constructs[]`, `verifier_bindings[]`, `sandbox_profile_ref`, `risk_class`, `age_policy_ref`, `license_refs[]`, `fallback_modes[]` and `conformance_receipt_ref`. Installation or publication is not certification of any untested verifier capability.
2. Instruction, formative feedback, independent mastery, formal/third-party certification and external tool execution are **separate flags**. Default to `instruction_only` until the specific verifier/subject/locale combination passes independent conformance. Subject-specific verification failure fails closed to `evidence_needed` while allowing eligible ungraded explanations.
3. Mathematics packs must test equivalence over declared domains and assumptions, not just symbolic string match; science packs must distinguish model simulation from experimentally established observation and gate hazardous procedures; language packs must separate comprehension from accent/speech-transcription errors; visual production packs must not replace a learner-chosen brief with universal aesthetic scores.
4. Pack updates, verifier revocations, leaked answer items and expired authoritative references SHALL identify affected course versions and evidence decisions before enabling a new pack release. Use existing registry, retrieval, auth and worker job owners; `SubjectPackManifest` is an additive Tutor contract, not a replacement registry.
5. A course cannot silently use a pack that is unsupported for its locale, age class, offline state, sensory modality or actual capability requirements. Expose supported modes and missing verifier as learner-visible limitations at course preview.

**Tests R26:** (a) instruction-only science pack cannot award mastery; (b) SymPy-like verifier rejects mathematically invalid equivalence outside a restricted domain; (c) noisy-ASR accent variation is not graded as knowledge failure; (d) creative rubric is anchored to stated campaign brief; (e) revoked pack verifier blocks new decisions but leaves valid historical evidence auditable. **Phase:** P0 minimal AI-skills pack manifest; P2 expanded Math/Science/Language certification.

### Pass 27 — Thai/English localization, assessment equivalence and media language fidelity (R27)

**Inspected baseline:** §1 Thai and English learner personas; §8 captions/alt; R14 ASR correction; R18 accommodation. **Residual gap:** Translation and bilingual interaction are implicitly treated as presentation only. A mistranslated mathematical quantifier, Skill term, assessment choice or image annotation can change what is being taught or assessed; Thai tokenization and voice transcription may distort source backlinks.

**Correction (normative):**

1. Version every locale-specific question, rubric, alt text, infographic text and spoken script against `locale_source_version`, `reviewed_translation_ref`, `construct_equivalence_ref` and `last_verified_at`. Localized assessment content may not inherit an independent mastery eligibility merely because it uses the same question ID; translation equivalence must be reviewed or the item becomes formative only.
2. Preserve immutable technical identifiers, code, JSON Schema field names, mathematical operators/units and vendor command syntax while providing an optional localized explanation. Support mixed Thai/English text selection, search, line wrapping, fonts, screen readers and subtitles without treating a learner's code-switching as an error unless the competency explicitly assesses it.
3. Translations of image annotations shall remain anchored to the verified original bounding regions; an infographic re-render must revalidate factual claim refs and accessible text, not copy stale coordinates. When a voice transcript has uncertain proper nouns, prompt the learner for correction before scoring vendor/tool knowledge.
4. Subject packs SHALL declare locale-specific assessment and spoken-feedback support separately from generic text translation; unsupported locale/competency pairings remain `practice_only` or offer an authorized human-assisted alternative. Avoid presenting automated speech scoring as accent-neutral until validated in the actual language cohort.
5. Cross-locale course migration must surface differing rubrics/constructs and preserve original evidence, never silently translate a past failure or success into a stronger grade.

**Tests R27:** (a) translated quantifier flips a math answer → assessment quarantined; (b) Thai/English Skill JSON identifiers stay byte-identical; (c) bilingual memo search links exact original source; (d) ambiguous voice transcription cannot auto-fail the learner; (e) localized infographic rerender keeps correct claim/region mapping. **Phase:** P0 Thai/English text, P1 localized visual/voice, P2 graded multilingual packs.

### Pass 28 — Reproducible visual teaching experiments and honest image comparisons (R28)

**Inspected baseline:** §§8.2–8.4 image comparison; J5 learner portraits; R04 generated visuals; R14 media transform chains. **Residual gap:** Comparing "short prompt vs detailed spec", "Skill vs no Skill" or "cheap vs expensive model" can inadvertently change seeds, prompts, providers, crops, costs and aspect ratios simultaneously. Visually compelling examples then teach unsupported causal conclusions even if every image has impeccable provenance.

**Correction (normative):**

1. A comparison advertised as an experiment SHALL have a versioned `TeachingExperimentPlan` recording learner hypothesis, target competency, `independent_variable`, intended controlled variables (model/provider/version, seed *where supported*, dimensions, prompt base, style, sampler, references, budget), generation/asset receipts, evaluation rubric and uncertainty. If a provider cannot control a variable, disclose it and limit causal language accordingly.
2. Aesthetics and educational outcomes are distinct: annotate objective constraints (resolution, aspect ratio, required object visibility) separately from subjective preferences (cinematic appeal, model styling). Tutor SHALL not declare that camera/lens jargon, longer prompts or a higher-priced model necessarily produce better images. Learner can choose a different creative objective.
3. Comparison UI must show originals and derivatives with clear labels, source/license/consent and rendering-variant references. Randomize left/right ordering when appropriate to reduce presentation bias in non-assessed preference exercises; counterbalance or review graded items to avoid answer leakage from annotation/color framing.
4. If media generation fails, is throttled, lacks rights or would exceed approved budget, use an eligible pre-reviewed example or a transparent uncontrolled demonstration; never fabricate a missing comparison result or apply a mismatched image to a learner's evidence state.
5. A Tutor-created infographic about image composition must link factual claims to vetted references or explicitly mark creative heuristics as illustrative; no manipulated image may be presented as a real photograph/experiment result without clear labeling.

**Tests R28:** (a) comparison with two simultaneously changed variables cannot claim that prompt detail alone caused improvement; (b) absent deterministic seed is disclosed; (c) cosmetic image style choices do not produce an objective mastery grade; (d) wrong variant/annotation is blocked; (e) media outage falls back without fabricated before/after evidence or double charge. **Phase:** P1 visuals; P0 if curated visual comparison ships at MVP.

### Pass 29 — Course catalog demand abuse, duplicate control and publication economics (R29)

**Inspected baseline:** §13 lifecycle; R07 consent-preserving promotion, R15 clean-room provenance, R20 cost controls. **Residual gap:** Aggregate course demand and easy micro-course publication are vulnerable to bot-generated requests, near-duplicate course flooding, copyrighted brand or teacher impersonation, synthetic reviews and misleading outcome promises. Privacy-safe aggregation alone does not guarantee catalog quality or fair discovery.

**Correction (normative):**

1. Catalog promotion SHALL separate `demand_candidate`, `curriculum_candidate`, `reviewed_release` and `marketplace_listing`. Raw request frequency, creator-paid distribution and engagement counts are not evidence of instructional effectiveness. Bound one actor's repeated requests/reviews and identify anomalous clusters before demand-based promotion; retain privacy-preserving audit summaries rather than individual private prompts.
2. Require canonical outcome/rubric similarity plus human-reviewable specialization rationale before publishing an apparent near-duplicate. A learner-created micro-course stays private by default; a similar public course can be offered as reuse without secretly importing the learner's personalized examples or memo content.
3. Enforce proof of ownership/licensing for uploaded media, screenshots, vendor branding and attributed instructor identities, with clear takedown/dispute/revision workflow. AI-generated endorsements, unverifiable certificates and unsupported "learn X in Y minutes" guarantees are barred from publication copy.
4. Ranking and recommendation interfaces SHALL distinguish sponsored/paid placement from pedagogical relevance and present a learner's stated objective, target competency and provider/version relevance as inspectable factors. Publish or price only via existing Spec 212/207/product governance; no separate Tutor storefront or unmetered promotion generation loops.
5. Catalog release needs a reviewer, immutable content hash, accessible alternatives, current sources where applicable, verified assessment path, rollback/unpublish pointer and a scheduled maintenance owner; content found inaccurate can stop new enrollments without deleting the audit trail of existing learner results.

**Tests R29:** (a) 100 bot-like repeated private course requests do not automatically create a top-ranked listing; (b) copied brand image without rights fails review; (c) close near-duplicate requires specialization rationale; (d) sponsored placement cannot masquerade as verified pedagogical ranking; (e) retracted public course stops new enrollment while preserving lawful previous learners' receipts. **Phase:** P2 promotion/marketplace; P1 reuse suggestions.

### Pass 30 — Collaborative practice, peer attribution and group privacy (R30)

**Inspected baseline:** §9.7 educator surfaces; R16 teacher grants and grading overrides; §14 privacy. **Residual gap:** The architecture permits teacher-led courses but does not define a safe group-learning activity in which learners co-edit a project, exchange peer feedback, or present shared artifacts without exposing unrelated chat, private Memo, individual diagnoses or giving every teammate the same mastery credit.

**Correction (normative):**

1. A collaborative activity SHALL declare `group_id`, `course_version`, learning goals, `participants[]`, purpose-limited `CollaborationGrant` per learner, approved asset scope, expiration, peer-feedback visibility, moderation/escalation path and safe withdrawal semantics. Enrollment in the same course is NOT consent to expose private Chat, personal Memo, learner competency state or unrelated project assets.
2. Shared practice work MUST retain per-contributor action provenance where technically available, an explicit group-output receipt, and separate **individual** explanation/transfer evidence when individual mastery is asserted. Group success alone cannot certify each member's independent ability. Peer feedback is formative, not an independent authoritative grader by default.
3. Support deletion/revocation of a learner's private contribution where legally and technically possible, and visibly indicate where shared derivative artifacts cannot be retroactively erased without affecting another person's rights; revoke new access, expire short-lived shared links and purge controlled caches where available, then re-evaluate downstream publication eligibility; previously downloaded copies cannot be recalled. Avoid promising instantaneous global deletion.
4. Prevent participant/role escalation, cross-tenant group invitations, public share-link guessability, prompt injection via peer-uploaded content and harassment within collaboration comments. Use existing Spec 220 grants, Feature 196 sessions and canonical jobs; classroom controls and reporting need applicable moderation and minor-safeguarding approvals.
5. Group editing must have optimistic versioning and explainable conflict resolution rather than silent overwrite. Live shared sessions, institutional export and external publication remain independent P2 gates; a private single-learner Tutor must never depend on them.

**Tests R30:** (a) teammate cannot open learner's private Memo or raw Chat; (b) group-generated app cannot grant every learner mastery; (c) revoked participant is denied all new shared-R2 fetches; prior signed URLs have bounded TTL/purge where supported, without claiming downloaded copies can be recalled; (d) simultaneous annotations produce a resolvable conflict, not lost edits; (e) underage collaboration stays disabled absent approved youth safeguards. **Phase:** P2 only.

### 25.1 Third-audit contract delta (illustrative additive payloads)

```yaml
PedagogicalCheckpoint:
  tenant_id: uuid
  enrollment_id: uuid
  session_ref: opaque
  session_generation: integer
  course_version: string
  goal_version: integer
  active_competency_refs: [opaque]
  question_intent_ref: opaque|null
  last_committed_turn_ref: opaque
  pending_learner_question_refs: [opaque]
  unresolved_confusion_refs: [opaque]
  assistance_so_far_ref: opaque|null
  side_quest_return_ref: opaque|null
  source_turn_range: [opaque]
  source_hash: sha256
  checkpoint_revision: integer
  compaction_generation: integer
ContributionManifest:
  practice_id: uuid
  learner_id: uuid
  practice_mode: OBSERVE|CO_EDIT|GUIDED_EXECUTION|INDEPENDENT|TRANSFER
  learner_action_refs: [opaque]
  ai_action_refs: [opaque]
  external_tool_receipt_refs: [opaque]
  prior_exposure_refs: [opaque]
  assessment_window_ref: opaque
CompetencyEquivalenceDecision:
  source_competency_ref: opaque
  target_competency_ref: opaque
  source_rubric_hash: sha256
  target_rubric_hash: sha256
  permitted_credit_kind: NONE|EXPLORATION|PREREQUISITE|MASTERY
  evidence_floor_ref: opaque
  reviewer_ref: opaque
  expires_at: timestamp|null
ReviewPlan:
  learner_id: uuid
  competency_ref: opaque
  next_review_window: timestamp_range|null
  review_item_exposure_refs: [opaque]
  notification_consent_ref: opaque|null
  policy_version: string
PedagogicalDecision:
  target_construct_ref: opaque
  selected_move: string
  expected_decision_value: string
  assistance_delta: string
  question_equivalence_state: INDEPENDENT|GUIDED|PRACTICE_ONLY|REVIEW_NEEDED
  policy_version: string
SubjectPackManifest:
  pack_id: string
  pack_version: string
  instruction_capabilities: [string]
  assessed_construct_refs: [opaque]
  verifier_conformance_receipt_refs: [opaque]
  locale_support: [string]
  risk_class: string
LocalizedAssessment:
  original_item_ref: opaque
  locale: string
  translation_revision: string
  construct_equivalence_ref: opaque|null
  independent_grading_eligible: boolean
TeachingExperimentPlan:
  target_competency_ref: opaque
  independent_variable: string
  controlled_variable_manifest_ref: opaque
  uncontrolled_variable_refs: [opaque]
  generation_receipt_refs: [opaque]
  causal_claim_eligible: boolean
CatalogPromotionReview:
  candidate_ref: opaque
  demand_anomaly_review_ref: opaque
  dedup_rationale_ref: opaque
  rights_review_ref: opaque
  content_reviewer_ref: opaque
  immutable_release_hash: sha256
CollaborationGrant:
  group_id: uuid
  learner_id: uuid
  allowed_resource_refs: [opaque]
  purpose: string
  expires_at: timestamp
  revocation_revision: integer
```

All payloads are **logical Tutor-domain contracts**. Existing Spec 220 policy, Spec 207 billing, Feature 196 conversation, Specs 229/233/241 memory, Specs 221/248 Skills and canonical worker_jobs retain authority. A field or proposed entity does not imply a deployed API or database migration.

### 25.2 Third-audit acceptance gates and phased ownership

| Gate | Executable acceptance fixture | Earliest safe phase | Owner/authority |
|---|---|---|---|
| R21 | Long-session compaction/provider-switch recovery with exact pending question, no resurrected consent or duplicate evidence | P0 text; P1 media | Tutor session projection / Feature 196 / Spec 241 |
| R22 | AI-generated artifact cannot grant independent practice mastery; live execution guarded by existing approval/sandbox | P0 attribution; P1 tools | Tutor evidence / Spec 220 / existing sandbox/jobs |
| R23 | Reviewed construct+rubric mapping; transferable credit revokes correctly when source evidence changes | P1, P0 if reuse enabled | Tutor domain / Spec 229 / Spec 220 |
| R24 | Due-review state and no reminder spam; learner controls spacing/notification | P1 | Tutor domain / Spec 238 notifications |
| R25 | Question rephrase construct canaries; deterministic selector fallback on regression | P0 | Pedagogy policy / educator review |
| R26 | Subject pack capability manifest and instruction-vs-grading conformance | P0 minimal; P2 full packs | Tutor pack adapters / independent verifier |
| R27 | Thai/English assessment translation and ASR equivalence fixtures | P0 text; P1 voice | Localization + subject-pack review |
| R28 | Controlled visual comparison cannot overclaim causal improvement | P1 (P0 if image compare enabled) | Visual pedagogy / media provider |
| R29 | Sybil demand, near-duplicate, rights and review gates | P1 reuse; P2 publication | Course Foundry / Spec 212 governance |
| R30 | Group work privacy, individual mastery and collaboration revocation | P2 | Tutor classroom / Spec 220 |

**Feature-flag containment:** `tutor.core` (R21,R22,R25,R26-min,R27-text), `tutor.review` (R24), `tutor.visual` (R28), `tutor.subject_*` (R26/27 per pack), `tutor.course_promotion` (R29), `tutor.collaboration` (R30) default OFF until corresponding contracts are tested. If `tutor.core` is OFF, existing Chat remains untouched. Failures in optional R28–R30 paths SHALL NOT silently disable a healthy text-only Tutor; failures in consent/authorization, canonical session state or independent mastery safety SHALL fail closed for the affected action.

### 25.3 Conformance fixtures and release evidence

- Maintain one machine-readable fixture per R21–R30 with `fixture_id`, initial canonical state, scenario events, expected Tutor response, expected state transition, denial/degradation path, owning existing authority, trace correlation and a link to CI or educator review evidence when executed.
- Include adversarial fixtures for injected course content, altered screenshot, transcript revision, stale/duplicate live turn, different tenant, deleted Memo in compaction cache, cloned assessment item, copied paid course, group grant revocation and vendor capability disappearance.
- Use synthetic or explicitly consented/minimized learner test data. Do not reuse real learner private Chats/media in test corpora, vendor prompts or public documentation without distinct authorization.
- Distinguish `SPECIFIED`, `AUTOMATED_TESTED`, `INDEPENDENT_REVIEWED`, `STAGING_VERIFIED`, `PRODUCTION_CERTIFIED` per fixture. This document review may mark the first only. Do not convert an absent test/receipt into a PASS.
- Before implementation: reconcile the actual SmartSpecPro canonical spec registry, active branches/PRs/worktrees and Spec 231 number collision; map proposal to deployed Feature 196/Spec 220/229/231/237/240/241/248 interfaces and current P213/Spec224 gates. No inferred implementation or admission override.

### 25.4 Updated residual risks and definition of done

**Third audit summary:** Ten additional distinct design-review passes R21–R30 provide mandatory corrective clauses and falsifiable tests. The consolidated document records **30 cumulative document-design passes** (R1.1 + R1.2 + R1.3). This is not a claim of thirty independent reviewers or executed integration tests.

**Open external blockers:** authoritative 249 ID reservation, real repository/API and migration mapping, independent grader calibration, actual learner outcome study, local legal/privacy/education review (particularly minors, copyrighted media and formal credentials), provider/voice/sandbox conformance, measured unit economics, staged restoration and production admission. No further document iteration alone closes these blockers. The first live slice remains a private, guarded text Tutor with one curated course and learner-owned notebook; optional features require their own release gates. If new implementation evidence conflicts with this document, create a reconciled versioned delta before execution rather than silently assuming deployed capabilities.


---

## 26. R1.4 normative amendment — fourth independent ten-pass gap audit (2026-09-25)

**Precedence:** This section is an additive normative correction to R1.0–R1.3. Where requirements overlap, apply the stricter requirement unless it would conflict with an existing canonical SmartAIHub authority; in that case implementation MUST stop for contract reconciliation rather than silently creating a second authority. These are ten additional **document/design review passes**, yielding **40 cumulative passes**. They are not executed tests, educational efficacy evidence, repository verification or production certification.

### Pass 31 — Misconception graph, contradiction handling and targeted remediation (NEW GAP R31)

**Finding:** Earlier revisions track competency evidence and confusion, but they do not explicitly model persistent *misconceptions*. A learner may repeatedly produce plausible but systematically wrong reasoning (for example, believing that adding camera/lens words always improves an AI image, or that every reusable task requires a new Skill). Treating this only as a low mastery score can cause the Tutor to repeat generic explanations without correcting the underlying mental model.

**Correction (normative):**

1. The Tutor SHALL maintain a versioned `MisconceptionHypothesis` separate from mastery. Each hypothesis MUST include the target construct, observed evidence refs, counter-evidence refs, confidence band, first/last observed time, remediation attempts and status `SUSPECTED|SUPPORTED|DISPROVED|RESOLVED|STALE`.
2. A single wrong answer MUST NOT create a persistent misconception. Promotion from `SUSPECTED` to `SUPPORTED` requires either repeated independent evidence or one high-information artifact showing the same causal error.
3. Remediation SHALL target the misconception with contrastive examples, counterexamples, prediction-before-feedback or a transfer task. Repeating the same explanation verbatim is not an acceptable remediation loop.
4. Mastery cannot be promoted while a directly conflicting `SUPPORTED` misconception remains unresolved unless an independent verifier records why the evidence is not actually contradictory.
5. Learners MUST be able to inspect a human-readable explanation such as “ระบบยังไม่แน่ใจว่าคุณเข้าใจประเด็น X เพราะ...” and challenge/correct the inference. Correction does not automatically mark mastery; it updates the hypothesis and requests evidence if needed.

**Tests R31:** repeated camera-metadata misconception is detected only after sufficient evidence; one accidental wrong answer does not persist; contrastive exercise resolves the hypothesis; contradictory mastery is blocked; learner correction is recorded without fabricating a pass.

### Pass 32 — Pedagogical deadlock detection and strategy escalation (NEW GAP R32)

**Finding:** Spec 249 allows question rephrasing, media changes and Tutor-mode switching, but it does not define when repeated adaptations have failed. A Tutor can trap a learner in an exhausting loop of simpler questions, choices and hints without making progress.

**Correction (normative):**

1. Every targeted learning episode SHALL track a bounded `PedagogicalAttemptBudget` by construct, including distinct strategy families already tried (rephrase, example, analogy, visual, worked example, partial task, choice, demonstration, retrieval of prerequisite).
2. After configurable repeated non-progress signals, the Tutor MUST enter `PEDAGOGICAL_DEADLOCK` rather than continue probing indefinitely. Non-progress includes repeated “ไม่เข้าใจ”, semantically equivalent wrong reasoning, repeated abandonment, or inability to start after progressively increased support.
3. Deadlock recovery SHALL choose among: inspect missing prerequisite, switch modality, demonstrate then ask for a micro-action, defer/bookmark, offer learner-controlled topic switch, or request human/peer assistance where such a role exists. It MUST NOT assume lack of intelligence, motivation, disability or attention from behavior alone.
4. Any escalation that materially lowers the tested construct (e.g. from independent explanation to recognition choice) SHALL mark resulting evidence as assisted/practice-only unless a later independent check succeeds.
5. The UI SHOULD surface “ลองอธิบายอีกแบบ / ดูตัวอย่าง / ข้ามไว้ก่อน / ให้ฉันลองทำเอง” so the learner can steer recovery rather than being trapped in an opaque adaptive loop.

**Tests R32:** three ineffective paraphrases trigger a different strategy; deadlock does not keep spending tokens indefinitely; switching to choices cannot grant independent mastery; learner-selected defer creates a resumable bookmark; no sensitive trait inference is emitted.

### Pass 33 — Metacognitive calibration: confidence is evidence, not mastery (NEW GAP R33)

**Finding:** The current learner model focuses on demonstrated competence but does not explicitly reconcile the learner's own confidence with observed evidence. Overconfident and underconfident learners need different teaching moves, yet confidence must not be treated as ability.

**Correction (normative):**

1. Tutor MAY ask lightweight self-assessment questions (`มั่นใจแค่ไหน`, `ส่วนไหนยังไม่แน่ใจ`) when pedagogically useful, but self-reported confidence SHALL be stored separately from competency state.
2. `confidence_high + evidence_weak` MAY trigger an explanation/transfer check; `confidence_low + evidence_strong` MAY trigger reinforcement and optional harder practice. Neither state changes mastery without evidence.
3. The system SHALL avoid personality or psychological labels derived from calibration patterns. Use task-local descriptions such as `confidence_evidence_mismatch` only.
4. The Tutor SHOULD teach metacognitive skills when appropriate: predicting expected result before execution, explaining why a method was chosen, and comparing predicted vs observed outcome.
5. Course analytics MUST NOT rank learners by confidence, verbosity or willingness to ask questions as a proxy for intelligence or competence.

**Tests R33:** confident but incorrect learner receives transfer check; underconfident correct learner is not forced to repeat basics; confidence never changes mastery by itself; no personality label is generated; prediction-vs-result artifact can be reviewed later.

### Pass 34 — Course/competency evolution, migration and grandfathering (NEW GAP R34)

**Finding:** R1.3 governs course-version goals and portability, but lacks a complete migration contract when the *canonical course itself* changes because tools, standards or pedagogy evolve. Existing learners must not silently gain/lose completion when a Skill/API or required competency changes.

**Correction (normative):**

1. Every published course version SHALL be immutable. Changes create a new `CourseVersion` with a machine-readable semantic diff across outcomes, competencies, prerequisite edges, required evidence, resources and assessments.
2. For enrolled learners, migration states SHALL be `STAY_CURRENT|MIGRATION_AVAILABLE|MIGRATION_REQUIRED|SUNSET_READ_ONLY`. Automatic migration is forbidden when mandatory outcomes, grading construct or privacy/rights requirements materially change.
3. A `CourseMigrationPlan` MUST classify prior evidence as `RETAIN|REVERIFY|INVALIDATE|NOT_APPLICABLE` per changed competency and explain the reason. Evidence shall never disappear; only its applicability to the new version may change.
4. If a vendor feature disappears (for example an API/agent behavior used by a lesson), the course may remain viewable historically but assessments depending on the removed behavior SHALL be blocked or revised under a new course version.
5. Completion badges/certificates, if ever enabled, MUST bind to the exact course/outcome version and date. A later course update cannot rewrite what the learner previously completed.

**Tests R34:** adding a mandatory Subagent competency does not silently revoke old completion; migration preview shows which evidence carries forward; removed vendor feature blocks only dependent assessment; rollback returns learner to prior version; prior completion record remains immutable.

### Pass 35 — Epistemic provenance and freshness for Tutor explanations (NEW GAP R35)

**Finding:** Spec 249 has resource freshness controls, but a Tutor can still synthesize an uncited explanation from model memory and present it as current fact—especially risky for fast-changing AI products, pricing, model capabilities, standards and software workflows.

**Correction (normative):**

1. Every Tutor claim used to teach a **time-sensitive or externally verifiable operational fact** SHALL carry an internal `KnowledgeClaim` provenance class: `COURSE_CURATED|RETRIEVED_PRIMARY|RETRIEVED_SECONDARY|MODEL_GENERAL_KNOWLEDGE|LEARNER_PROVIDED|INFERENCE|EXPERIMENT_OBSERVED`.
2. For vendor-specific current behavior, pricing, supported features, standards or API semantics, `MODEL_GENERAL_KNOWLEDGE` alone is insufficient for authoritative teaching. The Tutor SHALL retrieve an approved current source or explicitly label uncertainty and avoid assessing the learner against an unverified fact.
3. Generated infographics, summaries and Learning Artifacts MUST preserve the provenance/freshness status of their source claims; summarization cannot upgrade an unverified claim into a verified one.
4. When a previously taught claim becomes stale or contradicted by newer authoritative evidence, affected artifacts and assessments SHALL be linked to a revision notice; learner mastery of the underlying transferable concept may remain valid where appropriate.
5. The UI MAY use progressive disclosure rather than citation clutter, but a learner MUST be able to open “ที่มาของข้อมูล / อัปเดตเมื่อ” for substantive factual claims used in instruction.

**Tests R35:** stale Claude feature claim cannot be used for grading; primary-source refresh updates the lesson without rewriting historical artifact; infographic retains source lineage; conflicting sources produce uncertainty/review rather than fabricated certainty.

### Pass 36 — Generated exercise novelty, leakage resistance and construct coverage (NEW GAP R36)

**Finding:** Dynamic question generation can accidentally repeat examples the learner has already seen, leak answers through wording, or overfit to one superficial template while appearing adaptive.

**Correction (normative):**

1. Each generated assessment/practice item SHALL bind `construct_ref`, `difficulty_band`, `exposure_fingerprint`, `surface_template_family`, `answer_leakage_checks`, `generation_seed_or_receipt`, and whether it is eligible for `PRACTICE|DIAGNOSTIC|MASTERY|TRANSFER`.
2. Transfer/mastery checks MUST avoid near-duplicates of worked examples, prior answers, generated hints and the learner's own artifact unless the goal is explicitly revision/critique.
3. Item generation SHALL sample across approved *construct facets* rather than merely lexical variants. For example, Skill understanding may include parameterization, reuse decision, scope boundary and testability—not ten differently worded definitions.
4. If novelty/leakage cannot be established, downgrade the item to practice-only. Hidden benchmark/assessment material MUST remain outside ordinary Tutor retrieval and course-generation context.
5. Subject packs SHALL define a minimum coverage matrix before claiming a competency has been assessed comprehensively.

**Tests R36:** paraphrased worked example is rejected as transfer; choice wording that reveals the answer becomes practice-only; assessment covers required facets; hidden item is absent from Tutor retrieval; repeated generation does not inflate mastery evidence.

### Pass 37 — Notebook/Artifact truth status, edits and semantic drift (NEW GAP R37)

**Finding:** Learning Artifacts and Memo are central to the proposed UX, but the spec does not fully govern what happens when users edit a summary, paste a claim from elsewhere, or an AI regenerates a lecture note. A note can drift away from the source while later retrieval treats it as verified memory.

**Correction (normative):**

1. Notebook entities SHALL declare `AUTHORSHIP = LEARNER|TUTOR|JOINT|IMPORTED`, `TRUTH_STATUS = PERSONAL_NOTE|UNVERIFIED|SOURCE_LINKED|VERIFIED_COURSE_FACT|SUPERSEDED|DISPUTED`, and immutable source lineage where applicable.
2. Editing a source-linked AI summary SHALL create a new revision; it MUST NOT mutate the original source transcript or silently preserve `VERIFIED_COURSE_FACT` if the meaning changed.
3. Learner Memos MAY contain opinions, reminders or incorrect notes. Retrieval SHALL preserve their type and phrase them as learner-authored memory, not platform truth.
4. “Save to notes” from Chat/image/voice SHALL capture the exact source ref and optional selected range/frame. Screenshot crops/annotations must preserve parent media lineage.
5. When a course fact is superseded, notes remain visible historically but the UI SHOULD show a non-destructive “ข้อมูลนี้มีเวอร์ชันใหม่” link.

**Tests R37:** edited summary loses inherited verified status when semantics change; private Memo never becomes grading truth; saved screenshot points back to original upload; superseded note remains readable with update banner; deleting source follows existing retention/lineage policy.

### Pass 38 — Pedagogical context budget and selective memory assembly (NEW GAP R38)

**Finding:** Long-lived tutoring can accumulate huge conversation, artifact and notebook histories. Feeding everything back into every turn is expensive and can reduce answer quality, while over-aggressive compaction can erase the learning thread. R21 preserves checkpoints but does not define what should enter the active model context.

**Correction (normative):**

1. Each Tutor turn SHALL assemble a bounded `PedagogicalContextPack` rather than naïvely injecting full course/chat history. Minimum classes: active goal/outcome, current construct, last committed checkpoint, relevant misconception hypotheses, recent learner question, required source facts, applicable learner preferences and the smallest sufficient artifact excerpts.
2. Context selection SHALL be provenance-aware and ACL-scoped through existing memory/retrieval authorities. Personal Memo, unrelated projects and other courses are excluded unless explicitly relevant and permitted.
3. The runtime SHOULD prefer stable structured state + retrieval over repeated long summaries. Compaction summaries are evidence pointers, not authoritative replacements for original learner evidence.
4. A token/context budget SHALL reserve space for the learner's current message and Tutor response; optional historical examples/media must be dropped before mandatory goal/evidence state.
5. Context-pack decisions SHALL be observable in privacy-safe traces so regressions such as “Tutor forgot pending question” or “irrelevant old course polluted answer” can be tested.

**Tests R38:** 1,000-turn course resumes with correct pending goal using bounded context; unrelated course Memo is excluded; removing optional media does not drop misconception state; compaction summary cannot overwrite original evidence; context budget does not exceed configured ceiling without explicit escalation.

### Pass 39 — Multi-session arbitration and concurrent learner activity (NEW GAP R39)

**Finding:** R21 handles reconnect/compaction, but a learner may open the same course on phone and desktop, speak in Live Voice while editing notes elsewhere, or start two Tutor sessions. Without arbitration, evidence/progress can race and duplicate or contradict itself.

**Correction (normative):**

1. Enrollment progress SHALL use versioned optimistic concurrency or equivalent canonical sequencing. Multiple presentation sessions may exist, but mastery/progress mutations must commit against one authoritative enrollment revision.
2. Tutor sessions SHALL declare `session_role = PRIMARY_LEARNING|SECONDARY_VIEW|PRACTICE_BRANCH|REVIEW_BRANCH`. Concurrent independent branches may collect provisional evidence but cannot both silently advance the same mastery state without reconciliation.
3. Duplicate/near-duplicate learner actions arriving from reconnect or multiple devices SHALL be idempotently collapsed where semantically identical; genuinely different answers are preserved as separate evidence.
4. Memo edits use conflict-aware merge/version history; course-progress conflicts require deterministic reconciliation with learner-visible explanation if one branch supersedes another.
5. Live Voice interruption, text follow-up and image upload from another device MAY join the same session only through an authorized handoff token/session generation; otherwise create a linked branch rather than merging context implicitly.

**Tests R39:** phone+desktop answer race cannot double-award mastery; two different answers are both retained; Memo edit conflict is recoverable; authorized voice-to-text handoff preserves pending question; stale session generation cannot mutate canonical progress.

### Pass 40 — Course Foundry quality lifecycle, duplication control and safe sunset (NEW GAP R40)

**Finding:** R29 governs public promotion, but the lifecycle after promotion is incomplete. A reusable course can become low-quality, obsolete, duplicated, abandoned by its creator or unsafe after a dependency change. Marketplace/catalog growth needs maintenance and sunset rules, not publication-only governance.

**Correction (normative):**

1. Reusable/public courses SHALL have lifecycle `DRAFT|PRIVATE_VALIDATION|REVIEWED|PUBLISHED|DEGRADED|DEPRECATED|SUNSET_READ_ONLY|WITHDRAWN`, with owner, reviewer, freshness policy, supported locales/subject packs, dependency manifest and next-review window.
2. Catalog deduplication SHALL operate on outcomes/competency graph and target application—not title similarity alone. Near-duplicate courses MAY coexist when audience, depth, evidence standard or use case materially differs, but the distinction must be explicit.
3. Quality telemetry MAY include completion, abandonment, help/deadlock frequency, stale-resource rate, assessment disputes and learner feedback; none alone proves learning effectiveness. Promotion/demotion decisions require documented evidence and review.
4. If a course is deprecated/withdrawn, enrolled learners SHALL receive a transition option: finish current immutable version where safe, migrate to a reviewed successor, or export permitted notes/artifacts. Unsafe content can be blocked immediately while preserving audit/history under policy.
5. Creator deletion, account loss or marketplace delisting MUST NOT orphan canonical learner progress. Platform retention/rights policy determines which reviewed course version remains readable; private creator assets with revoked rights must not be silently copied into a successor.

**Tests R40:** obsolete vendor course becomes `DEGRADED` before removal; duplicate detector distinguishes beginner vs production-grade course; withdrawn course preserves permitted learner history; unsafe resource is blocked without erasing progress; successor migration requires explicit reviewed mapping.

### 26.1 Fourth-audit contract delta (illustrative additive payloads)

```yaml
MisconceptionHypothesis:
  hypothesis_id: uuid
  learner_id: uuid
  construct_ref: opaque
  statement: string
  evidence_refs: [opaque]
  counter_evidence_refs: [opaque]
  confidence_band: LOW|MEDIUM|HIGH
  status: SUSPECTED|SUPPORTED|DISPROVED|RESOLVED|STALE
  remediation_attempt_refs: [opaque]
  revision: integer
PedagogicalAttemptBudget:
  episode_id: uuid
  construct_ref: opaque
  strategies_used: [string]
  attempt_count: integer
  token_cost_ref: opaque|null
  state: ACTIVE|PEDAGOGICAL_DEADLOCK|DEFERRED|RESOLVED
ConfidenceObservation:
  learner_id: uuid
  construct_ref: opaque
  self_reported_confidence: LOW|MEDIUM|HIGH|UNKNOWN
  evidence_strength_ref: opaque
  mismatch_state: NONE|OVERCONFIDENT_SIGNAL|UNDERCONFIDENT_SIGNAL|UNKNOWN
CourseMigrationPlan:
  source_course_version: string
  target_course_version: string
  outcome_diff_ref: opaque
  competency_diff_ref: opaque
  evidence_actions: [RETAIN|REVERIFY|INVALIDATE|NOT_APPLICABLE]
  learner_consent_ref: opaque|null
  state: PREVIEW|ACCEPTED|REJECTED|APPLIED|REVERTED
KnowledgeClaim:
  claim_id: uuid
  provenance_class: COURSE_CURATED|RETRIEVED_PRIMARY|RETRIEVED_SECONDARY|MODEL_GENERAL_KNOWLEDGE|LEARNER_PROVIDED|INFERENCE|EXPERIMENT_OBSERVED
  source_refs: [opaque]
  freshness_checked_at: timestamp|null
  valid_until: timestamp|null
  uncertainty_state: VERIFIED|QUALIFIED|UNVERIFIED|CONFLICTED|STALE
GeneratedLearningItem:
  item_id: uuid
  construct_ref: opaque
  construct_facets: [string]
  difficulty_band: string
  exposure_fingerprint: sha256
  surface_template_family: string
  eligibility: PRACTICE|DIAGNOSTIC|MASTERY|TRANSFER
  leakage_state: CLEAR|SUSPECTED|CONFIRMED
NotebookEntryRevision:
  entry_id: uuid
  revision: integer
  authorship: LEARNER|TUTOR|JOINT|IMPORTED
  truth_status: PERSONAL_NOTE|UNVERIFIED|SOURCE_LINKED|VERIFIED_COURSE_FACT|SUPERSEDED|DISPUTED
  source_refs: [opaque]
  semantic_change: boolean
PedagogicalContextPack:
  session_ref: opaque
  enrollment_revision: integer
  active_goal_ref: opaque
  active_construct_refs: [opaque]
  checkpoint_ref: opaque
  misconception_refs: [opaque]
  learner_question_refs: [opaque]
  artifact_excerpt_refs: [opaque]
  source_fact_refs: [opaque]
  token_budget: integer
  assembly_policy_version: string
TutorSessionBranch:
  session_ref: opaque
  session_generation: integer
  role: PRIMARY_LEARNING|SECONDARY_VIEW|PRACTICE_BRANCH|REVIEW_BRANCH
  base_enrollment_revision: integer
  last_commit_revision: integer
  branch_state: ACTIVE|RECONCILE_REQUIRED|MERGED|CLOSED
CourseLifecycleRecord:
  course_ref: opaque
  course_version: string
  lifecycle: DRAFT|PRIVATE_VALIDATION|REVIEWED|PUBLISHED|DEGRADED|DEPRECATED|SUNSET_READ_ONLY|WITHDRAWN
  dependency_manifest_ref: opaque
  freshness_policy_ref: opaque
  next_review_at: timestamp|null
  successor_course_ref: opaque|null
```

These are Tutor-domain payloads/projections only. Authorization, identity, retrieval, persistent project/personal memory, durable execution, notifications, billing and external Skill/tool authorities remain with their existing SmartAIHub owners.

### 26.2 Fourth-audit acceptance gates (R31–R40)

| Gate | Blocking proof | Earliest phase |
|---|---|---|
| R31 Misconception model | repeated-evidence threshold, contradiction fence, targeted remediation fixture | P0 |
| R32 Deadlock recovery | bounded attempts, strategy-family switch, learner-controlled defer | P0 |
| R33 Metacognition | confidence separated from mastery; no trait inference | P0 |
| R34 Course migration | immutable versions, semantic diff, evidence carry-forward review | P0 if course updates enabled |
| R35 Epistemic provenance | current vendor facts source-backed; stale claim cannot grade learner | P0 for AI/vendor courses |
| R36 Item integrity | novelty/leakage/construct coverage fixtures | P0 |
| R37 Notebook truth state | authorship, revision, source binding and semantic-drift behavior | P0 |
| R38 Context budget | bounded context pack, irrelevant-memory exclusion, checkpoint retention | P0 |
| R39 Multi-session arbitration | concurrency/idempotency/reconciliation fixtures | P1 multi-device; P0 if simultaneous sessions allowed |
| R40 Course lifecycle | freshness review, degrade/deprecate/sunset/successor behavior | P1 reusable; P2 public catalog |

### 26.3 New conformance fixtures and release evidence

- Add machine-readable fixtures `R31`–`R40`; each SHALL declare initial state, event sequence, expected Tutor move, expected learner-state mutation, forbidden mutation, degradation behavior and owning authority.
- Add longitudinal fixtures: misconception reappears after 30 days; course changes while learner is mid-module; vendor fact becomes stale; learner opens two concurrent sessions; notebook summary is edited into a claim not supported by its source.
- Add token-economy fixtures proving `PedagogicalContextPack` remains bounded on long courses and that optional context is dropped before canonical learning state.
- Add educator review fixtures for misconception remediation, construct-facet coverage and migration semantics; automated checks alone do not certify pedagogical validity.
- Preserve exact status levels `SPECIFIED|AUTOMATED_TESTED|INDEPENDENT_REVIEWED|STAGING_VERIFIED|PRODUCTION_CERTIFIED`. R1.4 document work marks only `SPECIFIED` unless external receipts exist.

### 26.4 Fourth-audit summary and residual blockers

**Fourth audit outcome:** Ten additional distinct design passes R31–R40 identified actionable gaps and add mandatory corrective clauses plus falsifiable acceptance fixtures. Spec 249 therefore records **40 cumulative document-design passes**.

The largest remaining unknowns are no longer document completeness alone: actual repository/API/schema reconciliation; canonical Spec 249 number reservation; independent educator calibration; empirical learner outcome evidence; subject-specific verifier quality; legal/privacy review for minors and copyrighted learning media; measured cost/latency; real provider/voice/device conformance; staging restore and production admission. These SHALL remain explicit blockers. Repeating document audits cannot substitute for implementation and empirical validation.
