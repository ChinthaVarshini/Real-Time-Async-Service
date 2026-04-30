# Requirements Document

## Introduction

This feature adds large file and bulk file processing capabilities to the Real-Time Async Service Backend. Files are received over the existing WebSocket connection (JSON-RPC 2.0), split into chunks when large, queued via BullMQ, processed by workers with configurable concurrency, and real-time progress is streamed back to the browser per-file and per-chunk.

## Glossary

- **Gateway**: The Bun.serve() WebSocket server running on port 4000 (`apps/gateway/index.ts`)
- **Worker**: The BullMQ Worker process consuming the `jobs` queue (`apps/worker/index.ts`)
- **Queue**: The BullMQ queue backed by IORedis used to dispatch file jobs
- **Chunk**: A contiguous byte range of a large file produced by splitting the file for parallel processing
- **Chunk_Job**: A BullMQ job that processes a single Chunk
- **File_Job**: A BullMQ job that processes a single file (either directly or by orchestrating Chunk_Jobs)
- **Bulk_Session**: A logical grouping of File_Jobs submitted together in one bulk upload request
- **Client_Registry**: The `Map<jobId, ws>` in `apps/gateway/registry.ts` that maps job IDs to WebSocket connections
- **Progress_Event**: A JSON-RPC 2.0 notification sent from the Gateway to the browser describing processing progress
- **Chunk_Size**: The maximum byte size of a single Chunk, configurable via environment variable
- **Concurrency**: The number of File_Jobs the Worker processes simultaneously, set to 5

---

## Requirements

### Requirement 1: Large File Ingestion via WebSocket

**User Story:** As a client application, I want to send large files over the existing WebSocket connection, so that I can leverage the existing authenticated transport without a separate HTTP upload endpoint.

#### Acceptance Criteria

1. WHEN a client sends a `file.upload` JSON-RPC 2.0 message containing a `filename`, `mimeType`, `size` (bytes), and `data` (Base64-encoded file content), THE Gateway SHALL accept the message and decode the file payload.
2. IF the `data` field is missing or cannot be Base64-decoded, THEN THE Gateway SHALL respond with a JSON-RPC 2.0 error `{ code: -32602, message: "Invalid file payload" }`.
3. IF the decoded file size exceeds the value of the `MAX_FILE_SIZE_BYTES` environment variable, THEN THE Gateway SHALL respond with a JSON-RPC 2.0 error `{ code: -32602, message: "File exceeds maximum allowed size" }`.
4. THE Gateway SHALL respond immediately with `{ status: "accepted", sessionId }` upon successful ingestion before any processing begins.

---

### Requirement 2: Large File Chunking

**User Story:** As a developer, I want large files to be automatically split into smaller chunks, so that each chunk can be processed independently and progress can be reported incrementally.

#### Acceptance Criteria

1. WHEN a file's decoded byte size exceeds `CHUNK_SIZE_BYTES`, THE Gateway SHALL split the file into sequential Chunks of at most `CHUNK_SIZE_BYTES` each.
2. THE Gateway SHALL assign each Chunk a zero-based `chunkIndex` and record the total `chunkCount` for the file.
3. WHEN a file's decoded byte size is less than or equal to `CHUNK_SIZE_BYTES`, THE Gateway SHALL treat the entire file as a single Chunk with `chunkIndex: 0` and `chunkCount: 1`.
4. THE Gateway SHALL enqueue one Chunk_Job per Chunk onto the `jobs` Queue, with job data containing `sessionId`, `fileId`, `filename`, `chunkIndex`, `chunkCount`, and the chunk's Base64-encoded bytes.

---

### Requirement 3: Bulk File Ingestion

**User Story:** As a client application, I want to submit 100 or more files in a single request, so that I can process large batches without sending individual messages per file.

#### Acceptance Criteria

1. WHEN a client sends a `file.uploadBulk` JSON-RPC 2.0 message containing an array of file descriptors (each with `filename`, `mimeType`, `size`, and `data`), THE Gateway SHALL accept up to 500 files per bulk request.
2. IF the files array contains more than 500 entries, THEN THE Gateway SHALL respond with a JSON-RPC 2.0 error `{ code: -32602, message: "Bulk limit exceeded" }`.
3. THE Gateway SHALL assign a unique `sessionId` to the Bulk_Session and a unique `fileId` to each file within the session.
4. THE Gateway SHALL enqueue File_Jobs (or Chunk_Jobs for large files) for all submitted files and respond with `{ status: "accepted", sessionId, fileCount, jobIds[] }` before processing begins.
5. THE Client_Registry SHALL store a mapping from each `jobId` to the originating WebSocket connection so that progress events are routed to the correct client.

---

### Requirement 4: Per-Chunk Progress Reporting

**User Story:** As a browser user, I want to see progress for each chunk of a large file, so that I know the file is actively being processed even before it completes.

#### Acceptance Criteria

1. WHEN a Worker begins processing a Chunk_Job, THE Worker SHALL call `updateProgress(10)` at the start of processing.
2. WHEN a Worker reaches 25%, 50%, and 75% completion milestones within a Chunk_Job, THE Worker SHALL call `updateProgress(25)`, `updateProgress(50)`, and `updateProgress(75)` respectively.
3. WHEN a Worker completes processing a Chunk_Job, THE Worker SHALL call `updateProgress(100)`.
4. WHEN the Gateway receives a `progress` QueueEvent for a Chunk_Job, THE Gateway SHALL send a JSON-RPC 2.0 notification to the registered WebSocket with method `chunk.progress` and params `{ sessionId, fileId, filename, chunkIndex, chunkCount, progress }`.
5. IF no WebSocket is registered for a Chunk_Job's jobId, THEN THE Gateway SHALL log the orphaned event and take no further action.

