import pg from "pg";

const { Client } = pg;

const roomId = process.argv[2];

if (!roomId) {
  console.error("roomId is required");
  process.exit(1);
}

const client = new Client({
  host: "127.0.0.1",
  port: 5432,
  user: "smartspec",
  password: "smartspec123",
  database: "smartspec",
});

await client.connect();

try {
  const room = await client.query(
    'select id, "teamId", "goalPrompt", "roomType", "lastRunId", "createdAt" from team_rooms where id = $1',
    [roomId],
  );

  const runColumns = await client.query(
    "select column_name from information_schema.columns where table_name = 'team_runs' order by ordinal_position",
  );

  const itemColumns = await client.query(
    "select column_name from information_schema.columns where table_name = 'team_work_items' order by ordinal_position",
  );

  const lastRunId = room.rows[0]?.lastRunId ?? null;
  const runs = lastRunId
    ? await client.query('select * from team_runs where id = $1', [lastRunId])
    : { rows: [] };

  const items = await client.query(
    'select * from team_work_items where "roomId" = $1 order by id desc limit 20',
    [roomId],
  );

  const messages = await client.query(
    'select * from team_room_messages where "roomId" = $1 order by "createdAt" desc limit 20',
    [roomId],
  );

  const activity = await client.query(
    'select * from agent_activity_events where "runId" = $1 limit 50',
    [lastRunId],
  );

  console.log(
    JSON.stringify(
      {
        room: room.rows,
        runColumns: runColumns.rows,
        itemColumns: itemColumns.rows,
        runs: runs.rows,
        items: items.rows,
        messages: messages.rows,
        activity: activity.rows,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
