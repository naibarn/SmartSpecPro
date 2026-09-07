# Feature 178 — 10-Round Completeness Audit

Audit target: `spec.md`, `claude-spec.md`, `claude-plan.md`,
`claude-plan-tdd.md`, all five section files, research/interview records and
the existing Feature 176/177 contracts.

## Round results

| Round | Review lens | Result | Action |
|---:|---|---|---|
| 1 | Requirement trace against Feature 176/177 | Gap found | Added exact skill sequence, caption authorization and timing-origin admission rules. |
| 2 | Production-group data identity | Gap found | Resolved normalized group + dedicated group tables; added source-lineage hash, probes and revision pointers. |
| 3 | Web/Worker wire contract | Gap found | Kept existing durable job kinds with explicit group scope; added strict bounds, artifact refs and typed errors. |
| 4 | Worker durability/resource safety | Gap found | Added attempt ledger, unknown-outcome reconciliation, GPU lease/backpressure and ASR empty/partial handling. |
| 5 | Rights/license/provenance | Gap found | Added independent rights lifecycle, revocation propagation, model/license/attribution metadata and export revalidation. |
| 6 | Mix/export/QC truthfulness | Gap found | Added `web_drama_v1` default, frame/sample/dB QC thresholds and separate score-mix/QC artifacts. |
| 7 | Security/tenant/artifact access | Gap found | Added server-side ownership/flag gates, authorized artifact access, bounds/rate limits and secret/log rules. |
| 8 | Rollout/version compatibility | Gap found | Added `verticalDramaGroupNativeMusic3` default-off flag, contract-version canary and RTX 5060 Ti feasibility gate. |
| 9 | UI/UX and discoverability | Gap found | Ensured readiness heading remains visible when no group or flag is off; group/member scope and Worker dashboard boundaries are explicit. |
| 10 | Testing/operations/recovery | Gap found | Added focused commands, no-credit/runtime evidence split, metrics/alerts, deletion and rollback gates. |

## Final cross-check after fixes

- No `TODO`, `TBD`, unresolved “Open implementation decisions” or “Expected
  areas” remain in the Feature 178 planning set.
- Existing job types remain `episode_audio_analyze`,
  `minimax_music3_generate` and `episode_score_mix`; group identity is carried
  by the strict scope discriminator.
- Final-cut identity is explicitly persisted at
  `verticalDramaFfmpegAssemblyRunner.ts`, not inferred from a playback URL.
- `verticalDramaGroupNativeMusic3` gates mutations/admission but does not hide
  the explanatory Production-tab readiness heading.
- The implementation plan, TDD plan, sections, research, interview and
  synthesized spec contain the same resolved decisions.
- Real browser authentication, migration execution, GPU/MiniMax generation and
  production deployment remain implementation/runtime evidence gates; none are
  falsely marked as passed by this document audit.

## Conclusion

Ten review rounds were completed. All gaps found during the rounds were applied
to the planning artifacts. No known planning gap remains that requires another
specification change before implementation handoff.
