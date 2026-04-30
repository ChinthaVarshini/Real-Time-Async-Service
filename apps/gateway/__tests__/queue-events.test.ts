import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import { handleProgress, handleCompleted, handleFailed } from "../queue-event-handlers";

function makeMockWs() {
  const sent: string[] = [];
  return {
    send: (msg: string) => { sent.push(msg); },
    sent,
  };
}

// Feature: job-progress-updates, Property 5: Progress message shape
describe("Property 5: Progress message shape", () => {
  test("progress handler sends valid JSON-RPC 2.0 notification with correct fields and no id", () => {
    // Validates: Requirements 4.1, 4.2, 4.5
    fc.assert(
      fc.property(
        fc.record({ jobId: fc.string(), data: fc.integer({ min: 0, max: 100 }) }),
        ({ jobId, data }) => {
          const ws = makeMockWs();
          const registry = new Map<string, any>();
          registry.set(jobId, ws);

          handleProgress(registry, jobId, data);

          expect(ws.sent).toHaveLength(1);
          const msg = JSON.parse(ws.sent[0]);
          expect(msg.jsonrpc).toBe("2.0");
          expect(msg.method).toBe("job.progress");
          expect(msg.params.jobId).toBe(jobId);
          expect(msg.params.progress).toBe(data);
          expect("id" in msg).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: job-progress-updates, Property 6: Result message shape
describe("Property 6: Result message shape", () => {
  test("completed handler sends valid JSON-RPC 2.0 notification with correct fields and no id", () => {
    // Validates: Requirements 4.3, 4.4, 4.5
    fc.assert(
      fc.property(
        fc.record({ jobId: fc.string(), returnvalue: fc.jsonValue() }),
        ({ jobId, returnvalue }) => {
          const ws = makeMockWs();
          const registry = new Map<string, any>();
          registry.set(jobId, ws);

          handleCompleted(registry, jobId, returnvalue);

          expect(ws.sent).toHaveLength(1);
          const msg = JSON.parse(ws.sent[0]);
          expect(msg.jsonrpc).toBe("2.0");
          expect(msg.method).toBe("job.result");
          expect(msg.params.jobId).toBe(jobId);
          // Compare via JSON round-trip since -0 serializes to 0
          expect(msg.params.result).toEqual(JSON.parse(JSON.stringify(returnvalue)));
          expect("id" in msg).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: job-progress-updates, Property 7: Progress routing — known jobId delivers, unknown jobId discards
describe("Property 7: Progress routing", () => {
  test("ws.send called exactly once when jobId is in registry; not called when absent; no error thrown", () => {
    // Validates: Requirements 3.2, 3.3, 3.4
    fc.assert(
      fc.property(
        fc.record({ jobId: fc.string({ minLength: 1 }), data: fc.integer({ min: 0, max: 100 }) }),
        fc.boolean(),
        ({ jobId, data }, inRegistry) => {
          const ws = makeMockWs();
          const registry = new Map<string, any>();
          if (inRegistry) registry.set(jobId, ws);

          expect(() => handleProgress(registry, jobId, data)).not.toThrow();

          if (inRegistry) {
            expect(ws.sent).toHaveLength(1);
          } else {
            expect(ws.sent).toHaveLength(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: job-progress-updates, Property 8: Completion event triggers result send and registry cleanup
describe("Property 8: Completion event triggers result send and registry cleanup", () => {
  test("ws.send called then registry entry removed after completed event", () => {
    // Validates: Requirements 3.5, 3.6
    fc.assert(
      fc.property(
        fc.record({ jobId: fc.string({ minLength: 1 }), returnvalue: fc.anything() }),
        ({ jobId, returnvalue }) => {
          const ws = makeMockWs();
          const registry = new Map<string, any>();
          registry.set(jobId, ws);

          handleCompleted(registry, jobId, returnvalue);

          expect(ws.sent).toHaveLength(1);
          expect(registry.get(jobId)).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: job-progress-updates, Property 9: Result message is sent only on completed event, not on progress(100)
describe("Property 9: Result message is sent only on completed event, not on progress(100)", () => {
  test("progress handler with data=100 never sends job.result", () => {
    // Validates: Requirements 5.3
    fc.assert(
      fc.property(
        fc.record({ jobId: fc.string({ minLength: 1 }), data: fc.constant(100) }),
        ({ jobId, data }) => {
          const ws = makeMockWs();
          const registry = new Map<string, any>();
          registry.set(jobId, ws);

          handleProgress(registry, jobId, data);

          expect(ws.sent).toHaveLength(1);
          const msg = JSON.parse(ws.sent[0]);
          expect(msg.method).not.toBe("job.result");
          expect(msg.method).toBe("job.progress");
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: job-progress-updates, Property 10: Failure message shape and registry cleanup
describe("Property 10: Failure message shape and registry cleanup", () => {
  test("failed handler sends job.failed notification with correct params and removes registry entry", () => {
    // Validates: Requirements 6.1, 6.2
    fc.assert(
      fc.property(
        fc.record({ jobId: fc.string({ minLength: 1 }), failedReason: fc.string() }),
        ({ jobId, failedReason }) => {
          const ws = makeMockWs();
          const registry = new Map<string, any>();
          registry.set(jobId, ws);

          handleFailed(registry, jobId, failedReason);

          expect(ws.sent).toHaveLength(1);
          const msg = JSON.parse(ws.sent[0]);
          expect(msg.jsonrpc).toBe("2.0");
          expect(msg.method).toBe("job.failed");
          expect(msg.params.jobId).toBe(jobId);
          expect(msg.params.error).toBe(failedReason);
          expect("id" in msg).toBe(false);
          expect(registry.get(jobId)).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
