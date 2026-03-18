import app from "./app";
import { startAlerter } from "./lib/alerter.js";
import { ensureSystemUsersTable } from "./lib/airtable-users.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  startAlerter();
  ensureSystemUsersTable().catch((e) =>
    console.warn("[startup] ensureSystemUsersTable failed:", e instanceof Error ? e.message : e)
  );
});
