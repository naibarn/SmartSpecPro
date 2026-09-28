# Section 07 — UI/UX and Existing Flow Insertion

Keep the current six wizard steps to avoid breaking navigation and saved draft
state.

1. Rename “ลุคภาพประจำซีรีส์” to “แนวทางซีรีส์” and use one profile card picker.
2. Remove the separate editable format dropdown; show its derived summary in
   the selected profile and Review step.
3. Rename “สินค้าผูกเรื่อง” to “ข้อมูลและสื่ออ้างอิง”.
4. Keep the new step in the existing position, but render profile-specific
   source identity, default slots, custom slots, analysis, approval, and
   readiness areas.
5. Review step shows profile, missing required slots, approved media count,
   pending analysis, disclosure/fact warnings, and draft readiness.

For non-fiction/hybrid, the UI directs the user to prepare the source pack before
drafting. The existing Draft Quality QC/foundation step remains a separate
required gate; the user sees one combined readiness summary rather than two
competing blockers. The sequence is profile -> source pack -> source readiness
-> draft composition -> Draft QC -> review/create. The server enforces the
same rule so alternate entry points cannot bypass the workflow.

Because the wizard can compose a draft before the series shell is persisted,
the source hub owns a recoverable staged pack keyed by a server-issued
`draftSessionId`. The
Draft/Compose action is disabled or redirects to the source hub until readiness;
creating the series attaches the staged pack without asking the user to upload
or approve the same sources again.

The hub must provide explicit loading, empty, partial, analyzing, failed,
stale, blocked, draft-ready, and production-ready states. Empty/error states
explain the next action in creator language; raw IDs, provider URLs, JSON, and
internal QC labels stay in an advanced details drawer. Custom-slot lists use
pagination/virtualization or
incremental loading, and batch attach/analyze/reorder operations prevent an
“unlimited” pack from creating oversized requests.

Changing the profile shows the impact summary, preserves existing sources, and
requires explicit save/re-review. The Review step must display the selected
profile, source identity, required-slot progress, pending/failed analysis,
approval/fact/disclosure warnings, cost estimate, and the exact reason a draft
is blocked.

Legacy manual/inherited look notes appear as profile-owned advanced
customization. They can refine palette, wardrobe, camera, or production notes,
but cannot change the selected profile, evidence policy, or strict grounding
contract. The old `visualNarrativeEnabled` switch is derived and hidden as an
independent choice.

Upload progress, retry, cancel, archive confirmation, keyboard focus, labels,
Thai/English copy, and screen-reader status announcements are required for the
hub's asynchronous states. Destructive slot/archive actions require explicit
confirmation and must not remove managed media that is still used elsewhere.
