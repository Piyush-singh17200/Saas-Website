import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  hashToken,
  requestPasswordReset,
  confirmPasswordReset,
} from "../services/password-reset.service.js";
import {
  sendEmailVerification,
  confirmEmailVerification,
  resendVerificationEmail,
} from "../services/email-verification.service.js";
import { deleteUserAccount } from "../services/account-deletion.service.js";
import { hashPassword } from "../services/password.service.js";
import { prisma, basePrisma } from "@workspace/database";
import { MembershipRole } from "@workspace/contracts";

// Mock email service
vi.mock("../services/email.service.js", () => ({
  emailService: {
    sendPasswordResetEmail: vi.fn().mockResolvedValue({ success: true }),
    sendVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  },
}));

// Mock audit log service
vi.mock("../services/audit.service.js", () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
  SecurityAuditAction: {
    AUTH_PASSWORD_RESET_REQUESTED: "auth.password_reset.requested",
    AUTH_PASSWORD_RESET_COMPLETED: "auth.password_reset.completed",
    AUTH_EMAIL_VERIFIED: "auth.email.verified",
    AUTH_ACCOUNT_DELETED: "auth.account.deleted",
  },
}));

describe("Authentication Lifecycle Unit Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Password Reset Service", () => {
    it("generates consistent SHA-256 token hashes", () => {
      const token = "a1b2c3d4e5f6";
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it("returns non-disclosing message for non-existent user (timing-safe)", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(null);

      const result = await requestPasswordReset("nonexistent@example.com");
      expect(result.success).toBe(true);
      expect(result.message).toContain("If an account exists");
    });

    it("creates single-use expiring token when user exists", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: "user-123",
        email: "alice@example.com",
        status: "ACTIVE",
      } as any);

      const deleteManySpy = vi
        .spyOn(prisma.passwordResetToken, "deleteMany")
        .mockResolvedValue({ count: 0 });

      let createdData: any = null;
      const createSpy = (
        vi.spyOn(prisma.passwordResetToken, "create") as any
      ).mockImplementation(async (args: any) => {
        createdData = args.data;
        return { id: "token-1", ...args.data };
      });

      const result = await requestPasswordReset("alice@example.com");

      expect(result.success).toBe(true);
      expect(deleteManySpy).toHaveBeenCalledWith({
        where: { userId: "user-123", usedAt: null },
      });
      expect(createSpy).toHaveBeenCalled();
      expect(createdData.userId).toBe("user-123");
      expect(createdData.tokenHash).toHaveLength(64);
      expect(createdData.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("rejects invalid, expired, or previously used reset tokens", async () => {
      // Token not found
      vi.spyOn(prisma.passwordResetToken, "findUnique").mockResolvedValue(null);
      await expect(
        confirmPasswordReset("invalid-token", "NewPassword123!"),
      ).rejects.toThrow(/invalid or expired/i);

      // Token expired
      vi.spyOn(prisma.passwordResetToken, "findUnique").mockResolvedValue({
        id: "tok-expired",
        userId: "user-1",
        expiresAt: new Date(Date.now() - 10000), // in the past
        usedAt: null,
        user: { id: "user-1", email: "a@b.com", status: "ACTIVE" },
      } as any);
      await expect(
        confirmPasswordReset("expired-token", "NewPassword123!"),
      ).rejects.toThrow(/invalid or expired/i);

      // Token already used
      vi.spyOn(prisma.passwordResetToken, "findUnique").mockResolvedValue({
        id: "tok-used",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 100000),
        usedAt: new Date(),
        user: { id: "user-1", email: "a@b.com", status: "ACTIVE" },
      } as any);
      await expect(
        confirmPasswordReset("used-token", "NewPassword123!"),
      ).rejects.toThrow(/invalid or expired/i);
    });

    it("successfully resets password and consumes token atomically", async () => {
      const mockTokenRecord = {
        id: "tok-valid",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
        user: { id: "user-1", email: "valid@example.com", status: "ACTIVE" },
      };

      vi.spyOn(prisma.passwordResetToken, "findUnique").mockResolvedValue(
        mockTokenRecord as any,
      );

      const updateTokenMock = vi.fn().mockResolvedValue({});
      const updateUserMock = vi.fn().mockResolvedValue({});
      const deleteOtherTokensMock = vi.fn().mockResolvedValue({});

      vi.spyOn(prisma, "$transaction").mockImplementation(
        async (callback: any) => {
          return callback({
            passwordResetToken: {
              update: updateTokenMock,
              deleteMany: deleteOtherTokensMock,
            },
            user: {
              update: updateUserMock,
            },
          });
        },
      );

      vi.spyOn(prisma.session, "updateMany").mockResolvedValue({ count: 2 });

      const result = await confirmPasswordReset(
        "valid-raw-token",
        "BrandNewPassword123!",
      );

      expect(result.success).toBe(true);
      expect(updateTokenMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "tok-valid" },
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        }),
      );
      expect(updateUserMock).toHaveBeenCalled();
    });
  });

  describe("Email Verification Service", () => {
    it("creates expiring verification token and dispatches email", async () => {
      vi.spyOn(prisma.emailVerificationToken, "deleteMany").mockResolvedValue({
        count: 0,
      });
      const createSpy = vi
        .spyOn(prisma.emailVerificationToken, "create")
        .mockResolvedValue({ id: "ev-1" } as any);

      const result = await sendEmailVerification("u-1", "user@example.com");
      expect(result.success).toBe(true);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "u-1",
            tokenHash: expect.any(String),
          }),
        }),
      );
    });

    it("confirms verification and updates user emailVerified status", async () => {
      const tokenRecord = {
        id: "ev-token-id",
        userId: "u-1",
        expiresAt: new Date(Date.now() + 100000),
        usedAt: null,
        user: { id: "u-1", email: "user@example.com", emailVerified: false },
      };

      vi.spyOn(prisma.emailVerificationToken, "findUnique").mockResolvedValue(
        tokenRecord as any,
      );

      const updateTokenMock = vi.fn().mockResolvedValue({});
      const updateUserMock = vi.fn().mockResolvedValue({});
      const deleteTokensMock = vi.fn().mockResolvedValue({});

      vi.spyOn(prisma, "$transaction").mockImplementation(
        async (callback: any) => {
          return callback({
            emailVerificationToken: {
              update: updateTokenMock,
              deleteMany: deleteTokensMock,
            },
            user: {
              update: updateUserMock,
            },
          });
        },
      );

      const result = await confirmEmailVerification("valid-raw-verify-token");
      expect(result.success).toBe(true);
      expect(updateUserMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "u-1" },
          data: expect.objectContaining({ emailVerified: true }),
        }),
      );
    });

    it("safely handles resend verification email for valid unverified user", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: "u-resend",
        email: "resend@example.com",
        emailVerified: false,
        status: "ACTIVE",
      } as any);
      vi.spyOn(prisma.emailVerificationToken, "deleteMany").mockResolvedValue({
        count: 1,
      });
      (
        vi.spyOn(prisma.emailVerificationToken, "create") as any
      ).mockResolvedValue({ id: "ev-resend" } as any);

      const res = await resendVerificationEmail("resend@example.com");
      expect(res.success).toBe(true);
      expect(res.message).toContain("verification link");
    });
  });

  describe("Account Deletion Service", () => {
    it("rejects deletion if confirmation phrase is incorrect", async () => {
      await expect(
        deleteUserAccount({
          userId: "user-1",
          password: "SecretPassword123!",
          confirmationPhrase: "WRONG PHRASE",
        }),
      ).rejects.toThrow(/DELETE MY ACCOUNT/);
    });

    it("rejects deletion if password reauthentication fails", async () => {
      const realPasswordHash = await hashPassword("CorrectPassword123!");
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: "user-1",
        email: "alice@example.com",
        passwordHash: realPasswordHash,
        memberships: [],
      } as any);

      await expect(
        deleteUserAccount({
          userId: "user-1",
          password: "WrongPassword999!",
          confirmationPhrase: "DELETE MY ACCOUNT",
        }),
      ).rejects.toThrow(/Invalid password/);
    });

    it("protects organizations: blocks deletion if user is sole owner of an org with other members", async () => {
      const realPasswordHash = await hashPassword("CorrectPassword123!");
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: "owner-1",
        email: "owner@example.com",
        passwordHash: realPasswordHash,
        memberships: [
          {
            organizationId: "org-shared",
            role: MembershipRole.OWNER,
            organization: {
              id: "org-shared",
              name: "Acme Corp",
              memberships: [
                { userId: "owner-1" },
                { userId: "other-teammate-2" }, // Other active member!
              ],
            },
          },
        ],
      } as any);

      await expect(
        deleteUserAccount({
          userId: "owner-1",
          password: "CorrectPassword123!",
          confirmationPhrase: "DELETE MY ACCOUNT",
        }),
      ).rejects.toThrow(/sole owner of organization "Acme Corp"/i);
    });

    it("executes atomic deletion of user and solo organizations when allowed", async () => {
      const realPasswordHash = await hashPassword("CorrectPassword123!");
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: "solo-user",
        email: "solo@example.com",
        passwordHash: realPasswordHash,
        memberships: [
          {
            organizationId: "solo-org",
            role: MembershipRole.OWNER,
            organization: {
              id: "solo-org",
              name: "Solo Workspace",
              memberships: [{ userId: "solo-user" }], // Only user
            },
          },
        ],
      } as any);

      const deleteOrgMock = vi.fn().mockResolvedValue({});
      const deleteMembershipMock = vi.fn().mockResolvedValue({});
      const deleteSessionMock = vi.fn().mockResolvedValue({});
      const deleteTokensMock = vi.fn().mockResolvedValue({});
      const deleteUserMock = vi.fn().mockResolvedValue({});

      vi.spyOn(basePrisma, "$transaction").mockImplementation(
        async (callback: any) => {
          return callback({
            $executeRaw: vi.fn(),
            organization: { deleteMany: deleteOrgMock },
            membership: { deleteMany: deleteMembershipMock },
            session: { deleteMany: deleteSessionMock },
            passwordResetToken: { deleteMany: deleteTokensMock },
            emailVerificationToken: { deleteMany: deleteTokensMock },
            mfaChallenge: { deleteMany: deleteTokensMock },
            mfaRecoveryCode: { deleteMany: deleteTokensMock },
            notification: { deleteMany: deleteTokensMock },
            user: { delete: deleteUserMock },
          });
        },
      );

      vi.spyOn(prisma.session, "updateMany").mockResolvedValue({ count: 1 });

      const result = await deleteUserAccount({
        userId: "solo-user",
        password: "CorrectPassword123!",
        confirmationPhrase: "DELETE MY ACCOUNT",
      });

      expect(result.success).toBe(true);
      expect(deleteOrgMock).toHaveBeenCalledWith({
        where: { id: { in: ["solo-org"] } },
      });
      expect(deleteUserMock).toHaveBeenCalledWith({
        where: { id: "solo-user" },
      });
    });
  });
});
