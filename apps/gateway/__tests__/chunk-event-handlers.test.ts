import { test, expect, describe } from "bun:test";
import fc from "fast-check";
import { handleChunkProgress, handleChunkCompleted, handleChunkFailed } from "../chunk-event-handlers";
import { SessionStore } from "../session-store";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeMockWs() {
  const messages: any[] = [];
  return {
    send: (msg: string) => messages.push(JSON.parse(msg)),
    messages,
  };
}

/** Set up a session with N files, each with M chunks, returning jobId arrays per file */
function setupSession(store: SessionStore, ws: any, fileCount: number, chunksPerFile: number) {
  const session = store.createSession(ws);
  const files: Array<{ fileId: string; filename: string; jobIds: string[] }> = [];

  for (let f = 0; f < fileCount; f++) {
    const fileId = crypto.randomUUID();
    const filename = `file${f}.txt`;
    const jobIds = Array.from({ length: chunksPerFile }, () => crypto.randomUUID());
    store.addFile(session.sessionId, {
      fileId,
      filename,
      mimeType: "text/plain",
      chunkCount: chunksPerFile,
      jobIds,
    });
    files.push({ fileId, filename, jobIds });
  }

  return { session, files };
}

// ─── Property 10: chunk.progress notification shape ─────────────────────────
// Feature: bulk-file-processing, Property 10: chunk.progress notification shape

