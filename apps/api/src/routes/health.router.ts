import { Router, type Request, type Response } from "express";
import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCode,
  type HealthData,
  type ReadinessData,
} from "@workspace/contracts";
import { checkDatabaseConnection } from "@workspace/database";

export const healthRouter: Router = Router();

const startTime = Date.now();

/**
 * Liveness probe: returns 200 OK if the process is responsive.
 */
healthRouter.get("/health", (req: Request, res: Response) => {
  const data: HealthData = {
    status: "ok",
    service: "workspace-api",
    version: "0.1.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  };

  res.status(200).json(createSuccessResponse(data, req.id));
});

/**
 * Readiness probe: checks downstream dependencies (e.g., PostgreSQL).
 * Returns 200 if all critical systems are operational, otherwise 503.
 */
healthRouter.get("/ready", async (req: Request, res: Response) => {
  const dbHealth = await checkDatabaseConnection();

  const isReady = dbHealth.ok;

  const readinessData: ReadinessData = {
    status: isReady ? "ready" : "not_ready",
    service: "workspace-api",
    version: "0.1.0",
    checks: {
      database: {
        status: dbHealth.ok ? "connected" : "disconnected",
        ...(dbHealth.latencyMs !== undefined
          ? { latencyMs: dbHealth.latencyMs }
          : {}),
        ...(dbHealth.error ? { message: dbHealth.error } : {}),
      },
    },
    timestamp: new Date().toISOString(),
  };

  if (!isReady) {
    res.status(503).json(
      createErrorResponse(
        {
          code: ErrorCode.SERVICE_UNAVAILABLE,
          message: "Service is not ready to receive traffic",
          details: readinessData,
        },
        req.id,
      ),
    );
    return;
  }

  res.status(200).json(createSuccessResponse(readinessData, req.id));
});
