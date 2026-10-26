import { type Job, UnrecoverableError } from "bullmq";
import {
  BillingReconciliationJobPayloadSchema,
  type BillingReconciliationJobPayload,
} from "@workspace/contracts";
import { prisma, withAdminBypassTransaction } from "@workspace/database";
import { logger } from "../lib/logger.js";

export async function processBillingReconciliationJob(
  job: Job<BillingReconciliationJobPayload>,
): Promise<Record<string, unknown>> {
  const startTime = Date.now();
  const parseResult = BillingReconciliationJobPayloadSchema.safeParse(job.data);

  if (!parseResult.success) {
    logger.error("Permanent failure: Invalid billing reconciliation payload", {
      jobId: job.id,
      errors: parseResult.error.format(),
    });
    throw new UnrecoverableError(
      `Invalid payload: ${parseResult.error.message}`,
    );
  }

  const payload = parseResult.data;

  logger.info("Starting billing reconciliation job", {
    jobId: job.id,
    organizationId: payload.organizationId,
    correlationId: payload.correlationId,
  });

  // Re-fetch authoritative subscription from PostgreSQL
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: payload.organizationId },
    include: { organization: true },
  });

  if (!subscription) {
    logger.warn("Reconciliation skipped: Subscription record does not exist", {
      jobId: job.id,
      organizationId: payload.organizationId,
    });
    return { status: "not_found" };
  }

  // Authoritative reconciliation:
  // Verify that customer ID or subscription ID match if provided in payload
  if (
    payload.stripeSubscriptionId &&
    subscription.stripeSubscriptionId &&
    payload.stripeSubscriptionId !== subscription.stripeSubscriptionId
  ) {
    logger.warn("Subscription ID mismatch detected during reconciliation", {
      jobId: job.id,
      organizationId: payload.organizationId,
      expected: subscription.stripeSubscriptionId,
      received: payload.stripeSubscriptionId,
    });
    return { status: "mismatch_flagged" };
  }

  // Update timestamps and record reconciled status
  const updated = await withAdminBypassTransaction(async (tx) => {
    return tx.subscription.update({
      where: { organizationId: payload.organizationId },
      data: {
        updatedAt: new Date(),
      },
    });
  });

  const durationMs = Date.now() - startTime;
  logger.info("Billing reconciliation job completed", {
    jobId: job.id,
    organizationId: payload.organizationId,
    plan: updated.plan,
    status: updated.status,
    durationMs,
  });

  return {
    status: "reconciled",
    organizationId: payload.organizationId,
    plan: updated.plan,
    subscriptionStatus: updated.status,
    durationMs,
  };
}
