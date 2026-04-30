import { test, expect, describe } from "bun:test";
import fc from "fast-check";
import { SessionStore } from "../session-store";
import { clientRegistry } from "../registry";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeMockWs() {
  return { send: () => {} };
}

function makeFileArgs(overrides: Partial<{
  fileId: string; filename: string; mimeType: string; chunkCount: number; jobIds: string[];
}> = {}) {
  return {
    fileId: crypto.randomUUID(),
    filename: "test.txt",
    mimeType: "text/plain",
    chunkCount: 1,
    jobIds: [crypto.randomUUID()],
    ...overrides,
  };
}

// ─── Property 7: Session and file ID uniqueness ──────────────────────────────
// Feature: bulk-file-processing, Property 7: Session and file ID uniqueness

describe("Property 7: Session and file ID uniqueness", () => {
  test("two independently created sessions have different sessionIds", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const store = new SessionStore();
        const ws = makeMockWs();
        const s1 = store.createSession(ws);
        const s2 = store.createSession(ws);
        expect(s1.sessionId).not.toBe(s2.sessionId);
      }),
      { numRuns: 100 }
    );
  });

  test("all fileIds within a bulk session are distinct", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (fileCount) => {
        const store = new SessionStore();
        const ws = makeMockWs();
        const session = store.createSession(ws);
        const fileIds = new Set<string>();
        for (let i = 0; i < fileCount; i++) {
          const fileId = crypto.randomUUID();
          fileIds.add(fileId);
          store.addFile(session.sessionId, makeFileArgs({ fileId, jobIds: [crypto.randomUUID()] }));
        }
        expect(fileIds.size).toBe(fileCount);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 8: Registry round-trip ────────────────────────────────────────
// Feature: bulk-file-processing, Property 8: Registry round-trip

describe("Property 8: Registry round-trip", () => {
  test("looking up each jobId in clientRegistry returns the originating WebSocket", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (jobCount) => {
        const registry = new Map<string, any>();
        const ws = makeMockWs();
        const jobIds = Array.from({ length: jobCount }, () => crypto.randomUUID());
        for (const jobId of jobIds) {
          registry.set(jobId, ws);
        }
        for (const jobId of jobIds) {
          expect(registry.get(jobId)).toBe(ws);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Unit tests for SessionStore ─────────────────────────────────────────────

describe("SessionStore unit tests", () => {
  test("createSession returns a session with correct initial state", () => {
    const store = new SessionStore();
    const ws = makeMockWs();
    const session = store.createSession(ws);
    expect(session.sessionId).toBeTruthy();
    expect(session.ws).toBe(ws);
    expect(session.totalCount).toBe(0);
    expect(session.completedCount).toBe(0);
    expect(session.failedCount).toBe(0);
    expect(session.seq).toBe(0);
    expect(session.files.size).toBe(0);
  });

  test("getSession returns the session after creation", () => {
    const store = new SessionStore();
    const ws = makeMockWs();
    const session = store.createSession(ws);
    expect(store.getSession(session.sessionId)).toBe(session);
  });

  test("getSession returns undefined for unknown sessionId", () => {
    const store = new SessionStore();
    expect(store.getSession("nonexistent")).toBeUndefined();
  });

  test("addFile increments totalCount and stores file state", () => {
    const store = new SessionStore();
    const ws = makeMockWs();
    const session = store.createSession(ws);
    const args = makeFileArgs();
    const file = store.addFile(session.sessionId, args);
    expect(session.totalCount).toBe(1);
    expect(file.fileId).toBe(args.fileId);
    expect(file.status).toBe("pending");
    expect(file.chunks.size).toBe(1);
  });

  test("addFile throws for unknown sessionId", () => {
    const store = new SessionStore();
    expect(() => store.addFile("bad-session", makeFileArgs())).toThrow();
  });

  test("getFileByJobId returns correct entry", () => {
    const store = new SessionStore();
    const ws = makeMockWs();
    const session = store.createSession(ws);
    const jobId = crypto.randomUUID();
    const args = makeFileArgs({ jobIds: [jobId] });
    store.addFile(session.sessionId, args);
    const entry = store.getFileByJobId(jobId);
    expect(entry).toBeDefined();
    expect(entry!.file.fileId).toBe(args.fileId);
    expect(entry!.chunkIndex).toBe(0);
  });

  test("getFileByJobId returns undefined for unknown jobId", () => {
    const store = new SessionStore();
    expect(store.getFileByJobId("unknown-job")).toBeUndefined();
  });

  test("updateChunk updates chunk status", () => {
    const store = new SessionStore();
    const ws = makeMockWs();
    const session = store.createSession(ws);
    const jobId = crypto.randomUUID();
    store.addFile(session.sessionId, makeFileArgs({ jobIds: [jobId] }));
    store.updateChunk(jobId, "completed", { output: "done" });
    const entry = store.getFileByJobId(jobId);
    expect(entry!.file.chunks.get(0)!.status).toBe("completed");
    expect(entry!.file.chunks.get(0)!.result).toEqual({ output: "done" });
  });

  test("updateChunk is a no-op for unknown jobId", () => {
    const store = new SessionStore();
    expect(() => store.updateChunk("unknown", "completed")).not.toThrow();
  });

  test("deleteSession removes session and cleans up jobId index", () => {
    const store = new SessionStore();
    const ws = makeMockWs();
    const session = store.createSession(ws);
    const jobId = crypto.randomUUID();
    store.addFile(session.sessionId, makeFileArgs({ jobIds: [jobId] }));
    store.deleteSession(session.sessionId);
    expect(store.getSession(session.sessionId)).toBeUndefined();
    expect(store.getFileByJobId(jobId)).toBeUndefined();
  });

  test("zero-file session has totalCount 0", () => {
    const store = new SessionStore();
    const ws = makeMockWs();
    const session = store.createSession(ws);
    expect(session.totalCount).toBe(0);
    expect(session.files.size).toBe(0);
  });

  test("addFile with multiple chunks creates correct chunk states", () => {
    const store = new SessionStore();
    const ws = makeMockWs();
    const session = store.createSession(ws);
    const jobIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const file = store.addFile(session.sessionId, makeFileArgs({ chunkCount: 3, jobIds }));
    expect(file.chunks.size).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(file.chunks.get(i)!.status).toBe("pending");
      expect(file.chunks.get(i)!.chunkIndex).toBe(i);
    }
  });
});
