import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { csrfProtection } from "./middleware/csrf.middleware.js";
import { errorHandlerMiddleware } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { apiV1Router } from "./routes/index.js";
import { webhookRouter } from "./routes/webhook.router.js";
import { generalRateLimiter } from "./middleware/rate-limit.middleware.js";

export function createApp(): Express {
  const app = express();

  // Suppress express banner header
  app.disable("x-powered-by");

  // Explicit proxy configuration
  app.set("trust proxy", env.TRUST_PROXY);

  // Security headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      hsts: {
        maxAge: 63072000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      permittedCrossDomainPolicies: { permittedPolicies: "none" },
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(cookieParser());

  // Mount Stripe webhook with raw body buffer before standard JSON parsing
  app.use(
    "/api/v1/billing/webhook",
    express.raw({ type: "application/json" }),
    webhookRouter,
  );

  app.use(
    express.json({
      limit: "1mb",
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(requestIdMiddleware);
  app.use(csrfProtection);

  // General rate limiter for api traffic (skipping health probes)
  app.use("/api/v1", (req, res, next) => {
    if (req.path === "/health" || req.path === "/ready") {
      return next();
    }
    return generalRateLimiter(req, res, next);
  });

  // Application routes
  app.use("/api/v1", apiV1Router);

  // Catch-all for undefined routes
  app.use(notFoundHandler);

  // Centralized error handler
  app.use(errorHandlerMiddleware);

  return app;
}
