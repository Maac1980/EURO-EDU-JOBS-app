import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import router from "./routes";

const app: Express = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", router);

const eejMobileDist = "/home/runner/workspace/eej-mobile-HIDDEN/dist/public";

if (fs.existsSync(eejMobileDist)) {
  console.log("[static] serving eej-mobile from:", eejMobileDist);
  app.use("/eej-mobile", express.static(eejMobileDist));
  app.get("/eej-mobile/*splat", (_req, res) => {
    res.sendFile(path.join(eejMobileDist, "index.html"));
  });
} else {
  console.warn("[static] eej-mobile dist NOT found:", eejMobileDist);
}

export default app;
