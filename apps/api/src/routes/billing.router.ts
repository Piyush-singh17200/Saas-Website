import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { prisma } from "@workspace/database";
import { createSuccessResponse, ErrorCode } from "@workspace/contracts";
import { requireAuthenticatedUser } from "../middleware/auth.middleware.js";
import {
  requireActiveMembership,
  canManageOrganization,
} from "../middleware/organization.middleware.js";
import { AppError } from "../middleware/error-handler.js";
import { getBillingSummary } from "../services/entitlement.service.js";
import {
  createCheckoutSession,
  createPortalSession,
} from "../services/stripe.service.js";

export const billingRouter: Router = Router({ mergeParams: true });

function getParam(param: string | string[] | undefined): string {
  return Array.isArray(param) ? (param[0] ?? "") : (param ?? "");
}

// Require authenticated user and active organization membership
billingRouter.use(requireAuthenticatedUser);
billingRouter.use(requireActiveMembership);

/**
 * GET /api/v1/organizations/:organizationId/billing
 * Retrieves the current organization's subscription status, limits, and usage.
 */
billingRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const summary = await getBillingSummary(organizationId);

      res.status(200).json(createSuccessResponse(summary, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/organizations/:organizationId/billing/checkout
 * Creates a Stripe Checkout Session to upgrade the organization to PRO.
 * Restricted to OWNER or ADMIN.
 */
billingRouter.post(
  "/checkout",
  canManageOrganization,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const user = req.user!;
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      });
      if (!org) {
        throw new AppError("Organization not found", 404, ErrorCode.NOT_FOUND);
      }

      const checkoutUrl = await createCheckoutSession({
        organizationId,
        userId: user.id,
        userEmail: user.email,
        organizationName: org.name,
      });

      res.status(200).json(createSuccessResponse({ checkoutUrl }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/organizations/:organizationId/billing/portal
 * Opens the Stripe Customer Portal for an existing customer.
 * Restricted to OWNER or ADMIN.
 */
billingRouter.post(
  "/portal",
  canManageOrganization,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const portalUrl = await createPortalSession(organizationId);

      res.status(200).json(createSuccessResponse({ portalUrl }, req.id));
    } catch (err) {
      next(err);
    }
  },
);
