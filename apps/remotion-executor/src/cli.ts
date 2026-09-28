import { connect, connectionStatus, logout } from "./agent.js";
import { doctor } from "./doctor.js";
import { runWorker } from "./worker.js";

const command = process.argv[2] ?? "doctor";
if (command === "doctor") {
  const result = await doctor();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ready") process.exitCode = 2;
} else if (command === "connect") {
  await connect();
} else if (command === "status") {
  const [readiness, connection] = await Promise.all([doctor(), connectionStatus()]);
  console.log(JSON.stringify({ readiness, connection }, null, 2));
  if (readiness.status !== "ready" || !connection.connected) process.exitCode = 2;
} else if (command === "logout") {
  await logout();
} else if (command === "run") {
  await runWorker();
} else if (command === "setup") {
  await connect();
  await runWorker();
} else if (command === "start") {
  await runWorker();
} else {
  throw new Error(`Unknown command: ${command}`);
}
