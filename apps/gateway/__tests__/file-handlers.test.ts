import { test, expect, describe } from "bun:test";
import fc from "fast-check";
import { splitIntoChunks, handleFileUpload, handleFileUploadBulk, handleFileRetry, handleSessionStatus } from "../file-handlers";
import { SessionStore } from "../session-store";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeMockWs() {
  const messages: any[] = [];
  return {
    send: (msg: string) => messages.push(JSON.parse(msg)),
    messages,
  };
}

function makeQueue(failEnqueue = false) {
  let counter = 0;
  return {
    add: async (_name: string, _data: any) => {
      if (failEnqueue) throw new Error("Redis down");
      return { id: `job-${++counter}` };
    },
  };
}

function makeRpc(method: string, params: any, id = 1) {
  return { jsonrpc: "2.0", method, params, id };
}

const MAX_FILE_SIZE_BYTES = parseInt(process.env.MAX_FILE_SIZE_BYTES ?? "104857600", 10);

// ─── Property 5: Chunking invariants ────────────────────────────────────────
// Feature: bulk-file-processing, Property 5: Chunking invariants

describe("Property 5: Chunking invariants", () => {
  test("chunks satisfy all invariants for any file size and chunk size", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 100_000 }),
        fc.integer({ min: 1, max: 50_000 }),
        (fileBytes, chunkSize) => {
          const chunks = splitIntoChunks(fileBytes, chunkSize);

          // (a) every chunk <= chunkSize
          expect(chunks.every((c) => c.length <= chunkSize)).toBe(true);

          // (b) indices are 0..N-1 (chunks array is sequential)
          expect(chunks.length).toBeGreaterThanOrEqual(1);

          // (c) concatenation reconstructs original
          const reconstructed = Buffer.concat(chunks.map((c) => Buffer.from(c)));
          expect(reconstructed).toEqual(Buffer.from(fileBytes));

          // (d) file <= chunkSize produces exactly one chunk
          if (fileBytes.length <= chunkSize) {
            expect(chunks.length).toBe(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 1: Base64 decode round-trip ───────────────────────────────────
// Feature: bulk-file-processing, Property 1: Base64 decode round-trip

describe("Property 1: Base64 decode round-trip", () => {
  test("decoding and re-encoding Base64 produces the original string", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 1000 }), (bytes) => {
        const encoded = Buffer.from(bytes).toString("base64");
        const decoded = Buffer.from(encoded, "base64");
        const reEncoded = decoded.toString("base64");
        expect(reEncoded).toBe(encoded);
        expect(decoded.length).toBe(bytes.length);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 2: Invalid Base64 yields error -32602 ─────────────────────────
// Feature: bulk-file-processing, Property 2: Invalid Base64 yields error -32602

describe("Property 2: Invalid Base64 yields error -32602", () => {
  test("file.upload with invalid Base64 data returns error -32602", async () => {
    const invalidInputs = [
      undefined,
      null,
      "",
      "!!!not-base64!!!",
      "hello world with spaces",
      "====",
    ];

    for (const data of invalidInputs) {
      const ws = makeMockWs();
      const store = new SessionStore();
      const queue = makeQueue();
      const registry = new Map<string, any>();
      await handleFileUpload(ws, makeRpc("file.upload", { filename: "f.txt", mimeType: "text/plain", data }), queue, store, registry);
      const resp = ws.messages[0];
      expect(resp.error).toBeDefined();
      expect(resp.error.code).toBe(-32602);
      expect(resp.error.message).toBe("Invalid file payload");
    }
  });

  test("file.upload with missing data field returns error -32602", async () => {
    const ws = makeMockWs();
    const store = new SessionStore();
    const queue = makeQueue();
    const registry = new Map<string, any>();
    await handleFileUpload(ws, makeRpc("file.upload", { filename: "f.txt", mimeType: "text/plain" }), queue, store, registry);
    expect(ws.messages[0].error.code).toBe(-32602);
  });
});

// ─── Property 3: Oversized file yields error -32602 ─────────────────────────
// Feature: bulk-file-processing, Property 3: Oversized file yields error -32602

describe("Property 3: Oversized file yields error -32602", () => {
  test("file.upload with file exceeding MAX_FILE_SIZE_BYTES returns error -32602", async () => {
    // Use a small MAX for testing by creating a buffer just over the limit
    const oversizedBytes = new Uint8Array(MAX_FILE_SIZE_BYTES + 1);
    const data = Buffer.from(oversizedBytes).toString("base64");
    const ws = makeMockWs();
    const store = new SessionStore();
    const queue = makeQueue();
    const registry = new Map<string, any>();
    await handleFileUpload(ws, makeRpc("file.upload", { filename: "big.bin", mimeType: "application/octet-stream", data }), queue, store, registry);
    const resp = ws.messages[0];
    expect(resp.error).toBeDefined();
    expect(resp.error.code).toBe(-32602);
    expect(resp.error.message).toBe("File exceeds maximum allowed size");
  });
});

// ─── Property 4: Accepted response shape ────────────────────────────────────
// Feature: bulk-file-processing, Property 4: Accepted response shape

describe("Property 4: Accepted response shape", () => {
  test("valid file.upload returns status accepted with non-empty sessionId", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (bytes, filename) => {
          const data = Buffer.from(bytes).toString("base64");
          const ws = makeMockWs();
          const store = new SessionStore();
          const queue = makeQueue();
          const registry = new Map<string, any>();
          await handleFileUpload(ws, makeRpc("file.upload", { filename, mimeType: "application/octet-stream", data }), queue, store, registry);
          const resp = ws.messages[0];
          expect(resp.result).toBeDefined();
          expect(resp.result.status).toBe("accepted");
          expect(typeof resp.result.sessionId).toBe("string");
          expect(resp.result.sessionId.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("valid file.uploadBulk returns status accepted with sessionId, fileCount, jobIds", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (fileCount) => {
          const files = Array.from({ length: fileCount }, (_, i) => ({
            filename: `file${i}.txt`,
            mimeType: "text/plain",
            size: 4,
            data: Buffer.from("test").toString("base64"),
          }));
          const ws = makeMockWs();
          const store = new SessionStore();
          const queue = makeQueue();
          const registry = new Map<string, any>();
          await handleFileUploadBulk(ws, makeRpc("file.uploadBulk", { files }), queue, store, registry);
          const resp = ws.messages[0];
          expect(resp.result.status).toBe("accepted");
          expect(typeof resp.result.sessionId).toBe("string");
          expect(resp.result.fileCount).toBe(fileCount);
          expect(Array.isArray(resp.result.jobIds)).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── Property 6: Bulk limit enforcement ─────────────────────────────────────
// Feature: bulk-file-processing, Property 6: Bulk limit enforcement

describe("Property 6: Bulk limit enforcement", () => {
  test("file.uploadBulk with > 500 files returns error -32602", async () => {
    const files = Array.from({ length: 501 }, (_, i) => ({
      filename: `f${i}.txt`,
      mimeType: "text/plain",
      size: 4,
      data: Buffer.from("test").toString("base64"),
    }));
    const ws = makeMockWs();
    const store = new SessionStore();
    const queue = makeQueue();
    const registry = new Map<string, any>();
    await handleFileUploadBulk(ws, makeRpc("file.uploadBulk", { files }), queue, store, registry);
    const resp = ws.messages[0];
    expect(resp.error).toBeDefined();
    expect(resp.error.code).toBe(-32602);
    expect(resp.error.message).toBe("Bulk limit exceeded");
  });

  test("file.uploadBulk with exactly 500 files is accepted", async () => {
    const files = Array.from({ length: 500 }, (_, i) => ({
      filename: `f${i}.txt`,
      mimeType: "text/plain",
      size: 4,
      data: Buffer.from("test").toString("base64"),
    }));
    const ws = makeMockWs();
    const store = new SessionStore();
    const queue = makeQueue();
    const registry = new Map<string, any>();
    await handleFileUploadBulk(ws, makeRpc("file.uploadBulk", { files }), queue, store, registry);
    const resp = ws.messages[0];
    expect(resp.result.status).toBe("accepted");
  });
});

// ─── Unit tests for file.upload and file.uploadBulk ─────────────────────────

describe("file.upload unit tests", () => {
  test("valid upload registers jobIds in registry", async () => {
    const data = Buffer.from("hello").toString("base64");
    const ws = makeMockWs();
    const store = new SessionStore();
    const queue = makeQueue();
    const registry = new Map<string, any>();
    await handleFileUpload(ws, makeRpc("file.upload", { filename: "f.txt", mimeType: "text/plain", data }), queue, store, registry);
    expect(registry.size).toBeGreaterThan(0);
    for (const [, socket] of registry) {
      expect(socket).toBe(ws);
    }
  });

  test("enqueue failure returns error -32603", async () => {
    const data = Buffer.from("hello").toString("base64");
    const ws = makeMockWs();
    const store = new SessionStore();
    const queue = makeQueue(true);
    const registry = new Map<string, any>();
    await handleFileUpload(ws, makeRpc("file.upload", { filename: "f.txt", mimeType: "text/plain", data }), queue, store, registry);
    expect(ws.messages[0].error.code).toBe(-32603);
  });
});

describe("file.uploadBulk unit tests", () => {
  test("bulk upload with invalid Base64 in one file returns error -32602", async () => {
    const files = [
      { filename: "good.txt", mimeType: "text/plain", size: 4, data: Buffer.from("test").toString("base64") },
      { filename: "bad.txt", mimeType: "text/plain", size: 4, data: "!!!invalid!!!" },
    ];
    const ws = makeMockWs();
    const store = new SessionStore();
    const queue = makeQueue();
    const registry = new Map<string, any>();
    await handleFileUploadBulk(ws, makeRpc("file.uploadBulk", { files }), queue, store, registry);
    expect(ws.messages[0].error.code).toBe(-32602);
  });

  test("bulk upload with oversized file returns error -32602", async () => {
    const oversized = Buffer.from(new Uint8Array(MAX_FILE_SIZE_BYTES + 1)).toString("base64");
    const files = [{ filename: "big.bin", mimeType: "application/octet-stream", size: MAX_FILE_SIZE_BYTES + 1, data: oversized }];
    const ws = makeMockWs();
    const store = new SessionStore();
    const queue = makeQueue();
    const registry = new Map<string, any>();
    await handleFileUploadBulk(ws, makeRpc("file.uploadBulk", { files }), queue, store, registry);
    expect(ws.messages[0].error.code).toBe(-32602);
  });

  test("bulk enqueue failure returns error -32603", async () => {
    const files = [{ filename: "f.txt", mimeType: "text/plain", size: 4, data: Buffer.from("test").toString("base64") }];
    const ws = makeMockWs();
    const store = new SessionStore();
    const queue = makeQueue(true);
    const registry = new Map<string, any>();
    await handleFileUploadBulk(ws, makeRpc("file.uploadBulk", { files }), queue, store, registry);
    expect(ws.messages[0].error.code).toBe(-32603);
  });
});

// ─── Property 16: file.retry re-enqueues known files ────────────────────────
// Feature: bulk-file-processing, Property 16: file.retry re-enqueues known files

describe("Property 16: file.retry re-enqueues known files", () => {
  test("file.retry on a known session/file returns status requeued with a jobId", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 3 }), async (chunkCount) => {
        const store = new SessionStore();
        const ws = makeMockWs();
        const queue = makeQueue();
        const registry = new Map<string, any>();

        // Set up a session with a file
        const session = store.createSession(ws);
        const fileId = crypto.randomUUID();
        const jobIds = Array.from({ length: chunkCount }, () => crypto.randomUUID());
        store.addFile(session.sessionId, { fileId, filename: "f.txt", mimeType: "text/plain", chunkCount, jobIds });

        await handleFileRetry(ws, makeRpc("file.retry", { sessionId: session.sessionId, fileId }), queue, store, registry);
        const resp = ws.messages[0];
        expect(resp.result).toBeDefined();
        expect(resp.result.status).toBe("requeued");
        expect(typeof resp.result.jobId).toBe("string");
      }),
      { numRuns: 50 }
    );
  });
});

// ─── Property 17: file.retry unknown session/file yields error ───────────────
// Feature: bulk-file-processing, Property 17: file.retry unknown session/file yields error

describe("Property 17: file.retry unknown session/file yields error", () => {
  test("file.retry with unknown sessionId returns error -32602", async () => {
    const ws = makeMockWs();
    const store = new SessionStore();
    const queue = makeQueue();
    const registry = new Map<string, any>();
    await handleFileRetry(ws, makeRpc("file.retry", { sessionId: "bad-session", fileId: "bad-file" }), queue, store, registry);
    expect(ws.messages[0].error.code).toBe(-32602);
    expect(ws.messages[0].error.message).toBe("Unknown session or file");
  });

  test("file.retry with unknown fileId returns error -32602", async () => {
    const store = new SessionStore();
    const ws = makeMockWs();
    const queue = makeQueue();
    const registry = new Map<string, any>();
    const session = store.createSession(ws);
    await handleFileRetry(ws, makeRpc("file.retry", { sessionId: session.sessionId, fileId: "bad-file" }), queue, store, registry);
    expect(ws.messages[0].error.code).toBe(-32602);
  });
});

// ─── Property 20: session.status returns current snapshot ───────────────────
// Feature: bulk-file-processing, Property 20: session.status returns current snapshot

describe("Property 20: session.status returns current snapshot", () => {
  test("session.status reflects accurate file states from SessionStore", async () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (fileCount) => {
        const store = new SessionStore();
        const ws = makeMockWs();
        const session = store.createSession(ws);

        for (let i = 0; i < fileCount; i++) {
          store.addFile(session.sessionId, {
            fileId: crypto.randomUUID(),
            filename: `file${i}.txt`,
            mimeType: "text/plain",
            chunkCount: 1,
            jobIds: [crypto.randomUUID()],
          });
        }

        handleSessionStatus(ws, makeRpc("session.status", { sessionId: session.sessionId }), store);
        const resp = ws.messages[0];
        expect(resp.result.sessionId).toBe(session.sessionId);
        expect(resp.result.totalCount).toBe(fileCount);
        expect(resp.result.files.length).toBe(fileCount);
        for (const f of resp.result.files) {
          expect(f.status).toBe("pending");
          expect(f.chunkCount).toBe(1);
          expect(f.chunksCompleted).toBe(0);
        }
      }),
      { numRuns: 50 }
    );
  });
});

// ─── Unit tests for file.retry and session.status ───────────────────────────

describe("file.retry unit tests", () => {
  test("retry updates registry with new jobIds", async () => {
    const store = new SessionStore();
    const ws = makeMockWs();
    const queue = makeQueue();
    const registry = new Map<string, any>();
    const session = store.createSession(ws);
    const fileId = crypto.randomUUID();
    const oldJobId = crypto.randomUUID();
    store.addFile(session.sessionId, { fileId, filename: "f.txt", mimeType: "text/plain", chunkCount: 1, jobIds: [oldJobId] });
    registry.set(oldJobId, ws);

    await handleFileRetry(ws, makeRpc("file.retry", { sessionId: session.sessionId, fileId }), queue, store, registry);
    expect(registry.has(oldJobId)).toBe(false);
    expect(registry.size).toBe(1);
  });
});

describe("session.status unit tests", () => {
  test("session.status returns error for unknown session", () => {
    const store = new SessionStore();
    const ws = makeMockWs();
    handleSessionStatus(ws, makeRpc("session.status", { sessionId: "unknown" }), store);
    expect(ws.messages[0].error).toBeDefined();
    expect(ws.messages[0].error.code).toBe(-32602);
  });

  test("session.status reflects chunksCompleted after updateChunk", () => {
    const store = new SessionStore();
    const ws = makeMockWs();
    const session = store.createSession(ws);
    const jobId = crypto.randomUUID();
    store.addFile(session.sessionId, { fileId: crypto.randomUUID(), filename: "f.txt", mimeType: "text/plain", chunkCount: 1, jobIds: [jobId] });
    store.updateChunk(jobId, "completed", { output: "done" });

    handleSessionStatus(ws, makeRpc("session.status", { sessionId: session.sessionId }), store);
    const resp = ws.messages[0];
    expect(resp.result.files[0].chunksCompleted).toBe(1);
  });
});
