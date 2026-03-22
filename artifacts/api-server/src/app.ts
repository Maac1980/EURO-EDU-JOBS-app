
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./routes/index.js";
import { helmetMiddleware, globalRateLimit, apiRateLimit } from "./middlewares/security.js";
import { requestLogger } from "./lib/logger.js";

const app: Express = express();

app.use(helmetMiddleware);
app.use(globalRateLimit);
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);
app.use("/api", apiRateLimit, router);

export default app;
