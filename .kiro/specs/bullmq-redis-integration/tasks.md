# Implementation Plan: BullMQ Redis Integration

## Overview

Wire BullMQ and Redis into the existing Bun monorepo: add a Queue to the gateway, create a standalone Worker, and provide a Docker Compose Redis service.

## Tasks

- [x] 1. Create docker-compose.yml at workspace root
  - Define a `redis` service using `redis:alpine` with port mapping `6379:6379`
  - _Requirements: 4.1, 4.2_

- [x] 2. Add IORedis connection and BullMQ Queue to the gateway
  - [x] 2.1 Import `IORedis` and `Queue` from their packages in `apps/gateway/index.ts`
    - Create a shared `IORedis` connection using `REDIS_HOST` / `REDIS_PORT` env vars with `maxRetriesPerRequest: null`
    - Instantiate `new Queue("jobs", { connection })` at module level
    - _Requirements: 1.4_

  - [ ]* 2.2 Write unit test — gateway connects to Redis using env vars
    - Assert the `IORedis` constructor is called with `host` and `port` derived from `REDIS_HOST` / `REDIS_PORT`
    - _Requirements: 1.4_

- [x] 3. Modify the gateway `websocket.message` handler to enqueue jobs
  - [x] 3.1 Replace the existing echo response with `queue.add()` and `Job_Acknowledgement`
    - Keep the existing JSON parse error path unchanged
    - Call `queue.add(parsed.method, parsed)` on valid messages
    - Send `{ jsonrpc: "2.0", result: { status: "queued", jobId: job.id }, id: parsed.id ?? null }` back to the client
    - On `queue.add()` failure, log the error and send a JSON-RPC internal error response
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 3.2 Write property test for Property 1: Job data round-trip
    - **Property 1: Job data round-trip**
    - **Validates: Requirements 1.1, 3.1, 3.2**
    - Use `fc.record({ jsonrpc: fc.constant("2.0"), method: fc.string(), params: fc.anything(), id: fc.oneof(fc.integer(), fc.string()) })`
    - Enqueue via the handler, read back `job.data`, assert deep equality with the original message
    - File: `apps/gateway/__tests__/gateway.test.ts`

  - [ ]* 3.3 Write property test for Property 2: Acknowledgement shape
    - **Property 2: Acknowledgement shape**
    - **Validates: Requirements 1.2**
    - For any valid JSON-RPC message, assert the response matches `{ jsonrpc: "2.0", result: { status: "queued", jobId: <non-empty string> }, id: <original id> }`
    - File: `apps/gateway/__tests__/gateway.test.ts`

  - [ ]* 3.4 Write property test for Property 3: Parse error path rejects invalid JSON
    - **Property 3: Parse error path rejects invalid JSON**
    - **Validates: Requirements 1.3**
    - Use `fc.string()` filtered to exclude valid JSON strings
    - Assert response is `{ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }` and no job is enqueued
    - File: `apps/gateway/__tests__/gateway.test.ts`

- [x] 4. Checkpoint — verify gateway changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Create `apps/worker/index.ts` as a standalone BullMQ Worker
  - [x] 5.1 Implement the worker entry point
    - Import `Worker` from `bullmq` and `IORedis` from `ioredis`
    - Create an `IORedis` connection using `REDIS_HOST` / `REDIS_PORT` env vars with `maxRetriesPerRequest: null`
    - Instantiate `new Worker("jobs", processor, { connection })` where the processor logs `job.id` and `job.data`
    - Print `"Worker listening on queue: jobs"` to stdout on startup
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 5.2 Write property test for Property 4: Worker processor logs job ID and data
    - **Property 4: Worker processor logs job ID and data**
    - **Validates: Requirements 2.3**
    - Use `fc.record({ id: fc.string(), data: fc.anything() })`
    - Spy on `console.log`, call the processor directly, assert both `job.id` and `job.data` are logged
    - File: `apps/worker/__tests__/worker.test.ts`

  - [ ]* 5.3 Write unit tests for worker connection and queue name
    - Assert `IORedis` is constructed with `REDIS_HOST` / `REDIS_PORT` env vars (Requirement 2.1)
    - Assert `Worker` is constructed with queue name `"jobs"` (Requirement 2.2)
    - File: `apps/worker/__tests__/worker.unit.test.ts`

- [x] 6. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use **fast-check** and run a minimum of 100 iterations each
- Each property test file should include the tag comment: `// Feature: bullmq-redis-integration, Property <N>: <property text>`
- The `maxRetriesPerRequest: null` IORedis option is required by BullMQ on both gateway and worker
- To run the full stack manually: `docker-compose up -d`, then `bun run apps/gateway/index.ts` and `bun run apps/worker/index.ts` in separate terminals
