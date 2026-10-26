import { prisma } from "@workspace/database";
import { AppError } from "../middleware/error-handler.js";
import {
  ErrorCode,
  type UpdateOrganizationSecurityPolicyInput,
} from "@workspace/contracts";
import { recordAuditLog, SecurityAuditAction } from "./audit.service.js";

/**
 * Retrieves the security policy for an organization.
 * Returns default safe policy if none has been explicitly saved.
 */
export async function getOrganizationSecurityPolicy(organizationId: string) {
  let policy = await prisma.organizationSecurityPolicy.findUnique({
    where: { organizationId },
  });

  if (!policy) {
    policy = await prisma.organizationSecurityPolicy.create({
      data: {
        organizationId,
        requireMfa: false,
        sessionMaxAgeMinutes: 43200, // 30 days default
      },
    });
  }

  return {
    id: policy.id,
    organizationId: policy.organizationId,
    requireMfa: policy.requireMfa,
    sessionMaxAgeMinutes: policy.sessionMaxAgeMinutes,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

/**
 * Updates an organization security policy with full auditing.
 * Only callable by organization owners or administrators.
 */
export async function updateOrganizationSecurityPolicy(
  organizationId: string,
  actorId: string,
  input: UpdateOrganizationSecurityPolicyInput,
) {
  const policy = await prisma.organizationSecurityPolicy.upsert({
    where: { organizationId },
    create: {
      organizationId,
      requireMfa: input.requireMfa ?? false,
      sessionMaxAgeMinutes: input.sessionMaxAgeMinutes ?? 43200,
    },
    update: {
      ...(input.requireMfa !== undefined && { requireMfa: input.requireMfa }),
      ...(input.sessionMaxAgeMinutes !== undefined && {
        sessionMaxAgeMinutes: input.sessionMaxAgeMinutes,
      }),
    },
  });

  await recordAuditLog({
    organizationId,
    actorId,
    action: SecurityAuditAction.ORG_POLICY_UPDATED,
    targetType: "organization_security_policy",
    targetId: policy.id,
    outcome: "SUCCESS",
    metadata: {
      requireMfa: policy.requireMfa,
      sessionMaxAgeMinutes: policy.sessionMaxAgeMinutes,
    },
  });

  return {
    id: policy.id,
    organizationId: policy.organizationId,
    requireMfa: policy.requireMfa,
    sessionMaxAgeMinutes: policy.sessionMaxAgeMinutes,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

/**
 * Enforces organization security policies against an active session and user.
 */
export async function checkOrganizationSecurityPolicy(
  organizationId: string,
  user: { id: string; mfaEnabled: boolean },
  sessionCreatedAt?: Date,
) {
  const policy = await prisma.organizationSecurityPolicy.findUnique({
    where: { organizationId },
  });

  if (!policy) return;

  // Enforce mandatory MFA
  if (policy.requireMfa && !user.mfaEnabled) {
    throw new AppError(
      "This organization requires Multi-Factor Authentication (MFA). Please enable MFA in your account security settings before accessing this organization.",
      403,
      ErrorCode.FORBIDDEN,
    );
  }

  // Enforce session maximum age if configured
  if (sessionCreatedAt && policy.sessionMaxAgeMinutes) {
    const maxAgeMs = policy.sessionMaxAgeMinutes * 60 * 1000;
    const sessionAge = Date.now() - sessionCreatedAt.getTime();
    if (sessionAge > maxAgeMs) {
      throw new AppError(
        "Your session exceeds this organization's maximum allowed session duration. Please log in again.",
        401,
        ErrorCode.UNAUTHORIZED,
      );
    }
  }
}
