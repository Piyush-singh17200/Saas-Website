import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { createSuccessResponse } from "@workspace/contracts";
import { invitationService } from "../services/invitation.service.js";
import { requireAuthenticatedUser } from "../middleware/auth.middleware.js";
import {
  abuseRateLimiter,
  failClosedGuard,
} from "../middleware/rate-limit.middleware.js";

export const invitationTokenRouter: Router = Router();

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

/**
 * GET /api/v1/invitations/:token
 * Public endpoint to inspect invitation validity & organization metadata.
 */
invitationTokenRouter.get(
  "/:token",
  failClosedGuard,
  abuseRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = getParam(req.params.token);
      const details = await invitationService.getInvitationByToken(token);
      res.status(200).json(createSuccessResponse(details, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/invitations/:token/accept
 * Accepts invitation with authenticated session, verifying recipient identity and seat limits.
 */
invitationTokenRouter.post(
  "/:token/accept",
  failClosedGuard,
  abuseRateLimiter,
  requireAuthenticatedUser,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = getParam(req.params.token);
      const result = await invitationService.acceptInvitation(
        token,
        req.user!,
        req.id,
      );
      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);
