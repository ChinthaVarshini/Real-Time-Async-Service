# Requirements Document

## Introduction

This feature adds live job progress updates to the existing real-time async backend. When the BullMQ worker processes a job, it reports progress milestones (10%, 25%, 50%, 75%, 100%) back to the browser in real-time via WebSocket. Once the job completes, the final result is also pushed to the browser. The gateway acts as the bridge: it subscribes to BullMQ job events and forwards progress and result messages to the correct WebSocket client.

## Glossary

- **Gateway**: The Bun HTTP/WebSocket server running on port 4000 (`apps/gateway/index.ts`)
- **Worker**: The BullMQ worker process (`apps/worker/index.ts`) that dequeues and processes jobs
- **Client**: A browser connected to the Gateway via an authenticated WebSocket connection
- **Job**: A unit of work enqueued by the Gateway into the BullMQ `jobs` queue
- **Job_ID**: The unique identifier assigned by BullMQ when a job is enqueued
- **Progress_Event**: A BullMQ `progress` event carrying a numeric percentage value (10, 25, 50, 75, or 100)
- **Completion_Event**: A BullMQ `completed` event carrying the final job return value
- **Client_Registry**: An in-memory map maintained by the Gateway that associates a Job_ID to the WebSocket connection that requested it
- **Progress_Message**: A JSON-RPC 2.0 notification sent from the Gateway to the Client containing a progress percentage
- **Result_Message**: A JSON-RPC 2.0 notification sent from the Gateway to the Client containing the final job result
- **QueueEvents**: The BullMQ `QueueEvents` listener used by the Gateway to receive Worker-emitted events over Redis pub/sub

---

## Requirements

### Requirement 1: Worker Reports Progress Milestones

**User Story:** As a developer, I want the worker to emit progress milestones during job processing, so that downstream consumers can track how far along a job is.

#### Acceptance Criteria

1. WHEN the Worker begins processing a job, THE Worker SHALL call `job.updateProgress(10)` before performing any significant work.
2. WHEN the Worker reaches the 25% milestone, THE Worker SHALL call `job.updateProgress(25)`.
3. WHEN the Worker reaches the 50% milestone, THE Worker SHALL call `job.updateProgress(50)`.
4. WHEN the Worker reaches the 75% milestone, THE Worker SHALL call `job.updateProgress(75)`.
5. WHEN the Worker finishes all processing steps, THE Worker SHALL call `job.updateProgress(100)` before returning the result.
6. WHEN the Worker completes a job, THE Worker SHALL return a result object containing at minimum the processed output and the Job_ID.

---

### Requirement 2: Gateway Tracks Client-to-Job Associations

**User Story:** As a system, I want the Gateway to remember which Client requested which job, so that progress and result messages can be routed to the correct WebSocket connection.

#### Acceptance Criteria

1. WHEN the Gateway enqueues a job on behalf of a Client, THE Client_Registry SHALL store a mapping from the Job_ID to the Client's WebSocket connection.
2. WHEN a Client's WebSocket connection closes, THE Client_Registry SHALL remove all Job_ID entries associated with that connection.
3. THE Client_Registry SHALL support concurrent entries for multiple active jobs and multiple connected clients.

---

### Requirement 3: Gateway Listens for Worker Progress Events

**User Story:** As a developer, I want the Gateway to subscribe to BullMQ job events, so that it can forward progress updates to the browser without polling.

#### Acceptance Criteria

1. THE Gateway SHALL instantiate a `QueueEvents` listener connected to the same Redis instance and `jobs` queue used by the Worker.
2. WHEN a Progress_Event is received by the QueueEvents listener, THE Gateway SHALL look up the Job_ID in the Client_Registry.
3. WHEN a matching Client WebSocket connection is found in the Client_Registry, THE Gateway SHALL send a Progress_Message to that Client.
4. IF no matching Client WebSocket connection is found in the Client_Registry for a given Job_ID, THEN THE Gateway SHALL discard the Progress_Event silently.
5. WHEN a Completion_Event is received by the QueueEvents listener, THE Gateway SHALL look up the Job_ID in the Client_Registry and send a Result_Message to the matching Client.
6. WHEN a Result_Message has been sent, THE Client_Registry SHALL remove the Job_ID entry for that job.

---

### Requirement 4: Progress Message Format

**User Story:** As a browser client, I want progress updates in a consistent JSON format, so that the UI can parse and display them reliably.

#### Acceptance Criteria

1. THE Gateway SHALL format every Progress_Message as a JSON-RPC 2.0 notification with `method` set to `"job.progress"`.
2. THE Progress_Message `params` field SHALL contain `jobId` (string) and `progress` (integer, one of 10, 25, 50, 75, 100).
3. THE Gateway SHALL format every Result_Message as a JSON-RPC 2.0 notification with `method` set to `"job.result"`.
4. THE Result_Message `params` field SHALL contain `jobId` (string) and `result` (the value returned by the Worker).
5. THE Gateway SHALL NOT include an `id` field in Progress_Messages or Result_Messages, as they are notifications not responses.

---

### Requirement 5: Client Receives Ordered Progress Updates

**User Story:** As a browser user, I want to see progress updates arrive in order (10 → 25 → 50 → 75 → 100 → result), so that the UI progress bar advances correctly.

#### Acceptance Criteria

1. WHEN the Worker emits progress milestones in ascending order, THE Gateway SHALL forward each Progress_Message to the Client before forwarding the Result_Message.
2. WHEN the Client receives a Progress_Message with `progress` equal to 100, THE Client SHALL expect a subsequent Result_Message for the same Job_ID.
3. THE Gateway SHALL send the Result_Message only after the Completion_Event is received, not after the 100% Progress_Event.

---

### Requirement 6: Resilience and Error Handling

**User Story:** As a developer, I want the system to handle edge cases gracefully, so that a failed or disconnected job does not crash the Gateway or leave stale registry entries.

#### Acceptance Criteria

1. IF a job fails in the Worker, THEN THE Gateway SHALL receive a BullMQ `failed` event and send a JSON-RPC 2.0 error notification to the matching Client with `method` set to `"job.failed"` and `params` containing `jobId` and `error` (string message).
2. IF a job fails in the Worker, THEN THE Client_Registry SHALL remove the Job_ID entry for that job.
3. IF the Client WebSocket connection is closed before the job completes, THEN THE Gateway SHALL continue processing QueueEvents for that Job_ID and discard any messages that cannot be delivered.
4. WHEN the QueueEvents listener encounters a Redis connection error, THE Gateway SHALL log the error and attempt to reconnect using the existing IORedis retry configuration.
