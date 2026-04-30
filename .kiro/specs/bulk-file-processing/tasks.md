# Implementation Plan: Bulk File Processing

## Overview

Extend the existing Gateway and Worker to support large file and bulk file processing over the authenticated WebSocket connection. Files are Base64-encoded in JSON-RPC 2.0 messages, split into chunks, queued as BullMQ jobs, and real-time progress is streamed back per-chunk, per-file, and per-session.

## Tasks

- [x] 1. Create `SessionStore` in `apps/gateway/session-store.ts`
  - Implement `ChunkState`, `FileState`, and `SessionState` interfaces
  - Implement `SessionStore` class with `createSession`, `getSession`, `addFile`, `getFileByJobId`, `updateChunk`, and `deleteSession` methods
  - Use `crypto.randomUUID()` for `sessionId` and `fileId` generation
  - _Requirements: 3.3, 3.5, 5.1, 7.1_

  - [x]* 1.1 Write property test for session and file ID uniqueness
    - **Property 7: Session and file ID uniqueness**
    - **Validates: Requirements 3.3**

  - [x]* 1.2 Write property test for registry round-trip
    - **Property 8: Registry round-trip**
    - **Validates: Requirements 3.5**

  - [x]* 1.3 Write unit tests for `SessionStore`
    - Test `createSession`, `addFile`, `getFileByJobId`, `updateChunk`, `deleteSession`
    - Test edge cases: unknown sessionId, unknown jobId, zero-file session
    - _Requirements: 3.3, 3.5_

- [x] 2. Implement chunking utility in `apps/gateway/file-handlers.ts`
  - Implement `splitIntoChunks(fileBytes: Uint8Array, chunkSizeBytes: number): Uint8Array[]`
  - Read `CHUNK_SIZE_BYTES` from env (default `1048576`) and `MAX_FILE_SIZE_BYTES` (default `104857600`)
  - _Requirements: 2.1, 2.2, 2.3_

  - [x]* 2.1 Write property test for chunking invariants
    - **Property 5: Chunking invariants**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

- [x] 3. Implement `file.upload` and `file.uploadBulk` handlers in `apps/gateway/file-handlers.ts`
  - Implement `handleFileUpload(ws, parsed, queue, sessionStore)`: decode Base64, validate size, split into chunks, enqueue `file.processChunk` jobs, register each jobId in `clientRegistry`, respond with `{ status: "accepted", sessionId }`
  - Implement `handleFileUploadBulk(ws, parsed, queue, sessionStore)`: validate ≤ 500 files, process each file as above, respond with `{ status: "accepted", sessionId, fileCount, jobIds[] }`
  - Return JSON-RPC error `-32602` for invalid Base64, oversized file, or bulk limit exceeded
  - Return JSON-RPC error `-32603` on BullMQ enqueue failure
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x]* 3.1 Write property test for Base64 decode round-trip
    - **Property 1: Base64 decode round-trip**
    - **Validates: Requirements 1.1**

  - [x]* 3.2 Write property test for invalid Base64 yields error -32602
    - **Property 2: Invalid Base64 yields error -32602**
    - **Validates: Requirements 1.2**

  - [x]* 3.3 Write property test for oversized file yields error -32602
    - **Property 3: Oversized file yields error -32602**
    - **Validates: Requirements 1.3**

  - [x]* 3.4 Write property test for accepted response shape
    - **Property 4: Accepted response shape**
    - **Validates: Requirements 1.4, 3.4**

  - [x]* 3.5 Write property test for bulk limit enforcement
    - **Property 6: Bulk limit enforcement**
    - **Validates: Requirements 3.1, 3.2**

  - [x]* 3.6 Write unit tests for `file.upload` and `file.uploadBulk`
    - Test valid single file, valid bulk, invalid Base64, oversized file, bulk > 500, enqueue failure
    - _Requirements: 1.1–1.4, 3.1–3.5_

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement `file.retry` and `session.status` handlers in `apps/gateway/file-handlers.ts`
  - Implement `handleFileRetry(ws, parsed, queue, sessionStore)`: look up session and file, re-enqueue chunk jobs, respond with `{ status: "requeued", jobId }`; return `-32602` if unknown
  - Implement `handleSessionStatus(ws, parsed, sessionStore)`: return snapshot of all file states for the session
  - _Requirements: 8.1, 8.2, 8.3, 10.2, 10.3_

  - [x]* 5.1 Write property test for `file.retry` re-enqueues known files
    - **Property 16: file.retry re-enqueues known files**
    - **Validates: Requirements 8.1, 8.2**

  - [x]* 5.2 Write property test for `file.retry` unknown session/file yields error
    - **Property 17: file.retry unknown session/file yields error**
    - **Validates: Requirements 8.3**

  - [x]* 5.3 Write property test for `session.status` returns current snapshot
    - **Property 20: session.status returns current snapshot**
    - **Validates: Requirements 10.2, 10.3**

  - [x]* 5.4 Write unit tests for `file.retry` and `session.status`
    - Test known session/file retry, unknown session, unknown file, status snapshot accuracy
    - _Requirements: 8.1–8.3, 10.2–10.3_

