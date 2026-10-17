# Task Control — live acceptance readiness handoff

Latest mission owner: /root. WorkUnit: TASK_CONTROL_NATIVE_READ_ACCEPTANCE_PREREQUISITE (includes TASK_CONTROL_CANONICAL_ACTIVITY_TIMESTAMP_REPAIR). Workspace:workspace:a7049b12-41ae-4142-b300-6c199de9720d, registered task task-control-live-acceptance-20261017; branchcodex/task-control-live-readiness-evidence-20261017. Original source 4b618cf901df7405009b11f6783dfcd3ebce0187; implementation598fba351665e5372a5bf5c6d82cfc9e505ad4d9; verified canonical source f250326711d7d170e575d03b7c358f74891dfecc. PR:https://github.com/naibarn/SmartSpecPro/pull/1036. Job/Run:null: direct scoped implementation/testing; no new SDK or canonical-job dispatch.

## COMPLETED

- Fixed Task Detail latest known activity using existing started/heartbeat/finished timestamps. Removed nonexistent worker_jobs.updatedAt access. No schema change or migration. Native regression failed before the fix and passed after the fix. This timestamp is not a complete rowrevision/eventhistory.
- Six native PostgreSQL cases verify tenant/owner boundaries, bounded paging, cursor/filter/principal/role/expiry, current persisted ownership after snapshot creation, unknown Goal/usage, read-only connections and no monitoring mutations. PostgreSQL itself enforces read-only service connections; owner cluster cleanup asserts rootabsent. Caller scopes and signinginputs are TEST_ONLY, not live authentication or grants.
- Post-integration41/41 in4files, including9SPEC224 modeladmission cases; independentLuna-requested read-only review foundno materialbugs. Earlier DBsetup timeout did not recur; no timeoutincrease or unrelatedrepair was needed. No Pilot rerun.
- Verified mergedPR1014/1018/1028/1029, canonical index/queue and8requestedSPEC ledgers. Respect PR961 preview/SPEC224manifest ownership and PR684 context.ts/db.ts ownership. Shared dirtyprimary and all originalJobs/grants preserved.

## PARTIAL

SPEC224 and TaskControl277/294 live acceptance remain NOT_ACCEPTED. Five selected OBS rows receive only scoped PARTIAL evidence. SPEC088 comparison, full SPEC161/268 and302/304 acceptance remain open. Previously verified Pilot remains COMPLETE only within its bounded scope:6codingWorkUnits plus validation-only evidence at retained3190569a; historical295+5 evidence is not repeated or recast aslive.

## BLOCKED

1. WAITING_EXTERNAL_AUTHORITY — SPEC224 protected Runner path. Read-only configuredcontrolplane inventory shows15Runner rows,0freshheartbeats,0unexpiredcapabilities,0requiredprofile and0approvedunrevokedrecoverygrant candidates. No newauthority was manufactured. Resume only when the existing registration/owner-approval path supplies a trustedfreshRunner/capability/profile and a durable protected-start/recovery grant canonically validated against exactsource/workspace/tenant/operations/budget/lease/fence/expiry/revocation. Owner:existing authenticatedtenant-owner and runtime/Runnermaintainer.
2. WAITING_LIVE_RUNTIME — authenticated TaskControl API→Web acceptance. Existinglocalwebhealth returns200, but canonical /trpc/workerJobs.observability returns404NOT_FOUND. DB/JWTconfig exists; shellabsence was not treated asabsence ofallruntimeconfiguration. No approvedUATsession/target/source-serving receipt isavailable. Thelistener'scwd is thedirtyprimarycheckout; source proof andprod/devisolation remainunverified. Resume on an existingauthorized isolatednonproduction target servingtheverifiedSHA withcurrentprincipal/session viaexistingauthbroker. Do not forge login fromJWTsecret, reconfigure sharedservice, or treatfixtureauth aslive.
3. WAITING_EXTERNAL_AUTHORITY — SPEC302durablereceipt migration/schemaowner and304trustedissuer/origin-route target remain governed by their existing authorization. PR961/684 owners retained; no productionDB writes or migrations.

## UNKNOWN

