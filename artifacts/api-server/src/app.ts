import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import router from "./routes/index.js";

const app: Express = express();

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "https://eej-jobs-api.fly.dev,https://eej-jobs.app,https://admin.eej-jobs.app,http://localhost:5173,http://localhost:3000")
  .split(",").map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / server-to-server
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
app.use("/api", limiter);

// API routes
app.use("/api", router);

// No-cache for HTML so browsers always fetch fresh builds
app.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  }
  next();
});

// ── Static file serving for dashboard and mobile app ─────────────────────
const cwd = process.cwd();
console.log("[static] cwd:", cwd, "__dirname:", __dirname);

// EEJ Mobile app paths
const eejMobilePaths = [
  "/app/eej-mobile-HIDDEN/dist/public",
  "/app/artifacts/eej-mobile/dist/public",
  path.join(cwd, "eej-mobile-HIDDEN/dist/public"),
  path.join(cwd, "artifacts/eej-mobile/dist/public"),
  path.resolve(__dirname, "../../eej-mobile/dist/public"),
  path.resolve(__dirname, "../../../eej-mobile-HIDDEN/dist/public"),
  path.resolve(__dirname, "../../../artifacts/eej-mobile/dist/public"),
  "/home/runner/workspace/eej-mobile-HIDDEN/dist/public",
  "/home/runner/workspace/artifacts/eej-mobile/dist/public",
];

// EEJ Dashboard paths
const dashboardPaths = [
  "/app/artifacts/apatris-dashboard/dist/public",
  path.join(cwd, "artifacts/apatris-dashboard/dist/public"),
  path.resolve(__dirname, "../../apatris-dashboard/dist/public"),
  path.resolve(__dirname, "../../../artifacts/apatris-dashboard/dist/public"),
  "/home/runner/workspace/artifacts/apatris-dashboard/dist/public",
];

console.log("[static] checking eej-mobile paths:", eejMobilePaths.map(p => `${p} → ${fs.existsSync(p)}`));
console.log("[static] checking dashboard paths:", dashboardPaths.map(p => `${p} → ${fs.existsSync(p)}`));

const eejMobileDist = eejMobilePaths.find((p) => fs.existsSync(p));
const dashDist = dashboardPaths.find((p) => fs.existsSync(p));

// 1. Serve mobile app at /eej-mobile/ AND its assets at /assets/
if (eejMobileDist) {
  console.log("[static] serving eej-mobile from:", eejMobileDist);
  app.use("/eej-mobile", express.static(eejMobileDist));

  // Mobile Vite build references /assets/* (root-relative) — serve them
  // before the dashboard catch-all can intercept
  const mobileAssetsDir = path.join(eejMobileDist, "assets");
  if (fs.existsSync(mobileAssetsDir)) {
    app.use("/assets", express.static(mobileAssetsDir));
    console.log("[static] serving mobile /assets from:", mobileAssetsDir);
  }

  app.get("/eej-mobile/{*splat}", (_req, res) => {
    res.sendFile(path.join(eejMobileDist, "index.html"));
  });

  // Serve /apply page from mobile app
  const applyPage = path.join(eejMobileDist, "apply.html");
  if (fs.existsSync(applyPage)) {
    app.get("/apply", (_req, res) => res.sendFile(applyPage));
  }
} else {
  console.warn("[static] eej-mobile dist NOT FOUND in any path:", eejMobilePaths);
}

// 2. Serve dashboard at root /
if (dashDist) {
  console.log("[static] dashboard from:", dashDist);
  app.use("/", express.static(dashDist));
  app.get("/{*splat}", (_req, res, next) => {
    if (!_req.path.startsWith("/api") && !_req.path.startsWith("/eej-mobile") && !_req.path.startsWith("/apply") && !_req.path.match(/\.(js|css|png|svg|ico|json|woff|woff2)$/)) {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
      res.sendFile(path.join(dashDist, "index.html"));
    } else {
      next();
    }
  });
} else if (eejMobileDist) {
  // Fallback: serve mobile app at root if no dashboard found
  console.log("[static] no dashboard found, serving eej-mobile at root");
  app.use("/", express.static(eejMobileDist));
  app.get("/{*splat}", (_req, res, next) => {
    if (!_req.path.startsWith("/api") && !_req.path.startsWith("/eej-mobile") && !_req.path.match(/\.(js|css|png|svg|ico|json|woff|woff2)$/)) {
      res.sendFile(path.join(eejMobileDist, "index.html"));
    } else {
      next();
    }
  });
} else {
  console.warn("[static] No dashboard or mobile dist found");
}

export default app;