describe("Property 10: chunk.progress notification shape", () => {
  test("chunk.progress notification has correct shape for any valid progress value", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        (progress) => {
          const ws = makeMockWs();
          const store = new SessionStore();
          const { session, files } = setupSession(store, ws, 1, 1);
          const jobId = files[0].jobIds[0];

          handleChunkProgress(store, jobId, progress);

          // Find the chunk.progress notification (may be preceded by file.processing)
          const chunkProgressMsg = ws.messages.find((m: any) => m.method === "chunk.progress");
          expect(chunkProgressMsg).toBeDefined();
          expect(chunkProgressMsg.jsonrpc).toBe("2.0");
          expect(chunkProgressMsg.method).toBe("chunk.progress");
          expect(chunkProgressMsg.id).toBeUndefined();
          const p = chunkProgressMsg.params;
          expect(p.sessionId).toBe(session.sessionId);
          expect(p.fileId).toBe(files[0].fileId);
          expect(p.filename).toBe(files[0].filename);
          expect(p.chunkIndex).toBe(0);
          expect(p.chunkCount).toBe(1);
          expect(p.progress).toBe(progress);
          expect(typeof p.seq).toBe("number");
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 11: file.completed notification shape and aggregation order ────
// Feature: bulk-file-processing, Property 11: file.completed notification shape and aggregation order

describe("Property 11: file.completed notification shape and aggregation order", () => {
  test("file.completed contains correct fields and results in chunkIndex order", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        (chunkCount) => {
          const ws = makeMockWs();
          const store = new SessionStore();
          const { session, files } = setupSession(store, ws, 1, chunkCount);
          const { jobIds } = files[0];

          // Complete all chunks with distinct results
          for (let i = 0; i < chunkCount; i++) {
            handleChunkCompleted(store, jobIds[i], { output: `chunk-${i}` });
          }

          const completedMsg = ws.messages.find((m: any) => m.method === "file.completed");
          expect(completedMsg).toBeDefined();
          expect(completedMsg.jsonrpc).toBe("2.0");
          expect(completedMsg.id).toBeUndefined();
          const p = completedMsg.params;
          expect(p.sessionId).toBe(session.sessionId);
          expect(p.fileId).toBe(files[0].fileId);
          expect(p.filename).toBe(files[0].filename);
          expect(Array.isArray(p.result)).toBe(true);
          expect(p.result.length).toBe(chunkCount);
          // Results must be in chunkIndex order
          for (let i = 0; i < chunkCount; i++) {
            expect(p.result[i]).toEqual({ output: `chunk-${i}` });
          }
          expect(typeof p.completedCount).toBe("number");
          expect(typeof p.totalCount).toBe("number");
          expect(typeof p.seq).toBe("number");
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 12: No premature file.completed ────────────────────────────────
// Feature: bulk-file-processing, Property 12: No premature file.completed

describe("Property 12: No premature file.completed", () => {
  test("file.completed is not emitted while any chunk is still pending", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        (chunkCount) => {
          const ws = makeMockWs();
          const store = new SessionStore();
          const { files } = setupSession(store, ws, 1, chunkCount);
          const { jobIds } = files[0];

          // Complete all but the last chunk
          for (let i = 0; i < chunkCount - 1; i++) {
            handleChunkCompleted(store, jobIds[i], { output: `chunk-${i}` });
          }

          const completedMsg = ws.messages.find((m: any) => m.method === "file.completed");
          expect(completedMsg).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 13: file.failed notification shape ─────────────────────────────
// Feature: bulk-file-processing, Property 13: file.failed notification shape

describe("Property 13: file.failed notification shape", () => {
  test("file.failed notification has correct shape with all required fields", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (errorMsg) => {
          const ws = makeMockWs();
          const store = new SessionStore();
          const { session, files } = setupSession(store, ws, 1, 1);
          const jobId = files[0].jobIds[0];

          handleChunkFailed(store, jobId, errorMsg);

          const failedMsg = ws.messages.find((m: any) => m.method === "file.failed");
          expect(failedMsg).toBeDefined();
          expect(failedMsg.jsonrpc).toBe("2.0");
          expect(failedMsg.id).toBeUndefined();
          const p = failedMsg.params;
          expect(p.sessionId).toBe(session.sessionId);
          expect(p.fileId).toBe(files[0].fileId);
          expect(p.filename).toBe(files[0].filename);
          expect(p.error).toBe(errorMsg);
          expect(p.failedChunkIndex).toBe(0);
          expect(typeof p.totalCount).toBe("number");
          expect(typeof p.seq).toBe("number");
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 14: file.processing notification on first chunk start ──────────
// Feature: bulk-file-processing, Property 14: file.processing notification on first chunk start

describe("Property 14: file.processing notification on first chunk start", () => {
  test("file.processing is sent when first chunk progress event arrives", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        (chunkCount) => {
          const ws = makeMockWs();
          const store = new SessionStore();
          const { session, files } = setupSession(store, ws, 1, chunkCount);
          const jobId = files[0].jobIds[0];

          handleChunkProgress(store, jobId, 10);

          const processingMsg = ws.messages.find((m: any) => m.method === "file.processing");
          expect(processingMsg).toBeDefined();
          expect(processingMsg.jsonrpc).toBe("2.0");
          expect(processingMsg.id).toBeUndefined();
          const p = processingMsg.params;
          expect(p.sessionId).toBe(session.sessionId);
          expect(p.fileId).toBe(files[0].fileId);
          expect(p.filename).toBe(files[0].filename);
          expect(typeof p.seq).toBe("number");
        }
      ),
      { numRuns: 100 }
    );
  });

  test("file.processing is sent only once per file even with multiple chunk progress events", () => {
    const ws = makeMockWs();
    const store = new SessionStore();
    const { files } = setupSession(store, ws, 1, 2);

    handleChunkProgress(store, files[0].jobIds[0], 10);
    handleChunkProgress(store, files[0].jobIds[0], 50);
    handleChunkProgress(store, files[0].jobIds[1], 10);

    const processingMsgs = ws.messages.filter((m: any) => m.method === "file.processing");
    expect(processingMsgs.length).toBe(1);
  });
});

// ─── Property 15: session.completed on all-terminal ─────────────────────────
// Feature: bulk-file-processing, Property 15: session.completed on all-terminal

describe("Property 15: session.completed on all-terminal", () => {
  test("session.completed is emitted when all files complete", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        (fileCount) => {
          const ws = makeMockWs();
          const store = new SessionStore();
          const { session, files } = setupSession(store, ws, fileCount, 1);

          for (const file of files) {
            handleChunkCompleted(store, file.jobIds[0], { output: "done" });
          }

          const completedMsg = ws.messages.find((m: any) => m.method === "session.completed");
          expect(completedMsg).toBeDefined();
          expect(completedMsg.jsonrpc).toBe("2.0");
          expect(completedMsg.id).toBeUndefined();
          const p = completedMsg.params;
          expect(p.sessionId).toBe(session.sessionId);
          expect(p.totalCount).toBe(fileCount);
          expect(p.completedCount).toBe(fileCount);
          expect(p.failedCount).toBe(0);
          expect(p.durationMs).toBeGreaterThanOrEqual(0);
          expect(typeof p.seq).toBe("number");
        }
      ),
      { numRuns: 100 }
    );
  });

  test("session.completed is emitted when all files fail", () => {
    const ws = makeMockWs();
    const store = new SessionStore();
    const { session, files } = setupSession(store, ws, 2, 1);

    handleChunkFailed(store, files[0].jobIds[0], "err1");
    handleChunkFailed(store, files[1].jobIds[0], "err2");

    const completedMsg = ws.messages.find((m: any) => m.method === "session.completed");
    expect(completedMsg).toBeDefined();
    expect(completedMsg.params.failedCount).toBe(2);
    expect(completedMsg.params.completedCount).toBe(0);
  });

  test("session.completed is not emitted while any file is still pending", () => {
    const ws = makeMockWs();
    const store = new SessionStore();
    const { files } = setupSession(store, ws, 2, 1);

    // Only complete the first file
    handleChunkCompleted(store, files[0].jobIds[0], { output: "done" });

    const completedMsg = ws.messages.find((m: any) => m.method === "session.completed");
    expect(completedMsg).toBeUndefined();
  });
});

// ─── Property 19: Outbound notifications have no id field ────────────────────
// Feature: bulk-file-processing, Property 19: Outbound notifications have no id field

describe("Property 19: Outbound notifications have no id field", () => {
  test("all outbound notifications have jsonrpc 2.0, method, params, and no id", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }),
        (fileCount) => {
          const ws = makeMockWs();
          const store = new SessionStore();
          const { files } = setupSession(store, ws, fileCount, 1);

          // Trigger all notification types
          for (const file of files) {
            handleChunkProgress(store, file.jobIds[0], 50);
            handleChunkCompleted(store, file.jobIds[0], { output: "done" });
          }

          for (const msg of ws.messages) {
            expect(msg.jsonrpc).toBe("2.0");
            expect(typeof msg.method).toBe("string");
            expect(msg.params).toBeDefined();
            expect(msg.id).toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 21: seq is monotonically increasing per session ────────────────
// Feature: bulk-file-processing, Property 21: seq is monotonically increasing per session

describe("Property 21: seq is monotonically increasing per session", () => {
  test("seq values in notifications are strictly increasing", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }),
        (fileCount) => {
          const ws = makeMockWs();
          const store = new SessionStore();
          const { files } = setupSession(store, ws, fileCount, 1);

          for (const file of files) {
            handleChunkProgress(store, file.jobIds[0], 50);
            handleChunkCompleted(store, file.jobIds[0], { output: "done" });
          }

          const seqs = ws.messages.map((m: any) => m.params.seq);
          for (let i = 1; i < seqs.length; i++) {
            expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Unit tests for chunk-event-handlers ─────────────────────────────────────

describe("chunk-event-handlers unit tests", () => {
  test("orphaned jobId in chunk.progress logs and does not throw", () => {
    const store = new SessionStore();
    // Should not throw for unknown jobId
    expect(() => handleChunkProgress(store, "unknown-job", 50)).not.toThrow();
  });

  test("orphaned jobId in chunk.completed logs and does not throw", () => {
    const store = new SessionStore();
    expect(() => handleChunkCompleted(store, "unknown-job", {})).not.toThrow();
  });

  test("orphaned jobId in chunk.failed logs and does not throw", () => {
    const store = new SessionStore();
    expect(() => handleChunkFailed(store, "unknown-job", "error")).not.toThrow();
  });

  test("file.processing is sent on first chunk progress, not on subsequent ones", () => {
    const ws = makeMockWs();
    const store = new SessionStore();
    const { files } = setupSession(store, ws, 1, 1);

    handleChunkProgress(store, files[0].jobIds[0], 10);
    handleChunkProgress(store, files[0].jobIds[0], 50);

    const processingMsgs = ws.messages.filter((m: any) => m.method === "file.processing");
    expect(processingMsgs.length).toBe(1);
  });

  test("file.completed aggregates chunk results in chunkIndex order", () => {
    const ws = makeMockWs();
    const store = new SessionStore();
    const { files } = setupSession(store, ws, 1, 3);
    const { jobIds } = files[0];

    // Complete in reverse order to verify sorting
    handleChunkCompleted(store, jobIds[2], { output: "chunk-2" });
    handleChunkCompleted(store, jobIds[1], { output: "chunk-1" });
    handleChunkCompleted(store, jobIds[0], { output: "chunk-0" });

    const completedMsg = ws.messages.find((m: any) => m.method === "file.completed");
    expect(completedMsg).toBeDefined();
    expect(completedMsg.params.result[0]).toEqual({ output: "chunk-0" });
    expect(completedMsg.params.result[1]).toEqual({ output: "chunk-1" });
    expect(completedMsg.params.result[2]).toEqual({ output: "chunk-2" });
  });

  test("file.failed sets failedChunkIndex correctly", () => {
    const ws = makeMockWs();
    const store = new SessionStore();
    const { files } = setupSession(store, ws, 1, 3);

    // Fail the second chunk (index 1)
    handleChunkFailed(store, files[0].jobIds[1], "timeout");

    const failedMsg = ws.messages.find((m: any) => m.method === "file.failed");
    expect(failedMsg).toBeDefined();
    expect(failedMsg.params.failedChunkIndex).toBe(1);
    expect(failedMsg.params.error).toBe("timeout");
  });

  test("completedCount increments correctly across multiple files", () => {
    const ws = makeMockWs();
    const store = new SessionStore();
    const { files } = setupSession(store, ws, 3, 1);

    handleChunkCompleted(store, files[0].jobIds[0], {});
    handleChunkCompleted(store, files[1].jobIds[0], {});
    handleChunkCompleted(store, files[2].jobIds[0], {});

    const completedMsgs = ws.messages.filter((m: any) => m.method === "file.completed");
    expect(completedMsgs[0].params.completedCount).toBe(1);
    expect(completedMsgs[1].params.completedCount).toBe(2);
    expect(completedMsgs[2].params.completedCount).toBe(3);
  });

  test("session.completed durationMs is non-negative", () => {
    const ws = makeMockWs();
    const store = new SessionStore();
    const { files } = setupSession(store, ws, 1, 1);

    handleChunkCompleted(store, files[0].jobIds[0], {});

    const sessionMsg = ws.messages.find((m: any) => m.method === "session.completed");
    expect(sessionMsg).toBeDefined();
    expect(sessionMsg.params.durationMs).toBeGreaterThanOrEqual(0);
  });
});
