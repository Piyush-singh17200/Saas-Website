import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  CreateApiKeyInputSchema,
  ApiKeyListQuerySchema,
  CreateWebhookSubscriptionInputSchema,
  UpdateWebhookSubscriptionInputSchema,
  WebhookDeliveryListQuerySchema,
  createSuccessResponse,
  ErrorCode,
} from "@workspace/contracts";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "../services/api-key.service.js";
import {
  createWebhookSubscription,
  listWebhookSubscriptions,
  updateWebhookSubscription,
  rotateWebhookSecret,
  deleteWebhookSubscription,
  triggerWebhookPing,
  listWebhookDeliveries,
  retryWebhookDelivery,
} from "../services/webhook.service.js";
import {
  requireActiveMembership,
  canManageOrganization,
} from "../middleware/organization.middleware.js";
import { AppError } from "../middleware/error-handler.js";

export const developerRouter: Router = Router({ mergeParams: true });

// Require active membership on all developer routes
developerRouter.use(requireActiveMembership);

function getParam(param: string | string[] | undefined): string {
  return Array.isArray(param) ? (param[0] ?? "") : (param ?? "");
}

// -----------------------------------------------------------------------------
// API Key Management Routes
// -----------------------------------------------------------------------------

/**
 * GET /api/v1/organizations/:organizationId/developer/api-keys
 * Lists API keys for the organization (never returns plaintext secrets).
 */
developerRouter.get(
  "/api-keys",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const query = ApiKeyListQuerySchema.parse(req.query);

      const result = await listApiKeys(organizationId, query);
      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/organizations/:organizationId/developer/api-keys
 * Generates a new API key. Secret is returned ONCE.
 */
developerRouter.post(
  "/api-keys",
  canManageOrganization,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const userId = req.user!.id;
      const parsed = CreateApiKeyInputSchema.safeParse(req.body);

      if (!parsed.success) {
        throw new AppError(
          "Invalid API key payload: " +
            parsed.error.issues.map((i) => i.message).join(", "),
          400,
          ErrorCode.VALIDATION_ERROR,
          parsed.error.format(),
        );
      }

      const result = await createApiKey(organizationId, userId, parsed.data);
      res.status(201).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/organizations/:organizationId/developer/api-keys/:keyId
 * Immediately revokes an API key.
 */
developerRouter.delete(
  "/api-keys/:keyId",
  canManageOrganization,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const keyId = getParam(req.params.keyId);

      const result = await revokeApiKey(organizationId, keyId);
      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

// -----------------------------------------------------------------------------
// Webhook Subscription Management Routes
// -----------------------------------------------------------------------------

/**
 * GET /api/v1/organizations/:organizationId/developer/webhooks
 * Lists webhook subscriptions for the organization.
 */
developerRouter.get(
  "/webhooks",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const subscriptions = await listWebhookSubscriptions(organizationId);
      res.status(200).json(createSuccessResponse({ subscriptions }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/organizations/:organizationId/developer/webhooks
 * Creates a new webhook subscription. Secret is returned ONCE.
 */
developerRouter.post(
  "/webhooks",
  canManageOrganization,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const userId = req.user!.id;
      const parsed = CreateWebhookSubscriptionInputSchema.safeParse(req.body);

      if (!parsed.success) {
        throw new AppError(
          "Invalid webhook subscription payload: " +
            parsed.error.issues.map((i) => i.message).join(", "),
          400,
          ErrorCode.VALIDATION_ERROR,
          parsed.error.format(),
        );
      }

      const result = await createWebhookSubscription(
        organizationId,
        userId,
        parsed.data,
      );
      res.status(201).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/organizations/:organizationId/developer/webhooks/:id
 * Updates an existing webhook subscription.
 */
developerRouter.patch(
  "/webhooks/:id",
  canManageOrganization,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const subscriptionId = getParam(req.params.id);
      const parsed = UpdateWebhookSubscriptionInputSchema.safeParse(req.body);

      if (!parsed.success) {
        throw new AppError(
          "Invalid webhook update payload: " +
            parsed.error.issues.map((i) => i.message).join(", "),
          400,
          ErrorCode.VALIDATION_ERROR,
          parsed.error.format(),
        );
      }

      const updated = await updateWebhookSubscription(
        organizationId,
        subscriptionId,
        parsed.data,
      );
      res
        .status(200)
        .json(createSuccessResponse({ subscription: updated }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/organizations/:organizationId/developer/webhooks/:id/rotate-secret
 * Generates and returns a new signing secret for the subscription.
 */
developerRouter.post(
  "/webhooks/:id/rotate-secret",
  canManageOrganization,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const subscriptionId = getParam(req.params.id);

      const result = await rotateWebhookSecret(organizationId, subscriptionId);
      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/organizations/:organizationId/developer/webhooks/:id
 * Deletes a webhook subscription.
 */
developerRouter.delete(
  "/webhooks/:id",
  canManageOrganization,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const subscriptionId = getParam(req.params.id);

      await deleteWebhookSubscription(organizationId, subscriptionId);
      res
        .status(200)
        .json(
          createSuccessResponse(
            { message: "Webhook subscription deleted successfully" },
            req.id,
          ),
        );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/organizations/:organizationId/developer/webhooks/:id/ping
 * Dispatches a test ping event to the webhook endpoint.
 */
developerRouter.post(
  "/webhooks/:id/ping",
  canManageOrganization,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const subscriptionId = getParam(req.params.id);

      const result = await triggerWebhookPing(organizationId, subscriptionId);
      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

// -----------------------------------------------------------------------------
// Webhook Delivery History Routes
// -----------------------------------------------------------------------------

/**
 * GET /api/v1/organizations/:organizationId/developer/webhooks/deliveries
 * Inspects delivery attempt logs.
 */
developerRouter.get(
  "/webhooks/deliveries",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const query = WebhookDeliveryListQuerySchema.parse(req.query);

      const result = await listWebhookDeliveries(organizationId, query);
      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/organizations/:organizationId/developer/webhooks/:subscriptionId/deliveries/:deliveryId/retry
 * Manually retries a delivery attempt.
 */
developerRouter.post(
  "/webhooks/:subscriptionId/deliveries/:deliveryId/retry",
  canManageOrganization,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const subscriptionId = getParam(req.params.subscriptionId);
      const deliveryId = getParam(req.params.deliveryId);

      const result = await retryWebhookDelivery(
        organizationId,
        subscriptionId,
        deliveryId,
      );
      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);
