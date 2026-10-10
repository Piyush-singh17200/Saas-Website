import { describe, it, expect } from "vitest";
import { redactSensitiveData } from "../lib/logger.js";

describe("Structured JSON Logger & Redaction", () => {
  it("recursively redacts sensitive keys such as password, token, and secret", () => {
    const input = {
      userId: "u-123",
      email: "alice@example.com",
      password: "SuperSecretPassword123!",
      session: {
        token: "tok_raw_session_abc",
        cookie: "workspace_session=xyz",
      },
      stripeWebhookSecret: "whsec_12345",
      metadata: {
        apiKey: "pk_live_abcdef",
        creditCard: "4111111111111111",
        normalField: "visible data",
      },
    };

    const sanitized = redactSensitiveData(input) as any;

    expect(sanitized.userId).toBe("u-123");
    expect(sanitized.email).toBe("alice@example.com");
    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.session.token).toBe("[REDACTED]");
    expect(sanitized.session.cookie).toBe("[REDACTED]");
    expect(sanitized.stripeWebhookSecret).toBe("[REDACTED]");
    expect(sanitized.metadata.apiKey).toBe("[REDACTED]");
    expect(sanitized.metadata.creditCard).toBe("[REDACTED]");
    expect(sanitized.metadata.normalField).toBe("visible data");
  });

  it("redacts authorization header strings containing bearer tokens", () => {
    const header = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz";
    const sanitized = redactSensitiveData(header);
    expect(sanitized).toBe("Bearer [REDACTED]");
  });

  it("handles circular references without throwing or stack overflow", () => {
    const circularObj: any = { name: "test-node" };
    circularObj.self = circularObj;

    const sanitized = redactSensitiveData(circularObj) as any;
    expect(sanitized.name).toBe("test-node");
    expect(sanitized.self).toBe("[CIRCULAR]");
  });

  it("sanitizes Error objects preserving message and stack", () => {
    const error = new Error("Something went wrong");
    const sanitized = redactSensitiveData(error) as any;

    expect(sanitized.name).toBe("Error");
    expect(sanitized.message).toBe("Something went wrong");
    expect(typeof sanitized.stack).toBe("string");
  });
});
