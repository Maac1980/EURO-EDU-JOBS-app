import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./routes";
import { helmetMiddleware, globalRateLimit, apiRateLimit } from "./middlewares/security.js";
import { requestLogger } from "./lib/logger.js";
import { initSentry, sentryErrorHandler } from "./lib/sentry.js";

initSentry();

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
app.use(sentryErrorHandler());

export default app;
