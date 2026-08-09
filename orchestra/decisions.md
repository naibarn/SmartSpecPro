[2026-08-07T12:56:30Z] DECISION: Treat this turn as a read-only diagnosis until the governing mismatch is proven.
  Context: The user reports a prompt-placement defect and asks where the system slips, but has not explicitly requested code changes.
  Alternatives considered: patch prompt wording immediately; rejected because the error may originate in upstream frame analysis or persisted scene metadata.

[2026-08-07T12:56:30Z] DECISION: Use bounded shell discovery because SocratiCode tools are unavailable.
  Context: Project instructions require SocratiCode first when active; no matching MCP tools were exposed.
  Alternatives considered: broad repository scan; rejected to preserve context and avoid unrelated dirty work.

[2026-08-07T13:00:00Z] DECISION: Diagnose the defect as a missing consistency gate, not as a missing portrait attachment.
  Context: The router and service attach the approved start frame plus ordered character portraits, and the skill explicitly requires image-derived positions. The code does not enforce equality between `frame_analysis` positions and generated prose.
  Alternatives considered: blame `requiredCharacterRefs` ordering; rejected because the observed failure is a prompt-text/frame-analysis contradiction after attachment, not evidence of a swapped portrait input.

[2026-08-07T13:15:00Z] DECISION: Hard-block explicit prompt/frame-analysis position contradictions after one corrective retry.
  Context: A warning-only path still allowed a known-wrong speaker anchor to be persisted and rendered. Missing generic anchors remain warning-only for weak-model compatibility.
  Alternatives considered: deterministic natural-language rewrite; rejected because replacing arbitrary position words can alter legitimate action text such as "turns right".

[2026-08-09T02:46:00.689Z] DECISION: Resolve canonical dialogue display names to the explicit Dual View roster keys before validation and prompt generation.
  Context: Episode 135 shot 4 had two valid frame assets and a ready Dual View contract, but canonical speakers used display names while dialogueSideMap used stable character keys.
  Alternatives considered: weaken or remove speaker-side validation; rejected because that would permit incorrect cuts and speaker-to-face assignments.

[2026-08-09T02:46:00.689Z] DECISION: Surface the backend PRECONDITION_FAILED message verbatim in the per-shot video-prompt action.
  Context: The client replaced every distinct Dual View precondition with a misleading missing-main-image toast.
  Alternatives considered: add another generic Dual View toast; rejected because it would continue hiding actionable validation failures.
[2026-08-09T03:46:59Z] DECISION: Treat each Dual View image as an independent coordinate space and require per-person view roles.
  Context: Runtime evidence showed a View 2 character analyzed as not visible in Image 1 but still assigned a global viewer-right anchor.
  Alternatives considered: prose-only clarification, removing positions entirely, and view-scoped structured analysis plus deterministic validation. The structured option preserves useful positions while preventing cross-view identity leakage.

[2026-08-09T03:46:59Z] DECISION: Do not reuse unscoped Dual View frame analysis as an authoritative correction lock.
  Context: Locking a position read from the wrong image would make the corrective retry repeat the defect.
  Alternatives considered: accept as warning, infer the view from prose, or require a valid explicit view role before a Dual View lock. The explicit-role gate is deterministic and backward compatible with single-view shots.

[2026-08-09T04:06:00Z] DECISION: Use Image 1 and Image 2 as the only prompt-facing frame identifiers.
  Context: Image numbering is a provider-neutral convention and avoids mixing attachment order with product-specific View terminology.
  Alternatives considered: keep compound labels such as VIEW 1 / START FRAME, or accept both forms. Rejected because multiple accepted labels weaken deterministic scope validation. Internal `view_role` values remain unchanged for persisted-data compatibility.
