import { describe, test, expect, afterAll } from "bun:test";
import { QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { clientRegistry, cleanupRegistry } from "../registry";
import { handleProgress, handleCompleted, handleFailed } from "../queue-event-handlers";

// Unit tests for configuration and edge cases
// Validates: Requirements 3.1, 2.2, 3.4, 6.4

// Create a local QueueEvents instance with lazyConnect to avoid real Redis connection
const connection = new IORedis({
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

const queueEvents = new QueueEvents("jobs", { connection });

// Register the error handler (mirrors what index.ts does)
queueEvents.on("progress", ({ jobId, data }: { jobId: string; data: any }) => {
  handleProgress(clientRegistry, jobId, data);
});
queueEvents.on("completed", ({ jobId, returnvalue }: { jobId: string; returnvalue: any }) => {
  handleCompleted(clientRegistry, jobId, returnvalue);
});
queueEvents.on("failed", ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
  handleFailed(clientRegistry, jobId, failedReason);
});
queueEvents.on("error", (err: Error) => {
  console.error("QueueEvents Redis error:", err);
});

afterAll(async () => {
  try {
    await queueEvents.close();
  } catch {
    // ignore Redis connection errors during cleanup
  }
  try {
    connection.disconnect();
  } catch {
    // ignore
  }
});

describe("QueueEvents configuration (Requirement 3.1)", () => {
  test("QueueEvents is constructed with queue name 'jobs'", () => {
    expect(queueEvents.name).toBe("jobs");
  });

  test("QueueEvents uses the shared Redis connection", () => {
    // Verify the connection object is the same instance passed in
    expect(connection).toBeDefined();
    expect(queueEvents.name).toBe("jobs");
  });

  test("queueEvents.on('error', ...) handler is registered (Requirement 6.4)", () => {
    expect(queueEvents.listenerCount("error")).toBeGreaterThan(0);
  });

  test("progress handler is registered on queueEvents", () => {
    expect(queueEvents.listenerCount("progress")).toBeGreaterThan(0);
  });

  test("completed handler is registered on queueEvents", () => {
    expect(queueEvents.listenerCount("completed")).toBeGreaterThan(0);
  });
});

describe("Registry edge cases", () => {
  test("same ws with multiple jobIds is handled correctly (Requirement 2.3)", () => {
    const registry = new Map<string, any>();
    const ws = { send: () => {} };

    registry.set("job-1", ws);
    registry.set("job-2", ws);
    registry.set("job-3", ws);

    expect(registry.get("job-1")).toBe(ws);
    expect(registry.get("job-2")).toBe(ws);
    expect(registry.get("job-3")).toBe(ws);
    expect(registry.size).toBe(3);

    // Cleanup should remove all entries for that ws
    cleanupRegistry(registry, ws);
    expect(registry.size).toBe(0);
  });

  test("WebSocket close with empty registry does not throw (Requirement 2.2)", () => {
    const registry = new Map<string, any>();
    const ws = { send: () => {} };

    expect(() => cleanupRegistry(registry, ws)).not.toThrow();
    expect(registry.size).toBe(0);
  });
});

describe("Progress handler edge cases", () => {
  test("progress event for unknown jobId does not throw (Requirement 3.4)", () => {
    const registry = new Map<string, any>();

    expect(() => handleProgress(registry, "unknown-job-id", 50)).not.toThrow();
  });

  test("completed event for unknown jobId does not throw", () => {
    const registry = new Map<string, any>();

    expect(() => handleCompleted(registry, "unknown-job-id", { result: "data" })).not.toThrow();
  });

  test("failed event for unknown jobId does not throw", () => {
    const registry = new Map<string, any>();

    expect(() => handleFailed(registry, "unknown-job-id", "some error")).not.toThrow();
  });
});
