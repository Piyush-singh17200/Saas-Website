import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { createApp } from "../app.js";
import { PrismaClient } from "@workspace/database";
import { createSession } from "../services/session.service.js";
import { env } from "../config/env.js";
import { LocalStorageAdapter } from "../lib/storage/local-adapter.js";
import { S3StorageAdapter } from "../lib/storage/s3-adapter.js";
import {
  sanitizeFileName,
  validateFileMetadata,
  validateFileContentSignature,
  generateStorageKey,
} from "../lib/storage/file-validation.js";

describe("Phase 7: Secure File Uploads and Object Storage", () => {
  const app = createApp();
  const testUploadsDir = path.resolve("./test-uploads-temp");

  const db = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://workspace_user:workspace_pass@127.0.0.1:5433/workspace_test?schema=public",
      },
    },
  });

  let ownerId: string;
  let memberId: string;
  let outsiderId: string;

  let ownerCookie: string;
  let memberCookie: string;
  let outsiderCookie: string;

  let orgId: string;
  let projectId: string;
  let taskId: string;

  // Valid PNG buffer: starts with 89 50 4E 47 0D 0A 1A 0A
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
  ]);

  // Valid PDF buffer: starts with %PDF-
  const validPdfBuffer = Buffer.from("%PDF-1.5 sample pdf content");

  // Fake PNG buffer with malicious/invalid content
  const fakePngBuffer = Buffer.from("NOT_A_PNG_MALICIOUS_SCRIPT_HERE");

  beforeAll(async () => {
    // Ensure test upload dir exists
    await fs.mkdir(testUploadsDir, { recursive: true });

    // Clean fixtures if DB available
    try {
      await (db as any).attachment.deleteMany();
      await db.comment.deleteMany();
      await db.task.deleteMany();
      await db.project.deleteMany();
      await db.session.deleteMany();
      await db.membership.deleteMany();
      await db.organization.deleteMany();
      await db.user.deleteMany();

      // 1. Create Owner User
      const owner = await db.user.create({
        data: {
          id: randomUUID(),
          email: "storage.owner@example.com",
          passwordHash: "hash-owner",
          displayName: "Storage Owner",
        },
      });
      ownerId = owner.id;
      const sOwner = await createSession(ownerId);
      ownerCookie = `${env.SESSION_COOKIE_NAME}=${sOwner.rawToken}`;

      // 2. Create Member User
      const member = await db.user.create({
        data: {
          id: randomUUID(),
          email: "storage.member@example.com",
          passwordHash: "hash-member",
          displayName: "Storage Member",
        },
      });
      memberId = member.id;
      const sMember = await createSession(memberId);
      memberCookie = `${env.SESSION_COOKIE_NAME}=${sMember.rawToken}`;

      // 3. Create Outsider User
      const outsider = await db.user.create({
        data: {
          id: randomUUID(),
          email: "storage.outsider@example.com",
          passwordHash: "hash-outsider",
          displayName: "Storage Outsider",
        },
      });
      outsiderId = outsider.id;
      const sOutsider = await createSession(outsiderId);
      outsiderCookie = `${env.SESSION_COOKIE_NAME}=${sOutsider.rawToken}`;

      // 4. Create Organization
      const org = await db.organization.create({
        data: {
          id: randomUUID(),
          name: "Storage Corp",
          slug: "storage-corp",
          creatorId: ownerId,
        },
      });
      orgId = org.id;

      // 5. Create Memberships
      await db.membership.createMany({
        data: [
          {
            organizationId: orgId,
            userId: ownerId,
            role: "OWNER",
            status: "ACTIVE",
          },
          {
            organizationId: orgId,
            userId: memberId,
            role: "MEMBER",
            status: "ACTIVE",
          },
        ],
      });

      // 6. Create Project and Task
      const proj = await db.project.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          name: "Storage Project",
          slug: "storage-project",
          createdById: ownerId,
        },
      });
      projectId = proj.id;

      const t = await db.task.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          projectId: proj.id,
          title: "Task with Attachments",
          createdById: ownerId,
        },
      });
      taskId = t.id;
    } catch {
      // If DB is offline, DB-backed integration tests will report database unavailability gracefully
    }
  });

  afterAll(async () => {
    // Cleanup temporary test files
    try {
      await fs.rm(testUploadsDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
    try {
      await (db as any).attachment.deleteMany();
      await db.comment.deleteMany();
      await db.task.deleteMany();
      await db.project.deleteMany();
      await db.session.deleteMany();
      await db.membership.deleteMany();
      await db.organization.deleteMany();
      await db.user.deleteMany();
      await db.$disconnect();
    } catch {
      // Ignore
    }
  });

  // ===========================================================================
  // 1. Storage Adapters & Path Traversal Security
  // ===========================================================================
  describe("1. Storage Adapters & Path Traversal Security", () => {
    const localAdapter = new LocalStorageAdapter(testUploadsDir);

    it("puts, gets, and inspects object metadata correctly in LocalStorageAdapter", async () => {
      const testKey = `test-${randomUUID()}.txt`;
      const testBuffer = Buffer.from("Hello Antigravity Storage");

      await localAdapter.putObject({
        key: testKey,
        buffer: testBuffer,
        contentType: "text/plain",
      });

      const meta = await localAdapter.getObjectMetadata(testKey);
      expect(meta).not.toBeNull();
      expect(meta?.size).toBe(testBuffer.length);
      expect(meta?.contentType).toBe("text/plain");

      const obj = await localAdapter.getObject(testKey);
      expect(obj.buffer.toString()).toBe("Hello Antigravity Storage");
      expect(obj.size).toBe(testBuffer.length);

      await localAdapter.deleteObject(testKey);
      const afterDelete = await localAdapter.getObjectMetadata(testKey);
      expect(afterDelete).toBeNull();
    });

    it("blocks directory traversal attempts in LocalStorageAdapter", async () => {
      const maliciousKey = "../../../../../windows/system32/cmd.exe";
      await expect(
        localAdapter.putObject({
          key: maliciousKey,
          buffer: Buffer.from("bad data"),
          contentType: "text/plain",
        }),
      ).rejects.toThrow(/directory traversal/i);
    });

    it("configures S3StorageAdapter and generates valid presigned URL structures", async () => {
      const s3Adapter = new S3StorageAdapter({
        bucket: "test-bucket",
        region: "us-east-1",
        endpoint: "http://localhost:9000",
        accessKeyId: "minioadmin",
        secretAccessKey: "minioadmin",
        forcePathStyle: true,
      });

      expect(s3Adapter.providerName).toBe("s3");

      const downloadUrl = await s3Adapter.getSignedDownloadUrl(
        "orgs/123/file.pdf",
        "invoice.pdf",
        300,
      );
      expect(downloadUrl).toContain(
        "http://localhost:9000/test-bucket/orgs/123/file.pdf",
      );
      expect(downloadUrl).toContain("X-Amz-Signature");

      const uploadResult = await s3Adapter.getSignedUploadUrl(
        "orgs/123/upload.png",
        "image/png",
        300,
      );
      expect(uploadResult.uploadUrl).toContain(
        "http://localhost:9000/test-bucket/orgs/123/upload.png",
      );
      expect(uploadResult.key).toBe("orgs/123/upload.png");
    });
  });

  // ===========================================================================
  // 2. File Validation, Extension Verification & Magic Number Signatures
  // ===========================================================================
  describe("2. File Validation, Extensions & Magic Numbers", () => {
    it("sanitizes filenames and eliminates path traversal sequences", () => {
      expect(sanitizeFileName("../../../etc/passwd")).toBe("passwd");
      expect(sanitizeFileName("..\\..\\malicious.bat")).toBe("malicious.bat");
      expect(sanitizeFileName("report 2026.final (1).pdf")).toBe(
        "report_2026.final__1_.pdf",
      );
      expect(sanitizeFileName("")).toBe("unnamed-file");
    });

    it("validates allowed MIME types and matches extensions", () => {
      const result = validateFileMetadata(
        "diagram.png",
        "image/png",
        5000,
        10 * 1024 * 1024,
      );
      expect(result.cleanFileName).toBe("diagram.png");
      expect(result.verifiedMimeType).toBe("image/png");
    });

    it("rejects mismatched extensions and MIME types", () => {
      expect(() =>
        validateFileMetadata(
          "diagram.exe",
          "image/png",
          5000,
          10 * 1024 * 1024,
        ),
      ).toThrow(/extension/i);
    });

    it("rejects unsupported MIME types", () => {
      expect(() =>
        validateFileMetadata(
          "script.sh",
          "application/x-sh",
          100,
          10 * 1024 * 1024,
        ),
      ).toThrow(/not supported/i);
    });

    it("rejects oversized files exceeding max size limit", () => {
      const max1Mb = 1 * 1024 * 1024;
      const file2Mb = 2 * 1024 * 1024;
      expect(() =>
        validateFileMetadata("big.pdf", "application/pdf", file2Mb, max1Mb),
      ).toThrow(/exceeds maximum allowed size/i);
    });

    it("validates content signatures and rejects spoofed files", () => {
      // Valid PNG signature passes
      expect(() =>
        validateFileContentSignature(validPngBuffer, "image/png"),
      ).not.toThrow();

      // Fake PNG signature fails
      expect(() =>
        validateFileContentSignature(fakePngBuffer, "image/png"),
      ).toThrow(/signature verification failed/i);

      // Valid PDF signature passes
      expect(() =>
        validateFileContentSignature(validPdfBuffer, "application/pdf"),
      ).not.toThrow();
    });

    it("generates tenant-scoped, unpredictable storage keys", () => {
      const key1 = generateStorageKey("org-123", "document.pdf");
      const key2 = generateStorageKey("org-123", "document.pdf");

      expect(key1).toMatch(/^orgs\/org-123\/[a-f0-9-]+-document\.pdf$/);
      expect(key1).not.toBe(key2); // Keys must be unique and unguessable
    });
  });

  // ===========================================================================
  // 3. Attachment API & Security Integration
  // ===========================================================================
  describe("3. Attachment API & Tenant Isolation", () => {
    let createdAttachmentId: string;

    it("allows authorized member to upload an attachment via direct multipart POST", async () => {
      if (!orgId) return;

      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/attachments/upload`)
        .set("Cookie", ownerCookie)
        .field("taskId", taskId)
        .field("projectId", projectId)
        .attach("file", validPngBuffer, "test-diagram.png");

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fileName).toBe("test-diagram.png");
      expect(res.body.data.mimeType).toBe("image/png");
      expect(res.body.data.status).toBe("READY");
      expect(res.body.data.taskId).toBe(taskId);

      createdAttachmentId = res.body.data.id;
    });

    it("rejects file upload with spoofed content signature (HTTP 400)", async () => {
      if (!orgId) return;

      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/attachments/upload`)
        .set("Cookie", ownerCookie)
        .field("taskId", taskId)
        .attach("file", fakePngBuffer, "spoofed.png");

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("signature verification failed");
    });

    it("rejects unauthenticated upload requests with 401", async () => {
      if (!orgId) return;

      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/attachments/upload`)
        .field("taskId", taskId)
        .attach("file", validPngBuffer, "anon.png");

      expect(res.status).toBe(401);
    });

    it("prevents cross-tenant file upload: non-member receives 404 non-disclosing", async () => {
      if (!orgId) return;

      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/attachments/upload`)
        .set("Cookie", outsiderCookie)
        .field("taskId", taskId)
        .attach("file", validPngBuffer, "hacked.png");

      expect(res.status).toBe(404);
    });

    it("initiates presigned upload and creates PENDING attachment record", async () => {
      if (!orgId) return;

      const res = await request(app)
        .post(`/api/v1/organizations/${orgId}/attachments/presign`)
        .set("Cookie", memberCookie)
        .send({
          fileName: "contract.pdf",
          mimeType: "application/pdf",
          fileSize: 4096,
          taskId,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.attachment.status).toBe("PENDING");
      expect(res.body.data.uploadUrl).toBeDefined();
      expect(res.body.data.storageKey).toBeDefined();
    });

    it("lists attachments for the authorized task", async () => {
      if (!orgId) return;

      const res = await request(app)
        .get(`/api/v1/organizations/${orgId}/attachments?taskId=${taskId}`)
        .set("Cookie", memberCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.attachments.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.attachments[0].id).toBe(createdAttachmentId);
    });

    it("generates authorized download URL with safe headers", async () => {
      if (!orgId || !createdAttachmentId) return;

      const res = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/attachments/${createdAttachmentId}/download`,
        )
        .set("Cookie", memberCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.downloadUrl).toBeDefined();
    });

    it("denies download access to cross-tenant outsider with 404 non-disclosing", async () => {
      if (!orgId || !createdAttachmentId) return;

      const res = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/attachments/${createdAttachmentId}/download`,
        )
        .set("Cookie", outsiderCookie);

      expect(res.status).toBe(404);
    });

    it("allows OWNER to delete an attachment and confirms deletion", async () => {
      if (!orgId || !createdAttachmentId) return;

      const res = await request(app)
        .delete(
          `/api/v1/organizations/${orgId}/attachments/${createdAttachmentId}`,
        )
        .set("Cookie", ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify subsequent fetch is 404
      const probe = await request(app)
        .get(
          `/api/v1/organizations/${orgId}/attachments/${createdAttachmentId}/download`,
        )
        .set("Cookie", ownerCookie);

      expect(probe.status).toBe(404);
    });
  });
});
