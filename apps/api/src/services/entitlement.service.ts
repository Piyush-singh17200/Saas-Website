import {
  prisma,
  type Prisma,
  type Subscription,
  type SubscriptionPlan,
} from "@workspace/database";
import {
  ErrorCode,
  type PlanLimits,
  type PlanUsage,
  type BillingSummaryResponse,
} from "@workspace/contracts";
import { env } from "../config/env.js";
import { AppError } from "../middleware/error-handler.js";

/**
 * Returns static plan limits based on server configuration.
 */
export function getPlanLimits(plan: SubscriptionPlan): PlanLimits {
  if (plan === "PRO") {
    return {
      maxActiveProjects: env.PRO_MAX_PROJECTS,
      maxMembers: env.PRO_MAX_MEMBERS,
      premiumFeatures: true,
      activityRetentionDays: 365,
    };
  }

  return {
    maxActiveProjects: env.FREE_MAX_PROJECTS,
    maxMembers: env.FREE_MAX_MEMBERS,
    premiumFeatures: false,
    activityRetentionDays: 30,
  };
}

/**
 * Checks if a subscription qualifies for PRO entitlements.
 *
 * Policy:
 * - ACTIVE or TRIALING on PRO plan: Full Pro entitlements.
 * - PAST_DUE on PRO plan: Retains Pro access during payment retry window.
 * - cancelAtPeriodEnd = true on PRO plan: Retains Pro access until currentPeriodEnd.
 * - CANCELED, UNPAID, INCOMPLETE, INCOMPLETE_EXPIRED, or expired period: Reverts to Free plan.
 */
export function isProEligible(
  subscription:
    | (Pick<
        Subscription,
        "plan" | "status" | "cancelAtPeriodEnd" | "currentPeriodEnd"
      > &
        Partial<Subscription>)
    | null,
): boolean {
  if (!subscription || subscription.plan !== "PRO") {
    return false;
  }

  // Active or trialing
  if (
    subscription.status === "ACTIVE" ||
    subscription.status === "TRIALING" ||
    subscription.status === "PAST_DUE"
  ) {
    if (subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd) {
      return new Date(subscription.currentPeriodEnd).getTime() > Date.now();
    }
    return true;
  }

  return false;
}

/**
 * Returns the effective plan ('FREE' or 'PRO') for an organization.
 */
export function getEffectivePlan(
  subscription:
    | (Pick<
        Subscription,
        "plan" | "status" | "cancelAtPeriodEnd" | "currentPeriodEnd"
      > &
        Partial<Subscription>)
    | null,
): SubscriptionPlan {
  return isProEligible(subscription) ? "PRO" : "FREE";
}

/**
 * Resolves or lazily provisions an organization's subscription record.
 */
export async function getOrCreateSubscription(
  organizationId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<Subscription> {
  const existing = await tx.subscription.findUnique({
    where: { organizationId },
  });

  if (existing) {
    return existing;
  }

  // Lazily provision FREE subscription for organizations created prior to Phase 4
  try {
    return await tx.subscription.create({
      data: {
        organizationId,
        plan: "FREE",
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
      },
    });
  } catch {
    // In case of race condition during concurrent creation
    const found = await tx.subscription.findUnique({
      where: { organizationId },
    });
    if (found) return found;
    throw new AppError(
      "Failed to resolve subscription",
      500,
      ErrorCode.INTERNAL_ERROR,
    );
  }
}

/**
 * Returns usage statistics for an organization.
 */
export async function getOrganizationUsage(
  organizationId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<PlanUsage> {
  const [activeProjects, totalProjects, members] = await Promise.all([
    tx.project.count({
      where: { organizationId, status: "ACTIVE" },
    }),
    tx.project.count({
      where: { organizationId },
    }),
    tx.membership.count({
      where: { organizationId, status: "ACTIVE" },
    }),
  ]);

  return {
    activeProjects,
    totalProjects,
    members,
  };
}

/**
 * Atomically validates that an organization is entitled to create a new active project.
 * Uses PostgreSQL row-locking ('FOR UPDATE') on the organization row to eliminate race conditions.
 */
export async function assertCanCreateActiveProject(
  organizationId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  // Lock organization row to serialize concurrent creation requests
  await tx.$executeRawUnsafe(
    `SELECT id FROM organizations WHERE id = $1::uuid FOR UPDATE`,
    organizationId,
  );

  const subscription = await tx.subscription.findUnique({
    where: { organizationId },
  });

  const effectivePlan = getEffectivePlan(subscription);
  const limits = getPlanLimits(effectivePlan);

  const activeProjectCount = await tx.project.count({
    where: { organizationId, status: "ACTIVE" },
  });

  if (activeProjectCount >= limits.maxActiveProjects) {
    throw new AppError(
      `Plan limit reached. Your ${effectivePlan} plan allows up to ${limits.maxActiveProjects} active projects. Upgrade to Pro for increased limits.`,
      403,
      ErrorCode.PLAN_LIMIT_EXCEEDED,
      {
        limit: limits.maxActiveProjects,
        current: activeProjectCount,
        plan: effectivePlan,
      },
    );
  }
}

/**
 * Atomically validates that an organization is entitled to add or invite a new member.
 * Uses PostgreSQL row-locking ('FOR UPDATE') on the organization row to eliminate race conditions.
 */
export async function assertCanAddMember(
  organizationId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  // Lock organization row to serialize concurrent member additions
  await tx.$executeRawUnsafe(
    `SELECT id FROM organizations WHERE id = $1::uuid FOR UPDATE`,
    organizationId,
  );

  const subscription = await tx.subscription.findUnique({
    where: { organizationId },
  });

  const effectivePlan = getEffectivePlan(subscription);
  const limits = getPlanLimits(effectivePlan);

  const memberCount = await tx.membership.count({
    where: { organizationId, status: "ACTIVE" },
  });

  if (memberCount >= limits.maxMembers) {
    throw new AppError(
      `Plan limit reached. Your ${effectivePlan} plan allows up to ${limits.maxMembers} members. Upgrade to Pro for increased limits.`,
      403,
      ErrorCode.PLAN_LIMIT_EXCEEDED,
      {
        limit: limits.maxMembers,
        current: memberCount,
        plan: effectivePlan,
      },
    );
  }
}

/**
 * Asserts that an organization is entitled to access a premium feature.
 */
export async function assertFeatureEntitled(
  organizationId: string,
  featureName: string,
): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
  });

  if (!isProEligible(subscription)) {
    throw new AppError(
      `The feature "${featureName}" requires an active Pro subscription.`,
      403,
      ErrorCode.PLAN_LIMIT_EXCEEDED,
      {
        feature: featureName,
        requiredPlan: "PRO",
      },
    );
  }
}

/**
 * Returns the full billing summary and usage statistics for an organization.
 */
export async function getBillingSummary(
  organizationId: string,
): Promise<BillingSummaryResponse> {
  const subscription = await getOrCreateSubscription(organizationId);
  const effectivePlan = getEffectivePlan(subscription);
  const limits = getPlanLimits(effectivePlan);
  const usage = await getOrganizationUsage(organizationId);

  return {
    subscription: {
      id: subscription.id,
      organizationId: subscription.organizationId,
      plan: subscription.plan,
      status: subscription.status,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      stripePriceId: subscription.stripePriceId,
      currentPeriodStart:
        subscription.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt: subscription.canceledAt?.toISOString() ?? null,
      createdAt: subscription.createdAt.toISOString(),
      updatedAt: subscription.updatedAt.toISOString(),
    },
    limits,
    usage,
    isEligibleForPro: isProEligible(subscription),
  };
}
