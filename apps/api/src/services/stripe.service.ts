import Stripe from "stripe";
import {
  withAdminBypassTransaction,
  type SubscriptionStatus,
} from "@workspace/database";
import { ErrorCode } from "@workspace/contracts";
import { env } from "../config/env.js";
import { AppError } from "../middleware/error-handler.js";
import {
  getOrCreateSubscription,
  isProEligible,
} from "./entitlement.service.js";

// Initialize Stripe Client
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia" as any,
  typescript: true,
});

/**
 * Maps a Stripe subscription status string to the application's SubscriptionStatus enum.
 */
export function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "unpaid":
      return "UNPAID";
    case "incomplete":
      return "INCOMPLETE";
    case "incomplete_expired":
      return "INCOMPLETE_EXPIRED";
    default:
      return "ACTIVE";
  }
}

/**
 * Creates or retrieves an existing Stripe customer for an organization.
 */
export async function createOrGetStripeCustomer(
  organizationId: string,
  userEmail: string,
  organizationName: string,
): Promise<string> {
  const subscription = await getOrCreateSubscription(organizationId);

  if (subscription.stripeCustomerId) {
    return subscription.stripeCustomerId;
  }

  // Create customer on Stripe
  const customer = await stripe.customers.create({
    email: userEmail,
    name: organizationName,
    metadata: {
      organizationId,
    },
  });

  await withAdminBypassTransaction(async (tx) => {
    await tx.subscription.update({
      where: { organizationId },
      data: {
        stripeCustomerId: customer.id,
      },
    });
  });

  return customer.id;
}

/**
 * Creates a Stripe Checkout Session for upgrading an organization to PRO.
 */
export async function createCheckoutSession(params: {
  organizationId: string;
  userId: string;
  userEmail: string;
  organizationName: string;
}): Promise<string> {
  const { organizationId, userId, userEmail, organizationName } = params;

  const subscription = await getOrCreateSubscription(organizationId);

  // Prevent duplicate subscriptions if already on active Pro
  if (isProEligible(subscription)) {
    throw new AppError(
      "Organization already has an active Pro subscription. Use the Customer Portal to manage billing.",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  const customerId = await createOrGetStripeCustomer(
    organizationId,
    userEmail,
    organizationName,
  );

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      {
        price: env.STRIPE_PRO_PRICE_ID,
        quantity: 1,
      },
    ],
    metadata: {
      organizationId,
      userId,
    },
    subscription_data: {
      metadata: {
        organizationId,
      },
    },
    success_url: `${env.APP_URL}/organizations/${organizationId}/billing?session_id={CHECKOUT_SESSION_ID}&success=true`,
    cancel_url: `${env.APP_URL}/organizations/${organizationId}/billing?canceled=true`,
  });

  if (!session.url) {
    throw new AppError(
      "Failed to create Stripe Checkout session URL",
      500,
      ErrorCode.STRIPE_ERROR,
    );
  }

  return session.url;
}

/**
 * Creates a Stripe Customer Portal session for managing payment methods, invoices, and plans.
 */
