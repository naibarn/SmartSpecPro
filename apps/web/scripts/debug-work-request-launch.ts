import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

type Row = Record<string, unknown>;

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...valueParts] = trimmed.split("=");
    if (!key || process.env[key]) continue;
    process.env[key] = valueParts.join("=").replace(/^['"]|['"]$/g, "");
  }
}

function timestampForFile(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function query<T extends Row>(
  client: Client,
  text: string,
  values: unknown[] = []
): Promise<T[]> {
  const result = await client.query<T>(text, values);
  return result.rows;
}

function getString(row: Row | null | undefined, key: string): string | null {
  const value = row?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function asJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function tableSection(title: string, rows: Row[]): string {
  return [
    `## ${title}`,
    "",
    rows.length ? "```json" : "_No rows found._",
    rows.length ? asJson(rows) : "",
    rows.length ? "```" : "",
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(process.cwd(), "../..");
  loadEnvFile(path.join(process.cwd(), ".env"));
  loadEnvFile(path.join(repoRoot, ".env"));

  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgresql://smartspec:smartspec123@localhost:5432/smartspec";
  const tenantId =
    readArg("--tenant") ?? process.env.DEBUG_TENANT_ID ?? "tenant-ZCSKEM9s";
  const requestedRequestId = readArg("--request");
  const requestedCaseId = readArg("--case");
  const requestedRoomId = readArg("--room");
  const requestedRunId = readArg("--run");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const requestRows = requestedRunId || requestedRoomId
      ? await query<Row>(
          client,
          `
            select
              wr.id as request_id,
              r."tenantId" as tenant_id,
              wr.title,
              wr.objective,
              wr."currentState" as current_state,
              wr."defaultQueueId" as default_queue_id,
              wr."createdAt" as request_created_at,
              wc.id as case_id,
              wc."automationRunId" as automation_run_id,
              wc."automationDisposition" as automation_disposition,
              wc."automationSummary" as automation_summary,
              wc."ownerType" as case_owner_type,
              wc."ownerId" as case_owner_id,
              tr.id as team_run_id,
              tr."roomId" as room_id
            from team_runs tr
            join team_rooms r on r.id = tr."roomId"
            left join work_cases wc on wc."tenantId" = r."tenantId"
              and (
                wc.id = tr."constraintsJson"->>'workCaseId'
                or wc."automationRunId" = tr."constraintsJson"->>'workOsAutomationRunId'
              )
            left join work_requests wr on wr."tenantId" = r."tenantId"
              and wr.id = coalesce(tr."constraintsJson"->>'workRequestId', wc."requestId")
            where r."tenantId" = $1
              and ($2::text is null or tr.id = $2)
              and ($3::text is null or tr."roomId" = $3)
            order by tr."startedAt" desc nulls last
            limit 1
          `,
          [tenantId, requestedRunId, requestedRoomId]
        )
      : requestedRequestId
      ? await query<Row>(
          client,
          `
            select
              wr.id as request_id,
              wr."tenantId" as tenant_id,
              wr.title,
              wr.objective,
              wr."currentState" as current_state,
              wr."defaultQueueId" as default_queue_id,
              wr."createdAt" as request_created_at,
              wc.id as case_id,
              wc."automationRunId" as automation_run_id,
              wc."automationDisposition" as automation_disposition,
              wc."automationSummary" as automation_summary,
              wc."ownerType" as case_owner_type,
              wc."ownerId" as case_owner_id
            from work_requests wr
            left join work_cases wc on wc."requestId" = wr.id
            where wr.id = $1 and wr."tenantId" = $2
            limit 1
          `,
          [requestedRequestId, tenantId]
        )
      : requestedCaseId
        ? await query<Row>(
            client,
            `
              select
                wr.id as request_id,
                wr."tenantId" as tenant_id,
                wr.title,
                wr.objective,
                wr."currentState" as current_state,
                wr."defaultQueueId" as default_queue_id,
                wr."createdAt" as request_created_at,
                wc.id as case_id,
                wc."automationRunId" as automation_run_id,
                wc."automationDisposition" as automation_disposition,
                wc."automationSummary" as automation_summary,
                wc."ownerType" as case_owner_type,
                wc."ownerId" as case_owner_id
              from work_cases wc
              left join work_requests wr on wr.id = wc."requestId"
              where wc.id = $1 and wc."tenantId" = $2
              limit 1
            `,
            [requestedCaseId, tenantId]
          )
        : await query<Row>(
            client,
            `
              select
                wr.id as request_id,
                wr."tenantId" as tenant_id,
                wr.title,
                wr.objective,
                wr."currentState" as current_state,
                wr."defaultQueueId" as default_queue_id,
                wr."createdAt" as request_created_at,
                wc.id as case_id,
                wc."automationRunId" as automation_run_id,
                wc."automationDisposition" as automation_disposition,
                wc."automationSummary" as automation_summary,
                wc."ownerType" as case_owner_type,
                wc."ownerId" as case_owner_id
              from work_requests wr
              left join work_cases wc on wc."requestId" = wr.id
              where wr."tenantId" = $1
              order by wr."createdAt" desc
              limit 1
            `,
            [tenantId]
          );

    const request = requestRows[0] ?? null;
    if (!request && !requestedRunId && !requestedRoomId) {
      throw new Error(`No work request found for tenant ${tenantId}`);
    }

    const requestId = getString(request, "request_id");
    const caseId = getString(request, "case_id");
    const automationRunId = getString(request, "automation_run_id");
    const defaultQueueId = getString(request, "default_queue_id");

    const teams = await query<Row>(
      client,
      `
        select id, name, status, category, "ownerUserId" as owner_user_id,
               "createdAt" as created_at
        from assistant_teams
        where "tenantId" = $1
        order by
          case when status = 'active' then 0 when status = 'draft' then 1 else 2 end,
          "createdAt" desc
      `,
      [tenantId]
    );

    const teamRuns = await query<Row>(
      client,
      `
        select
          tr.id as team_run_id,
          tr.status as team_run_status,
          tr."teamId" as team_id,
          at.name as team_name,
          at.status as team_status,
          tr."roomId" as room_id,
          tr."startedAt" as started_at,
          tr."endedAt" as ended_at,
          tr."stopReason" as stop_reason,
          tr."runtimeCurrentStepKey" as runtime_current_step_key,
          tr."runtimeTerminalReason" as runtime_terminal_reason,
          tr."runtimeStateJson" as runtime_state_json,
          tr."constraintsJson" as constraints_json,
          r.status as room_status,
          r."roomType" as room_type,
          r.title as room_title,
          r.language as room_language,
          r."createdAt" as room_created_at
        from team_runs tr
        join team_rooms r on r.id = tr."roomId"
        left join assistant_teams at on at.id = tr."teamId"
        where r."tenantId" = $1
          and (
            tr."constraintsJson"->>'workRequestId' = $2
            or tr."constraintsJson"->>'workCaseId' = $3
            or tr."constraintsJson"->>'workOsAutomationRunId' = $4
            or tr.id = $5
            or tr."roomId" = $6
          )
        order by tr."startedAt" desc nulls last
      `,
      [
        tenantId,
        requestId ?? "",
        caseId ?? "",
        automationRunId ?? "",
        requestedRunId ?? "",
        requestedRoomId ?? "",
      ]
    );

    const targetRoomId = requestedRoomId ?? getString(teamRuns[0], "room_id");
    const targetRunId = requestedRunId ?? getString(teamRuns[0], "team_run_id");
    const targetTeamId =
      getString(teamRuns[0], "team_id") ??
      getString(request, "case_owner_id") ??
      defaultQueueId;

    const roomsForTargetTeam = targetTeamId
      ? await query<Row>(
          client,
          `
            select id, "teamId" as team_id, "roomType" as room_type, title,
                   status, "lastRunId" as last_run_id, language,
                   "createdAt" as created_at
            from team_rooms
            where "tenantId" = $1 and "teamId" = $2
            order by "createdAt" desc
            limit 10
          `,
          [tenantId, targetTeamId]
        )
      : [];

    const participants = targetRoomId
      ? await query<Row>(
          client,
          `
            select "participantType" as participant_type,
                   "participantUserId" as participant_user_id,
                   "participantAssistantId" as participant_assistant_id,
                   "roleInRoom" as role_in_room,
                   "lastViewedAt" as last_viewed_at
            from team_room_participants
            where "roomId" = $1
            order by "participantType", "roleInRoom"
          `,
          [targetRoomId]
        )
      : [];

    const workItems = targetRoomId
      ? await query<Row>(
          client,
          `
            select id, title, status, "sourceType" as source_type,
                   "sourceRef" as source_ref, "revisionVersion" as revision,
                   "createdAt" as created_at, "updatedAt" as updated_at
            from team_work_items
            where "tenantId" = $1 and "roomId" = $2
            order by "updatedAt" desc
            limit 20
          `,
          [tenantId, targetRoomId]
        )
      : [];

    const messages = targetRoomId
      ? await query<Row>(
          client,
          `
            select id, "senderType" as sender_type, "turnType" as turn_type,
                   visibility, left(content, 600) as content_preview,
                   "metadataJson" as metadata_json,
                   "createdAt" as created_at
            from team_room_messages
            where "roomId" = $1
            order by "createdAt" desc
            limit 30
          `,
          [targetRoomId]
        )
      : [];

    const traceEvents =
      targetRoomId || targetRunId
        ? await query<Row>(
            client,
            `
              select sequence, "eventName" as event_name,
                     "sourceComponent" as source_component,
                     severity, summary,
                     "redactedMetadataJson" as metadata_json,
                     "createdAt" as created_at
              from auto_team_trace_events
              where "tenantId" = $1
                and (
                  ($2::text is not null and "roomId" = $2)
                  or ($3::text is not null and "runId" = $3)
                )
              order by sequence desc
              limit 80
            `,
            [tenantId, targetRoomId, targetRunId]
          )
        : [];

    const stepMessages = messages
      .map((message) => {
        const metadata = message.metadata_json;
        const details =
          metadata &&
          typeof metadata === "object" &&
          !Array.isArray(metadata) &&
          (metadata as Record<string, unknown>).details &&
          typeof (metadata as Record<string, unknown>).details === "object"
            ? ((metadata as Record<string, unknown>).details as Record<string, unknown>)
            : null;
        if (!details) return null;
        return {
          message_id: message.id,
          created_at: message.created_at,
          message_type: details.messageType ?? (metadata as Record<string, unknown>).messageType,
          step_key: details.stepKey,
          step_title: details.stepTitle,
          step_index: details.stepIndex,
          step_count: details.stepCount,
          review_status: details.stepReviewStatus,
          next_action: details.stepNextAction,
          validation_issues: details.validationIssues,
          preview: message.content_preview,
        };
      })
      .filter(Boolean);

    const warnings: string[] = [];
    if (!caseId) warnings.push("Request has no linked work case.");
    if (!automationRunId) warnings.push("Case has no automationRunId.");
    if (!teamRuns.length) {
      warnings.push("No team_run was found for request/case/automationRunId.");
    }
    const latestRunState =
      teamRuns[0]?.runtime_state_json &&
      typeof teamRuns[0].runtime_state_json === "object" &&
      !Array.isArray(teamRuns[0].runtime_state_json)
        ? (teamRuns[0].runtime_state_json as Record<string, unknown>)
        : null;
    const stepValidation =
      latestRunState?.stepValidation &&
      typeof latestRunState.stepValidation === "object" &&
      !Array.isArray(latestRunState.stepValidation)
        ? (latestRunState.stepValidation as Record<string, unknown>)
        : null;
    if (teamRuns[0]?.team_run_status === "paused" && stepValidation) {
      warnings.push(
        `Run is paused at step ${String(stepValidation.stepKey ?? teamRuns[0].runtime_current_step_key ?? "unknown")} because validation failed: ${JSON.stringify(stepValidation.issues ?? [])}.`
      );
    }
    if (defaultQueueId && targetTeamId && defaultQueueId !== targetTeamId) {
      warnings.push(
        `Request defaultQueueId (${defaultQueueId}) differs from target team (${targetTeamId}).`
      );
    }
    const targetTeam = teams.find(team => team.id === targetTeamId);
    if (targetTeam?.status !== "active") {
      warnings.push(
        `Target team is ${String(targetTeam?.status ?? "unknown")}, not active.`
      );
    }
    const draftTeams = teams.filter(team => team.status === "draft");
    if (draftTeams.length) {
      warnings.push(
        `Draft teams are visible in the team UI and can be confused with the active target: ${draftTeams
          .map(team => `${team.name} (${team.id})`)
          .join(", ")}.`
      );
    }

    const report = {
      generatedAt: new Date().toISOString(),
      tenantId,
      request,
      teams,
      teamRuns,
      roomsForTargetTeam,
      participants,
      workItems,
      messages,
      stepMessages,
      traceEvents,
      warnings,
      expectedTeamUrl:
        targetTeamId && targetRoomId
          ? `/teams/${targetTeamId}?roomId=${targetRoomId}&panel=workflow`
          : null,
    };

    const outputDir = path.join(process.cwd(), "debug");
    fs.mkdirSync(outputDir, { recursive: true });
    const safeRequestId = requestId ?? "latest";
    const baseName = `work-request-launch-${safeRequestId}-${timestampForFile()}`;
    const jsonPath = path.join(outputDir, `${baseName}.json`);
    const mdPath = path.join(outputDir, `${baseName}.md`);
    fs.writeFileSync(jsonPath, asJson(report));
    fs.writeFileSync(
      mdPath,
      [
        `# Work Request Launch Debug`,
        "",
        `Generated: ${report.generatedAt}`,
        `Tenant: ${tenantId}`,
        `Request: ${requestId ?? "n/a"}`,
        `Case: ${caseId ?? "n/a"}`,
        `Automation run: ${automationRunId ?? "n/a"}`,
        `Expected team URL: ${report.expectedTeamUrl ?? "n/a"}`,
        "",
        "## Warnings",
        "",
        warnings.length ? warnings.map(item => `- ${item}`).join("\n") : "_No warnings._",
        "",
        tableSection("Request And Case", requestRows),
        tableSection("Teams", teams),
        tableSection("Team Runs", teamRuns),
        tableSection("Rooms For Target Team", roomsForTargetTeam),
        tableSection("Participants", participants),
        tableSection("Work Items", workItems),
        tableSection("Step Messages", stepMessages as Row[]),
        tableSection("Trace Events", traceEvents),
        tableSection("Latest Messages", messages),
      ].join("\n")
    );

    console.log(`Debug report written:\n- ${jsonPath}\n- ${mdPath}`);
    if (warnings.length) {
      console.log("\nWarnings:");
      for (const warning of warnings) console.log(`- ${warning}`);
    }
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
