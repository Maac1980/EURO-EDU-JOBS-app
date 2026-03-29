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

// Serve eej-mobile static files if available
const eejMobileDist = "/home/runner/workspace/eej-mobile-HIDDEN/dist/public";

if (fs.existsSync(eejMobileDist)) {
  console.log("[static] serving eej-mobile from:", eejMobileDist);
  app.use("/eej-mobile", express.static(eejMobileDist));
  app.get("/eej-mobile/*splat", (_req, res) => {
    res.sendFile(path.join(eejMobileDist, "index.html"));
  });
}

export default app;
