# Implementation Plan: job-progress-updates

## Overview

Extend the worker to emit progress milestones and the gateway to subscribe to BullMQ QueueEvents, maintain a client registry, and forward progress/result/failure notifications to the correct WebSocket client.

## Tasks

- [x] 1. Extend worker to emit progress milestones and return a result
  - Update `apps/worker/index.ts` processor to call `job.updateProgress()` at 10, 25, 50, 75, 100 in order, with simulated async steps between each
  - Return `{ output: string, jobId: string }` from the processor
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 1.1 Write property test for worker progress milestone sequence (Property 1)
    - **Property 1: Worker emits milestones in order**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
    - Use `fc.record({ id: fc.string(), data: fc.anything() })` to generate random job data
    - Assert `updateProgress` is called exactly 5 times with `[10, 25, 50, 75, 100]` in order
    - File: `apps/worker/__tests__/worker.progress.test.ts`

  - [ ]* 1.2 Write property test for worker result shape (Property 2)
    - **Property 2: Worker result contains output and jobId**
    - **Validates: Requirements 1.6**
    - Assert return value has non-empty `output: string` and `jobId === job.id`
    - File: `apps/worker/__tests__/worker.progress.test.ts`

- [x] 2. Implement the Client Registry in the gateway
  - Add `const clientRegistry = new Map<string, any>()` at module level in `apps/gateway/index.ts`
  - After `queue.add()`, call `clientRegistry.set(job.id!, ws)`
  - In `websocket.close`, iterate registry and delete all entries where `socket === ws`
  - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 2.1 Write property test for registry store and retrieve (Property 3)
    - **Property 3: Registry stores and retrieves jobId-to-ws mappings**
    - **Validates: Requirements 2.1, 2.3**
    - Use `fc.array(fc.tuple(fc.string(), fc.object()))` to generate random (jobId, ws) pairs
    - Assert each lookup returns the correct ws without cross-entry interference
    - File: `apps/gateway/__tests__/registry.test.ts`

  - [ ]* 2.2 Write property test for registry cleanup on WebSocket close (Property 4)
    - **Property 4: Registry cleanup on WebSocket close**
    - **Validates: Requirements 2.2**
    - Use `fc.array(fc.string())` for jobIds; simulate close; assert all entries removed
    - File: `apps/gateway/__tests__/registry.test.ts`

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Add QueueEvents listener to the gateway
  - Import `QueueEvents` from `bullmq` in `apps/gateway/index.ts`
  - Instantiate `new QueueEvents("jobs", { connection })` at module level
  - Register `progress`, `completed`, `failed`, and `error` event handlers as specified in the design
  - In `completed` and `failed` handlers, send the appropriate notification then call `clientRegistry.delete(jobId)`
  - Wrap `ws.send()` calls in try/catch; on error log and delete the registry entry
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 6.1, 6.2, 6.3, 6.4_

  - [ ]* 4.1 Write property test for progress message shape (Property 5)
    - **Property 5: Progress message shape**
    - **Validates: Requirements 4.1, 4.2, 4.5**
    - Use `fc.record({ jobId: fc.string(), data: fc.integer({ min: 0, max: 100 }) })`
    - Assert sent message is valid JSON-RPC 2.0 notification with correct fields and no `id`
    - File: `apps/gateway/__tests__/queue-events.test.ts`

  - [ ]* 4.2 Write property test for result message shape (Property 6)
    - **Property 6: Result message shape**
    - **Validates: Requirements 4.3, 4.4, 4.5**
    - Use `fc.record({ jobId: fc.string(), returnvalue: fc.anything() })`
    - Assert sent message has `method === "job.result"`, correct `params`, and no `id`
    - File: `apps/gateway/__tests__/queue-events.test.ts`

  - [ ]* 4.3 Write property test for progress routing (Property 7)
    - **Property 7: Progress routing — known jobId delivers, unknown jobId discards**
    - **Validates: Requirements 3.2, 3.3, 3.4**
    - Assert `ws.send` called exactly once when jobId is in registry; not called when absent; no error thrown in either case
    - File: `apps/gateway/__tests__/queue-events.test.ts`

  - [ ]* 4.4 Write property test for completion event triggers send and cleanup (Property 8)
    - **Property 8: Completion event triggers result send and registry cleanup**
    - **Validates: Requirements 3.5, 3.6**
    - Assert `ws.send` called then `clientRegistry.get(jobId)` returns `undefined`
    - File: `apps/gateway/__tests__/queue-events.test.ts`

  - [ ]* 4.5 Write property test for result sent only on completed, not on progress(100) (Property 9)
    - **Property 9: Result message is sent only on completed event, not on progress(100)**
    - **Validates: Requirements 5.3**
    - Generate progress events with `data === 100`; assert progress handler never sends `"job.result"`
    - File: `apps/gateway/__tests__/queue-events.test.ts`

  - [ ]* 4.6 Write property test for failure message shape and cleanup (Property 10)
    - **Property 10: Failure message shape and registry cleanup**
    - **Validates: Requirements 6.1, 6.2**
    - Use `fc.record({ jobId: fc.string(), failedReason: fc.string() })`
    - Assert notification has `method === "job.failed"`, correct `params`, and registry entry removed
    - File: `apps/gateway/__tests__/queue-events.test.ts`

- [x] 5. Add unit tests for configuration and edge cases
  - Assert `QueueEvents` is constructed with queue name `"jobs"` and the shared Redis connection
  - Assert registry handles same ws with multiple jobIds correctly
  - Assert progress event for unknown jobId does not throw
  - Assert WebSocket close with empty registry does not throw
  - Assert `queueEvents.on("error", ...)` handler is registered
  - File: `apps/gateway/__tests__/gateway.unit.test.ts`
  - _Requirements: 3.1, 2.2, 3.4, 6.4_

- [x] 6. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