---

### Requirement 5: Chunk Aggregation and File Completion

**User Story:** As a browser user, I want to receive a single completion event per file after all its chunks are processed, so that I know when a complete file result is available.

#### Acceptance Criteria

1. WHEN all Chunk_Jobs for a given `fileId` have emitted a `completed` QueueEvent, THE Gateway SHALL aggregate the chunk results in `chunkIndex` order.
2. THE Gateway SHALL send a JSON-RPC 2.0 notification with method `file.completed` and params `{ sessionId, fileId, filename, result }` to the registered WebSocket.
3. WHILE any Chunk_Job for a `fileId` is still pending or processing, THE Gateway SHALL NOT send the `file.completed` notification for that file.
4. IF any Chunk_Job for a `fileId` fails after all retry attempts are exhausted, THEN THE Gateway SHALL send a JSON-RPC 2.0 notification with method `file.failed` and params `{ sessionId, fileId, filename, error, failedChunkIndex }`.

---

### Requirement 6: Per-File Progress and Status Notifications

**User Story:** As a browser user, I want real-time status updates for every individual file in a bulk session, so that I can see which files are processing, completed, or failed at any moment.

#### Acceptance Criteria

1. WHEN a File_Job or its first Chunk_Job begins processing, THE Gateway SHALL send a JSON-RPC 2.0 notification with method `file.processing` and params `{ sessionId, fileId, filename }`.
2. WHEN a file completes successfully, THE Gateway SHALL send a `file.completed` notification as defined in Requirement 5.
3. WHEN a file fails, THE Gateway SHALL send a `file.failed` notification as defined in Requirement 5.
4. THE Gateway SHALL include a `completedCount` field in every `file.completed` notification, reflecting the total number of files completed so far within the Bulk_Session.
5. THE Gateway SHALL include a `totalCount` field in every `file.completed` and `file.failed` notification, reflecting the total number of files in the Bulk_Session.

---

### Requirement 7: Bulk Session Completion

**User Story:** As a browser user, I want a single notification when all files in a bulk session are done, so that I know the entire batch has finished and can see the total time taken.

#### Acceptance Criteria

1. WHEN all File_Jobs in a Bulk_Session have reached a terminal state (completed or failed), THE Gateway SHALL send a JSON-RPC 2.0 notification with method `session.completed` and params `{ sessionId, totalCount, completedCount, failedCount, durationMs }`.
2. THE `durationMs` field SHALL be the elapsed time in milliseconds from when the Gateway accepted the bulk request to when the last job reached a terminal state.
3. IF a Bulk_Session contains zero files, THEN THE Gateway SHALL send `session.completed` immediately with `totalCount: 0`, `completedCount: 0`, `failedCount: 0`, and `durationMs: 0`.

---

### Requirement 8: Failed File Retry

**User Story:** As a browser user, I want to retry individual failed files without resubmitting the entire bulk session, so that transient errors don't require re-uploading all files.

#### Acceptance Criteria

1. WHEN a client sends a `file.retry` JSON-RPC 2.0 message with `{ sessionId, fileId }`, THE Gateway SHALL re-enqueue the File_Job (or Chunk_Jobs) for that file.
2. THE Gateway SHALL respond with `{ status: "requeued", jobId }` upon successful re-enqueue.
3. IF the `sessionId` or `fileId` is not found in the Gateway's session state, THEN THE Gateway SHALL respond with a JSON-RPC 2.0 error `{ code: -32602, message: "Unknown session or file" }`.
4. WHEN a retried file completes or fails, THE Gateway SHALL send the same `file.completed` or `file.failed` notifications as defined in Requirements 5 and 6.

---

### Requirement 9: Worker Concurrency

**User Story:** As a system operator, I want the Worker to process multiple files simultaneously, so that bulk sessions complete faster than sequential processing would allow.

#### Acceptance Criteria

1. THE Worker SHALL be configured with a concurrency of 5, processing up to 5 File_Jobs or Chunk_Jobs simultaneously.
2. WHERE the `WORKER_CONCURRENCY` environment variable is set, THE Worker SHALL use that value as the concurrency limit instead of the default of 5.
3. WHEN 5 jobs are actively processing, THE Worker SHALL not pick up additional jobs until one of the active jobs reaches a terminal state.
4. THE Gateway SHALL send concurrent `file.processing` notifications for all files that are simultaneously active, allowing the browser to display up to 5 files processing at the same time.

---

### Requirement 10: Browser Real-Time Dashboard Data

**User Story:** As a browser user, I want a structured stream of events that lets me render a live dashboard showing all file states, so that I have full visibility into the bulk processing session.

#### Acceptance Criteria

1. THE Gateway SHALL emit `file.processing`, `file.completed`, `file.failed`, `chunk.progress`, and `session.completed` notifications exclusively as JSON-RPC 2.0 notifications (no `id` field) over the authenticated WebSocket.
2. WHEN a client connects and sends a `session.status` request with `{ sessionId }`, THE Gateway SHALL respond with the current snapshot of all file states within that session.
3. IF a WebSocket disconnects mid-session and reconnects with the same JWT, THE Gateway SHALL allow the client to re-subscribe to an active session via `session.status`.
4. THE Gateway SHALL include a monotonically increasing `seq` field in every session-scoped notification so the browser can detect and handle out-of-order delivery.