TrustedcanonicalGoalproducer and immutableprojectionhistory are not linked. TargetedNode/Python/schema search finds no usable producer; jobmetadata, a selfdeclared digest or unrelatedagent-registrybaseline cannotcreate one. This is an evidence/source contract gap, not automatically an external-approvalblocker. Resume sourcebinding only from existing authoritative scope/Goal/version/digest/currentpermission contracts; do not create a newGoalstore or infer parentcompletion. Fullhelper/quota/funding coverage, providereffectivehostmodel, assistant/helperusage, monetarysettlement andshared host production/development isolation remain UNKNOWN.

## Evidence and resume

Machine-readable source/hashes/tests/review/blockers/resumeconditions:workunit.json live_acceptance_continuation and evidence/live-acceptance-readiness-20261017.json. Logs/resources, red regression, actualPRmerge, read-only inventory, routeprobe and8-SPECcanonical audit are retained beside it. No secrets/rawleasetokens retained.

Nextaction: finish protected promotion of this evidence checkpoint, then recheck canonicalpredicate before any live dispatch. At resume, reconcile latestorigin/main and theexistingJob/Run/lease/grant first; no duplicatedispatch or borrowingexpiredgrants. Safe ready prerequisites in this boundedmission are complete; fullLiveAcceptance and full SPEC/project closure are not claimed. Broader161/268backlog remains independent, with exactnextcandidates in their canonicalledgers.

Primaryworkspace /mnt/SmartSpecDev/projects/SmartSpecPro remains separatelydirty and preserved; it is not theverified implementationruntime. SharedDBinspection ran in read-only transactions; all testDDL/writes used privateowner-marked ephemeralclusters. No paidprovider orSDKdispatch occurred. Historical74SDKcalls/5,771,368tokens were notadded orrewritten; currentassistant/helperusage andbilling remainunknown. Scout initially hit hostcapacity; afterreportedresettime one same-modelreviewretry completed. No model/quota policychanged.


## Runner/Codex readiness repair — 2026-10-17

WorkUnit `RUNNER_CODEX_READINESS_REPAIR`, owner `/root`, existing workspace/session ownership retained. Implementation `97a265b1fab4d747aa809a6424acc8a69554c2d7` (initial Runner engine repair `7919c19ce22b9e751c87735dcf9dea58e1f79de3`) from original `e25f5bc80771dd07c74ee9bc14a41b304fd5bf4d`, reconciled base `a70f84651ffbaa8be385d90da5710c514a0b72ec`; branch `codex/runner-codex-readiness-repair-20261017`. Job/Run null; no command dispatch or new authority.

Verified: 193/193 Runner library tests and 44/44 focused web tests; read-only independent Luna-requested review found no material issue. Native Windows build is pending against the integrated SHA. Source, commands, resources, actual setup failures repaired, artifact hashes, deployment audit, identity corrections and unresolved runtime predicates are in `evidence/runner-readiness-repair-20261017.json`.

The Windows desktop screenshot demonstrates a real local Codex response. Its approved pairing uses a different active session and device key/fingerprint from the expired Linux enrollment despite shared placeholder IDs. Previous Linux credential/service findings cannot be applied to that Windows instance. Browser approval timestamp exactly matches registry lastSeen; this was registration, not proven heartbeat. The old snapshot is from October 10. `activeSessionId` is control/pairing identity, not an execution-session foreign key. Live web Runner sources match release HEAD `ccd4cd11c664cf81cc54fe1287c60ce7f5c36978`; its workerJobs source lacks observability, explaining the route absence without blaming the dirty primary.

Implemented unique new-install IDs/reuse of approved identity, new-session invalidation and honest read freshness, authenticated real-Codex readiness reference with policy still pending, non-executing desktop capability sync after pairing/tool verification, and native engine build version propagation. Re-approve does not inherit readiness; an identical session bind preserves facts. No provider policy or Recovery Grant is granted by these changes.

Resume: verify protected merge, build the integrated SHA using the existing Windows workflow, then install via an existing authorized Windows access channel (currently not present in this Linux session; owner asked asynchronously for existing access details). Keep approved work running only after current authenticated publication and applicable workspace/lease/grant checks. No borrowed Windows credentials, Linux re-pair takeover, duplicate job, production database write, shared web restart or full SPEC closure. SPEC-224 and parent project remain NOT_ACCEPTED.

Codex-only readiness correction: an authenticated, healthy, installed/configured Codex adapter with a nonempty session-bound readiness reference now marks capability readiness even if browser is unavailable. Fresh snapshot/session checks and all command/job/provider/Recovery Grant gates still apply. Native workflow post-integration build is the next obligation; protected PR #1048 is the integration path.