export async function createPortalSession(
  organizationId: string,
): Promise<string> {
  const subscription = await getOrCreateSubscription(organizationId);

  if (!subscription.stripeCustomerId) {
    throw new AppError(
      "No billing account found for this organization. Upgrade to Pro first.",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${env.APP_URL}/organizations/${organizationId}/billing`,
  });

  return portalSession.url;
}

/**
 * Validates Stripe signature and constructs the typed Stripe Event from raw request body.
 */
export function constructWebhookEvent(
  rawBody: Buffer | string,
  signature: string,
): Stripe.Event {
  try {
    return stripe.webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Invalid webhook signature";
    throw new AppError(message, 400, ErrorCode.VALIDATION_ERROR);
  }
}

/**
 * Atomically and idempotently handles verified Stripe webhook events.
 */
export async function processWebhookEvent(event: Stripe.Event): Promise<{
  processed: boolean;
  duplicate: boolean;
}> {
  return withAdminBypassTransaction(async (tx) => {
    // 1. Idempotency Check
    const existing = await tx.webhookEvent.findUnique({
      where: { id: event.id },
    });

    if (existing) {
      return { processed: true, duplicate: true };
    }

    // 2. Dispatch by Event Type
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const organizationId = session.metadata?.organizationId;

        if (organizationId && session.subscription) {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;

          const customerId =
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id;

          // Retrieve full subscription details from Stripe
          try {
            const stripeSub = await stripe.subscriptions.retrieve(subId);
            const status = mapStripeSubscriptionStatus(stripeSub.status);
            const priceId = stripeSub.items.data[0]?.price?.id || null;

            await tx.subscription.upsert({
              where: { organizationId },
              create: {
                organizationId,
                stripeCustomerId: customerId || null,
                stripeSubscriptionId: stripeSub.id,
                stripePriceId: priceId,
                plan: "PRO",
                status,
                currentPeriodStart: (stripeSub as any).current_period_start
                  ? new Date((stripeSub as any).current_period_start * 1000)
                  : null,
                currentPeriodEnd: (stripeSub as any).current_period_end
                  ? new Date((stripeSub as any).current_period_end * 1000)
                  : null,
                cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
              },
              update: {
                stripeCustomerId: customerId || undefined,
                stripeSubscriptionId: stripeSub.id,
                stripePriceId: priceId,
                plan: "PRO",
                status,
                currentPeriodStart: (stripeSub as any).current_period_start
                  ? new Date((stripeSub as any).current_period_start * 1000)
                  : null,
                currentPeriodEnd: (stripeSub as any).current_period_end
                  ? new Date((stripeSub as any).current_period_end * 1000)
                  : null,
                cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
              },
            });
          } catch {
            // Fallback if Stripe retrieve fails
            await tx.subscription.upsert({
              where: { organizationId },
              create: {
                organizationId,
                stripeCustomerId: customerId || null,
                stripeSubscriptionId: subId,
                plan: "PRO",
                status: "ACTIVE",
                cancelAtPeriodEnd: false,
              },
              update: {
                stripeCustomerId: customerId || undefined,
                stripeSubscriptionId: subId,
                plan: "PRO",
                status: "ACTIVE",
              },
            });
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const stripeSub = event.data.object as Stripe.Subscription;
        const organizationId =
          stripeSub.metadata?.organizationId ||
          (
            await tx.subscription.findFirst({
              where: {
                stripeCustomerId:
                  typeof stripeSub.customer === "string"
                    ? stripeSub.customer
                    : stripeSub.customer.id,
              },
            })
          )?.organizationId;

        if (organizationId) {
          const existing = await tx.subscription.findUnique({
            where: { organizationId },
          });

          // Prevent out-of-order delayed events from regressing a canceled subscription
          const eventTime = event.created * 1000;
          if (
            existing &&
            existing.status === "CANCELED" &&
            existing.canceledAt &&
            eventTime < existing.canceledAt.getTime()
          ) {
            // Out-of-order event: subscription was canceled more recently than this event
            break;
          }

          const status = mapStripeSubscriptionStatus(stripeSub.status);
          const priceId = stripeSub.items.data[0]?.price?.id || null;
          const customerId =
            typeof stripeSub.customer === "string"
              ? stripeSub.customer
              : stripeSub.customer.id;

          await tx.subscription.upsert({
            where: { organizationId },
            create: {
              organizationId,
              stripeCustomerId: customerId,
              stripeSubscriptionId: stripeSub.id,
              stripePriceId: priceId,
              plan: "PRO",
              status,
              currentPeriodStart: (stripeSub as any).current_period_start
                ? new Date((stripeSub as any).current_period_start * 1000)
                : null,
              currentPeriodEnd: (stripeSub as any).current_period_end
                ? new Date((stripeSub as any).current_period_end * 1000)
                : null,
              cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
              canceledAt: stripeSub.canceled_at
                ? new Date(stripeSub.canceled_at * 1000)
                : null,
            },
            update: {
              stripeSubscriptionId: stripeSub.id,
              stripePriceId: priceId,
              plan: "PRO",
              status,
              currentPeriodStart: (stripeSub as any).current_period_start
                ? new Date((stripeSub as any).current_period_start * 1000)
                : null,
              currentPeriodEnd: (stripeSub as any).current_period_end
                ? new Date((stripeSub as any).current_period_end * 1000)
                : null,
              cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
              canceledAt: stripeSub.canceled_at
                ? new Date(stripeSub.canceled_at * 1000)
                : null,
            },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const stripeSub = event.data.object as Stripe.Subscription;
        const subRecord = await tx.subscription.findFirst({
          where: { stripeSubscriptionId: stripeSub.id },
        });

        if (subRecord) {
          // Revert to FREE plan, preserving all projects and members without data deletion
          await tx.subscription.update({
            where: { id: subRecord.id },
            data: {
              plan: "FREE",
              status: "CANCELED",
              cancelAtPeriodEnd: false,
              canceledAt: new Date(
                stripeSub.canceled_at
                  ? stripeSub.canceled_at * 1000
                  : Date.now(),
              ),
            },
          });
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId =
          typeof (invoice as any).subscription === "string"
            ? (invoice as any).subscription
            : (invoice as any).subscription?.id;

        if (subId) {
          await tx.subscription.updateMany({
            where: { stripeSubscriptionId: subId },
            data: {
              status: "ACTIVE",
            },
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId =
          typeof (invoice as any).subscription === "string"
            ? (invoice as any).subscription
            : (invoice as any).subscription?.id;

        if (subId) {
          await tx.subscription.updateMany({
            where: { stripeSubscriptionId: subId },
            data: {
              status: "PAST_DUE",
            },
          });
        }
        break;
      }

      default:
        // Ignore unhandled events safely
        break;
    }

    // 3. Durably record the webhook event for audit and deduplication
    await tx.webhookEvent.create({
      data: {
        id: event.id,
        eventType: event.type,
        data: {
          type: event.type,
          created: event.created,
        },
      },
    });

    return { processed: true, duplicate: false };
  });
}
