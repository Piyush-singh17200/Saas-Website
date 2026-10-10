import { type Job } from "bullmq";
import { InvitationExpiryJobPayloadSchema, type InvitationExpiryJobPayload } from "@workspace/contracts";
import { withAdminBypassTransaction } from "@workspace/database";
import { logger } from "../lib/logger.js";

export async function processInvitationExpiryJob(job: Job<InvitationExpiryJobPayload>): Promise<Record<string, unknown>> {
  const startTime = Date.now();
  const parseResult = InvitationExpiryJobPayloadSchema.safeParse(job.data || {});
  const payload = parseResult.success ? parseResult.data : { sweepOnly: true };

  logger.info("Starting invitation expiry processing", {
    jobId: job.id,
    invitationId: payload.invitationId,
    organizationId: payload.organizationId,
    correlationId: payload.correlationId,
  });

  const now = new Date();

  // If a specific invitation was requested
  if (payload.invitationId) {
    const result = await withAdminBypassTransaction(async (tx) => {
      const invite = await tx.invitation.findUnique({
        where: { id: payload.invitationId },
      });

      if (!invite) {
        return { status: "not_found", count: 0 };
      }

      if (invite.acceptedAt || invite.revokedAt) {
        return { status: "already_resolved", count: 0 };
      }

      if (invite.expiresAt > now) {
        return { status: "not_expired_yet", count: 0 };
      }

      await tx.invitation.update({
        where: { id: payload.invitationId },
        data: { revokedAt: now },
      });

      return { status: "revoked", count: 1 };
    });

    logger.info("Specific invitation expiry check completed", {
      jobId: job.id,
      result,
      durationMs: Date.now() - startTime,
    });
    return result;
  }

  // Sweep all eligible invitations across organizations
  // Safe to run repeatedly; preserves audit history without deleting records
  const result = await withAdminBypassTransaction(async (tx) => {
    const updateResult = await tx.invitation.updateMany({
      where: {
        expiresAt: { lte: now },
        acceptedAt: null,
        revokedAt: null,
        ...(payload.organizationId ? { organizationId: payload.organizationId } : {}),
      },
      data: {
        revokedAt: now,
      },
    });

    return {
      status: "sweep_completed",
      expiredCount: updateResult.count,
    };
  });

  logger.info("Invitation sweep job completed", {
    jobId: job.id,
    expiredCount: result.expiredCount,
    durationMs: Date.now() - startTime,
  });

  return {
    ...result,
    durationMs: Date.now() - startTime,
  };
}
