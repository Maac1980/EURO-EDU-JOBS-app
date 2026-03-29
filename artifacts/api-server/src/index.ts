import { createServer } from "http";
import app from "./app.js";
import { startAlerter } from "./lib/alerter.js";
import { startRegulatoryMonitor } from "./routes/regulatory.js";
import { runMigrations, seedInitialData } from "./db/migrate.js";
import { initWebSocket } from "./lib/websocket.js";

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

async function start() {
  // Initialize database
  await runMigrations();
  await seedInitialData();

  const server = createServer(app);
  initWebSocket(server);

  server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    startAlerter();
    startRegulatoryMonitor();
  });
}

start().catch((e) => {
  console.error("Failed to start server:", e);
  process.exit(1);
});
