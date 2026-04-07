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

    // Feature 3: Daily legal scan at 7am
    import("node-cron").then(cron => {
      cron.default.schedule(process.env.LEGAL_SCAN_CRON ?? "0 7 * * *", () => {
        import("./services/platform-features.js").then(m => m.runDailyLegalScan()).catch(console.error);
      });
      console.log("[cron] Daily legal scan scheduled: 7:00 AM");
    }).catch(() => console.warn("[cron] node-cron not available"));
  });
}

start().catch((e) => {
  console.error("Failed to start server:", e);
  process.exit(1);
});
