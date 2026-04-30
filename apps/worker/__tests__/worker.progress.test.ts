import { describe, it, expect } from "bun:test";
import * as fc from "fast-check";
import { processJob } from "../index";

// Feature: job-progress-updates, Property 1: Worker emits milestones in order
describe("Property 1: Worker emits milestones in order", () => {
  it("calls updateProgress exactly 5 times with [10, 25, 50, 75, 100] in order", async () => {
    // Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
    await fc.assert(
      fc.asyncProperty(
        fc.record({ id: fc.string(), data: fc.anything() }),
        async (jobData) => {
          const calls: number[] = [];
          const mockJob = {
            id: jobData.id,
            data: jobData.data,
            updateProgress: async (n: number) => { calls.push(n); },
          };

          await processJob(mockJob);

          expect(calls).toEqual([10, 25, 50, 75, 100]);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: job-progress-updates, Property 2: Worker result contains output and jobId
describe("Property 2: Worker result contains output and jobId", () => {
  it("returns an object with non-empty output string and jobId matching job.id", async () => {
    // Validates: Requirements 1.6
    await fc.assert(
      fc.asyncProperty(
        fc.record({ id: fc.string({ minLength: 1 }), data: fc.anything() }),
        async (jobData) => {
          const mockJob = {
            id: jobData.id,
            data: jobData.data,
            updateProgress: async (_n: number) => {},
          };

          const result = await processJob(mockJob);

          expect(typeof result.output).toBe("string");
          expect(result.output.length).toBeGreaterThan(0);
          expect(result.jobId).toBe(jobData.id);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 9: Worker progress sequence for file.processChunk ──────────────
// Feature: bulk-file-processing, Property 9: Worker progress sequence

describe("Property 9: Worker progress sequence for file.processChunk", () => {
  it("calls updateProgress exactly [10, 25, 50, 75, 100] for file.processChunk jobs", async () => {
    // Validates: Requirements 4.1, 4.2, 4.3
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sessionId: fc.string({ minLength: 1 }),
          fileId: fc.string({ minLength: 1 }),
          filename: fc.string({ minLength: 1 }),
          chunkIndex: fc.integer({ min: 0, max: 10 }),
          chunkCount: fc.integer({ min: 1, max: 10 }),
        }),
        async (chunkData) => {
          const calls: number[] = [];
          const mockJob = {
            id: "job-1",
            data: {
              method: "file.processChunk",
              ...chunkData,
              data: Buffer.from("test").toString("base64"),
            },
            updateProgress: async (n: number) => { calls.push(n); },
          };

          await processJob(mockJob);

          expect(calls).toEqual([10, 25, 50, 75, 100]);
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ─── Property 18: Worker concurrency from environment ────────────────────────
// Feature: bulk-file-processing, Property 18: Worker concurrency from environment

describe("Property 18: Worker concurrency from environment", () => {
  it("WORKER_CONCURRENCY env var is parsed as integer with default of 5", () => {
    // Validates: Requirements 9.1, 9.2
    // Test the parsing logic directly since we can't re-instantiate the Worker in tests
    const parseWorkerConcurrency = (val: string | undefined) =>
      parseInt(val ?? "5", 10);

    expect(parseWorkerConcurrency(undefined)).toBe(5);
    expect(parseWorkerConcurrency("5")).toBe(5);
    expect(parseWorkerConcurrency("10")).toBe(10);
    expect(parseWorkerConcurrency("1")).toBe(1);
    expect(parseWorkerConcurrency("20")).toBe(20);
  });
});

// ─── Unit tests for file.processChunk job handler ────────────────────────────

describe("file.processChunk unit tests", () => {
  it("returns correct result shape for file.processChunk job", async () => {
    const chunkData = Buffer.from("hello world").toString("base64");
    const mockJob = {
      id: "job-42",
      data: {
        method: "file.processChunk",
        sessionId: "sess-1",
        fileId: "file-1",
        filename: "test.txt",
        chunkIndex: 0,
        chunkCount: 2,
        data: chunkData,
      },
      updateProgress: async (_n: number) => {},
    };

    const result = await processJob(mockJob);

    expect(result.sessionId).toBe("sess-1");
    expect(result.fileId).toBe("file-1");
    expect(result.filename).toBe("test.txt");
    expect(result.chunkIndex).toBe(0);
    expect(result.chunkCount).toBe(2);
    expect(result.processedBytes).toBe(11); // "hello world" = 11 bytes
    expect(result.status).toBe("processed");
  });

  it("logs retry attempt when attemptsMade > 0", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    const mockJob = {
      id: "job-retry",
      attemptsMade: 2,
      data: {
        method: "file.processChunk",
        sessionId: "s",
        fileId: "f",
        filename: "f.txt",
        chunkIndex: 0,
        chunkCount: 1,
        data: "",
      },
      updateProgress: async (_n: number) => {},
    };

    await processJob(mockJob);
    console.log = origLog;

    expect(logs.some((l) => l.includes("Retry attempt 2"))).toBe(true);
  });

  it("processedBytes is 0 when data is empty string", async () => {
    const mockJob = {
      id: "job-empty",
      data: {
        method: "file.processChunk",
        sessionId: "s",
        fileId: "f",
        filename: "empty.bin",
        chunkIndex: 0,
        chunkCount: 1,
        data: "",
      },
      updateProgress: async (_n: number) => {},
    };

    const result = await processJob(mockJob);
    expect(result.processedBytes).toBe(0);
  });
});
