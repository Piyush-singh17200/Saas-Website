import type { Request, Response, NextFunction } from "express";
import { ErrorCode, createErrorResponse } from "@workspace/contracts";
import {
  verifyApiKey,
  hasScope,
  type ValidatedApiKey,
} from "../services/api-key.service.js";
import { validateSession } from "../services/session.service.js";
import { env } from "../config/env.js";
import { prisma } from "@workspace/database";
import { logger } from "../lib/logger.js";

declare global {
  namespace Express {
    interface Request {
      apiKey?: ValidatedApiKey;
      authType?: "api_key" | "session";
    }
  }
}

function getParam(param: string | string[] | undefined): string | undefined {
  if (Array.isArray(param)) return param[0];
  return param;
}

/**
 * Universal authentication middleware supporting both API keys and user sessions.
 * Prioritizes Bearer API keys (`wsp_live_...`) when provided.
 * Derives organization scope directly from the authenticated entity.
 */
export async function requireDeveloperOrSessionAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : undefined;

  // 1. Check for API key format
  if (token && token.startsWith("wsp_live_")) {
    const validated = await verifyApiKey(token);
    if (!validated) {
      res.status(401).json(
        createErrorResponse(
          {
            code: ErrorCode.UNAUTHORIZED,
            message: "Invalid, expired, or revoked API key",
          },
          req.id,
        ),
      );
      return;
    }

    req.apiKey = validated;
    req.authType = "api_key";

    // Cross-tenant guard: if a route param specifies organizationId, verify it matches the key's tenant
    const routeOrgId = getParam(req.params.organizationId);
    if (routeOrgId && routeOrgId !== validated.organizationId) {
      logger.warn("Cross-tenant API key access attempt blocked", {
        keyId: validated.id,
        keyOrgId: validated.organizationId,
        targetOrgId: routeOrgId,
        path: req.originalUrl,
      });
      res.status(403).json(
        createErrorResponse(
          {
            code: ErrorCode.FORBIDDEN,
            message: "API key is not authorized for the requested organization",
          },
          req.id,
        ),
      );
      return;
    }

    next();
    return;
  }

  // 2. Fall back to standard session authentication (Cookie or session Bearer)
  const sessionToken = req.cookies?.[env.SESSION_COOKIE_NAME] || token;

  if (!sessionToken) {
    res.status(401).json(
      createErrorResponse(
        {
          code: ErrorCode.UNAUTHORIZED,
          message:
            "Authentication required (provide a valid API key or session)",
        },
        req.id,
      ),
    );
    return;
  }

  try {
    const auth = await validateSession(sessionToken);
    if (!auth) {
      res.status(401).json(
        createErrorResponse(
          {
            code: ErrorCode.UNAUTHORIZED,
            message: "Invalid or expired session",
          },
          req.id,
        ),
      );
      return;
    }

    req.user = auth.user;
    req.session = auth.session;
    req.authType = "session";

    // If route specifies an organizationId, verify active membership
    const routeOrgId = getParam(req.params.organizationId);
    if (routeOrgId) {
      const membership = await prisma.membership.findFirst({
        where: {
          organizationId: routeOrgId,
          userId: auth.user.id,
          status: "ACTIVE",
        },
      });

      if (!membership) {
        res.status(403).json(
          createErrorResponse(
            {
              code: ErrorCode.FORBIDDEN,
              message: "You are not an active member of this organization",
            },
            req.id,
          ),
        );
        return;
      }
      req.membership = membership;
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware ensuring the authenticated API key possesses a specific permission scope.
 * If authenticated via user session, grants access based on active membership.
 */
export function requireScope(requiredScope: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // If request authenticated with API key, check key scopes
    if (req.apiKey) {
      if (!hasScope(req.apiKey.scopes, requiredScope)) {
        res.status(403).json(
          createErrorResponse(
            {
              code: ErrorCode.FORBIDDEN,
              message: `Insufficient API key scope. Required: '${requiredScope}'`,
            },
            req.id,
          ),
        );
        return;
      }
      next();
      return;
    }

    // If session user, role check can proceed
    next();
  };
}
