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
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

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

// Serve eej-mobile static files — check multiple possible locations
const eejMobilePaths = [
  path.join(process.cwd(), "eej-mobile-HIDDEN/dist/public"),
  "/home/runner/workspace/eej-mobile-HIDDEN/dist/public",
  path.join(process.cwd(), "artifacts/eej-mobile/dist/public"),
  "/home/runner/workspace/artifacts/eej-mobile/dist/public",
];
const eejMobileDist = eejMobilePaths.find((p) => fs.existsSync(p));

if (eejMobileDist) {
  console.log("[static] serving eej-mobile from:", eejMobileDist);
  app.use("/eej-mobile", express.static(eejMobileDist));
  app.get("/eej-mobile/*splat", (_req, res) => {
    res.sendFile(path.join(eejMobileDist, "index.html"));
  });
} else {
  console.warn("[static] eej-mobile dist NOT FOUND in any path:", eejMobilePaths);
}

// Serve public apply form at /apply
if (eejMobileDist) {
  const applyPage = path.join(eejMobileDist, "apply.html");
  if (fs.existsSync(applyPage)) {
    app.get("/apply", (_req, res) => res.sendFile(applyPage));
  }
}

// Also serve from root / so the app loads without /eej-mobile prefix
if (eejMobileDist) {
  app.use("/", express.static(eejMobileDist));
  app.get("/{*splat}", (_req, res, next) => {
    // SPA fallback — serve index.html for navigation routes only, not static assets
    if (!_req.path.startsWith("/api") && !_req.path.startsWith("/assets/") && !_req.path.match(/\.(js|css|png|svg|ico|json|woff|woff2)$/)) {
      res.sendFile(path.join(eejMobileDist, "index.html"));
    } else {
      next();
    }
  });
}

export default app;
