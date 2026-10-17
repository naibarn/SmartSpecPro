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
