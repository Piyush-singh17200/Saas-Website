import { describe, it, expect } from "vitest";
import {
  generateTotpSecret,
  generateCurrentTotp,
  verifyTotp,
  encryptSecret,
  decryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  constantTimeCompare,
} from "../lib/crypto.js";
import { CreateTaskInputSchema } from "@workspace/contracts";

interface LatencyStats {
  count: number;
  totalDurationMs: number;
  opsPerSec: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

function calculatePercentiles(latenciesMs: number[]): LatencyStats {
  latenciesMs.sort((a, b) => a - b);
  const count = latenciesMs.length;
  const totalDurationMs = latenciesMs.reduce((acc, v) => acc + v, 0);
  const opsPerSec = Math.round(count / (totalDurationMs / 1000));

  const p50Index = Math.floor(count * 0.5);
  const p95Index = Math.floor(count * 0.95);
  const p99Index = Math.floor(count * 0.99);

  return {
    count,
    totalDurationMs: Math.round(totalDurationMs * 100) / 100,
    opsPerSec,
    p50Ms: Math.round((latenciesMs[p50Index] ?? 0) * 1000) / 1000,
    p95Ms: Math.round((latenciesMs[p95Index] ?? 0) * 1000) / 1000,
    p99Ms: Math.round((latenciesMs[p99Index] ?? 0) * 1000) / 1000,
  };
}

describe("Performance & Reliability Benchmarks (Bounded Workload)", () => {
  it("benchmarks AES-256-GCM secret encryption and decryption latency percentiles", () => {
    const iterations = 1000;
    const testSecret = "JBSWY3DPEHPK3PXP"; // 16-char Base32 RFC test secret
    const latencies: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const encrypted = encryptSecret(testSecret);
      const decrypted = decryptSecret(encrypted);
      const end = performance.now();
      expect(decrypted).toBe(testSecret);
      latencies.push(end - start);
    }

    const stats = calculatePercentiles(latencies);
    console.log("[Benchmark] AES-256-GCM Encrypt/Decrypt Roundtrip:", stats);

    // Target: p95 latency should be under 5ms for local symmetric crypto
    expect(stats.p95Ms).toBeLessThan(5.0);
    expect(stats.opsPerSec).toBeGreaterThan(1000);
  });

  it("benchmarks RFC 6238 TOTP generation and verification throughput", () => {
    const iterations = 1000;
    const testSecret = generateTotpSecret();
    const latencies: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const code = generateCurrentTotp(testSecret);
      const res = verifyTotp(testSecret, code);
      const end = performance.now();
      expect(res.valid).toBe(true);
      latencies.push(end - start);
    }

    const stats = calculatePercentiles(latencies);
    console.log("[Benchmark] TOTP Gen & Verify:", stats);

    expect(stats.p95Ms).toBeLessThan(5.0);
    expect(stats.opsPerSec).toBeGreaterThan(1000);
  });

  it("benchmarks SHA-256 Recovery Code generation and hash verification throughput", () => {
    const iterations = 500;
    const latencies: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const codes = generateRecoveryCodes(10);
      const sample = codes[0]!;
      const hash1 = hashRecoveryCode(sample);
      const hash2 = hashRecoveryCode(sample.toLowerCase());
      const verified = constantTimeCompare(hash1, hash2);
      const end = performance.now();
      expect(verified).toBe(true);
      latencies.push(end - start);
    }

    const stats = calculatePercentiles(latencies);
    console.log("[Benchmark] Recovery Codes Gen (10x) & Hash Verify:", stats);

    expect(stats.p95Ms).toBeLessThan(10.0);
    expect(stats.opsPerSec).toBeGreaterThan(200);
  });

  it("benchmarks Zod Task Contract validation throughput under high request volume", () => {
    const iterations = 5000;
    const taskPayload = {
      title: "Benchmark High-Volume Task Validation",
      description: "Measure Zod schema throughput under bounded load",
      status: "IN_PROGRESS",
      priority: "HIGH",
      dueDate: "2026-12-31T23:59:59.000Z",
    };
    const latencies: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const parsed = CreateTaskInputSchema.safeParse(taskPayload);
      const end = performance.now();
      expect(parsed.success).toBe(true);
      latencies.push(end - start);
    }

    const stats = calculatePercentiles(latencies);
    console.log("[Benchmark] Zod Task Validation Throughput:", stats);

    // Target: p95 latency should be sub-millisecond
    expect(stats.p95Ms).toBeLessThan(1.0);
    expect(stats.opsPerSec).toBeGreaterThan(5000);
  });
});
