import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { AppError } from "../middleware/error-handler.js";
import { ErrorCode } from "@workspace/contracts";
import {
  constructWebhookEvent,
  processWebhookEvent,
} from "../services/stripe.service.js";

export const webhookRouter: Router = Router();

/**
 * POST /api/v1/billing/webhook
 * Receives and processes signature-verified Stripe webhooks.
 * Uses exact raw request body buffer.
 */
webhookRouter.post(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const signature = req.headers["stripe-signature"];

      if (!signature || typeof signature !== "string") {
        throw new AppError(
          "Missing stripe-signature header",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      // Read raw body (Buffer or string)
      const rawBody = (req as any).rawBody || req.body;

      if (!rawBody) {
        throw new AppError(
          "Empty or unreadable webhook request payload",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      // Verify signature
      const event = constructWebhookEvent(rawBody, signature);

      // Idempotently process event
      const result = await processWebhookEvent(event);

      res.status(200).json({
        received: true,
        duplicate: result.duplicate,
      });
    } catch (err) {
      next(err);
    }
  },
);
