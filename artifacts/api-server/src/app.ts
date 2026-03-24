import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", router);

const dashboardDist = path.resolve(__dirname, "../../../artifacts/apatris-dashboard/dist/public");
const eejMobileDist = path.resolve(__dirname, "../../../eej-mobile-HIDDEN/dist/public");

app.use("/eej-mobile", express.static(eejMobileDist));
app.get("/eej-mobile/*", (_req, res) => {
  res.sendFile(path.join(eejMobileDist, "index.html"));
});

app.use(express.static(dashboardDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(dashboardDist, "index.html"));
});

export default app;