- [x] 6. Implement `chunk-event-handlers.ts` in `apps/gateway/`
  - Implement `handleChunkProgress(sessionStore, jobId, progress)`: look up file via `getFileByJobId`, send `chunk.progress` notification with `seq`; log orphaned events
  - Implement `handleChunkCompleted(sessionStore, jobId, result)`: update chunk state; if first chunk for file send `file.processing`; if all chunks done send `file.completed` with `completedCount`, `totalCount`, `seq`; if all files terminal send `session.completed` with `durationMs`, `seq`
  - Implement `handleChunkFailed(sessionStore, jobId, error)`: send `file.failed` with `failedChunkIndex`, `totalCount`, `seq`; check session terminal state
  - All outbound notifications must have `jsonrpc: "2.0"`, `method`, `params`, and no `id` field
  - Increment `seq` on `SessionState` for every notification emitted
  - _Requirements: 4.4, 4.5, 5.1–5.4, 6.1–6.5, 7.1–7.3, 10.1, 10.4_

  - [x]* 6.1 Write property test for `chunk.progress` notification shape
    - **Property 10: chunk.progress notification shape**
    - **Validates: Requirements 4.4**

  - [x]* 6.2 Write property test for `file.completed` notification shape and aggregation order
    - **Property 11: file.completed notification shape and aggregation order**
    - **Validates: Requirements 5.1, 5.2, 6.4, 6.5**

  - [x]* 6.3 Write property test for no premature `file.completed`
    - **Property 12: No premature file.completed**
    - **Validates: Requirements 5.3**

  - [x]* 6.4 Write property test for `file.failed` notification shape
    - **Property 13: file.failed notification shape**
    - **Validates: Requirements 5.4, 6.5**

  - [x]* 6.5 Write property test for `file.processing` on first chunk start
    - **Property 14: file.processing notification on first chunk start**
    - **Validates: Requirements 6.1**

  - [x]* 6.6 Write property test for `session.completed` on all-terminal
    - **Property 15: session.completed on all-terminal**
    - **Validates: Requirements 7.1, 7.2, 7.3**

  - [x]* 6.7 Write property test for outbound notifications have no `id` field
    - **Property 19: Outbound notifications have no id field**
    - **Validates: Requirements 10.1**

  - [x]* 6.8 Write property test for `seq` is monotonically increasing per session
    - **Property 21: seq is monotonically increasing per session**
    - **Validates: Requirements 10.4**

  - [x]* 6.9 Write unit tests for `chunk-event-handlers`
    - Test progress routing, file.processing on first chunk, file.completed aggregation, file.failed, session.completed, orphaned jobId logging
    - _Requirements: 4.4–4.5, 5.1–5.4, 6.1–6.5, 7.1–7.3_

- [x] 7. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Update Worker to handle `file.processChunk` jobs in `apps/worker/index.ts`
  - Add a branch in `processJob` for `job.data.method === "file.processChunk"` that calls `updateProgress` at 10, 25, 50, 75, 100 and returns the chunk result
  - Read `WORKER_CONCURRENCY` from env (default `5`) and pass to `new Worker(...)` as `{ concurrency }`
  - _Requirements: 4.1, 4.2, 4.3, 9.1, 9.2, 9.3_

  - [x]* 8.1 Write property test for worker progress sequence
    - **Property 9: Worker progress sequence**
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [x]* 8.2 Write property test for worker concurrency from environment
    - **Property 18: Worker concurrency from environment**
    - **Validates: Requirements 9.1, 9.2**

  - [x]* 8.3 Write unit tests for `file.processChunk` job handler
    - Test progress sequence, return value shape, retry attempt logging
    - _Requirements: 4.1–4.3, 9.1–9.2_

- [x] 9. Wire file and session handlers into `apps/gateway/index.ts`
  - Import `handleFileUpload`, `handleFileUploadBulk`, `handleFileRetry`, `handleSessionStatus` from `file-handlers`
  - Import `handleChunkProgress`, `handleChunkCompleted`, `handleChunkFailed` from `chunk-event-handlers`
  - Instantiate `SessionStore` and pass it to all handlers
  - In the `message` handler, route `file.upload`, `file.uploadBulk`, `file.retry`, `session.status` to their respective handlers instead of the generic `queue.add` path
  - Replace `queueEvents` `progress`, `completed`, `failed` listeners with chunk-aware handlers for `file.processChunk` jobs; keep existing handlers for non-file jobs
  - _Requirements: 1.1, 3.1, 8.1, 9.4, 10.1_

- [x] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use `fast-check` with `bun:test` as the runner (minimum 100 iterations each)
- Each property test must include the tag comment: `// Feature: bulk-file-processing, Property N: <property_text>`
- Test files: `apps/gateway/__tests__/file-handlers.test.ts`, `apps/gateway/__tests__/chunk-event-handlers.test.ts`, `apps/gateway/__tests__/session-store.test.ts`, `apps/worker/__tests__/chunk-processor.test.ts`
- `SessionStore` is in-process only; no Redis persistence needed for session state
- The existing `clientRegistry` and generic job handlers remain unchanged for non-file jobs
