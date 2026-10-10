import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { errorHandlerMiddleware } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { apiV1Router } from "./routes/index.js";

export function createApp(): Express {
  const app = express();

  // Security and baseline middleware
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestIdMiddleware);

  // Application routes
  app.use("/api/v1", apiV1Router);

  // Catch-all for undefined routes
  app.use(notFoundHandler);

  // Centralized error handler
  app.use(errorHandlerMiddleware);

  return app;
}
