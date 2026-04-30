# Requirements Document

## Introduction

This feature integrates BullMQ and Redis into the existing Bun monorepo WebSocket gateway project. When the Gateway receives a valid JSON-RPC WebSocket message, it enqueues the job in a BullMQ "jobs" queue backed by Redis and acknowledges the client with the assigned job ID. A standalone Worker process consumes jobs from the same queue and logs each job's ID and data. A Docker Compose file provides a local Redis instance.

## Glossary

- **Gateway**: The Bun WebSocket server running in `apps/gateway/index.ts` on port 4000
- **Worker**: The standalone BullMQ worker process in `apps/worker/index.ts`
- **Queue**: The BullMQ queue named "jobs" backed by Redis
- **Redis**: The Redis server used as the BullMQ backend, configured via environment variables
- **JSON-RPC_Message**: A WebSocket message conforming to the JSON-RPC 2.0 specification with `jsonrpc`, `method`, `params`, and `id` fields
- **Job**: A unit of work added to the Queue, containing the parsed JSON-RPC_Message payload
- **Job_Acknowledgement**: A JSON-RPC 2.0 response sent back to the WebSocket client confirming the job was queued, including the assigned job ID

---

## Requirements

### Requirement 1: Gateway Enqueues Valid JSON-RPC Messages

**User Story:** As a client, I want my JSON-RPC messages to be queued for async processing, so that the gateway can handle heavy tasks without blocking.

#### Acceptance Criteria

1. WHEN a WebSocket message is received and parsed as a valid JSON-RPC_Message, THE Gateway SHALL add a Job to the Queue containing the message payload.
2. WHEN a Job is successfully added to the Queue, THE Gateway SHALL send a Job_Acknowledgement to the client in the form `{ "jsonrpc": "2.0", "result": { "status": "queued", "jobId": "<id>" }, "id": <message.id> }`.
3. WHEN a WebSocket message cannot be parsed as valid JSON, THE Gateway SHALL send a JSON-RPC 2.0 parse error response `{ "jsonrpc": "2.0", "error": { "code": -32700, "message": "Parse error" }, "id": null }` and SHALL NOT add a Job to the Queue.
4. THE Gateway SHALL connect to Redis using the `REDIS_HOST` and `REDIS_PORT` values from the environment configuration.

### Requirement 2: Worker Processes Jobs from the Queue

**User Story:** As a system operator, I want a worker process to consume queued jobs, so that job data is processed asynchronously.

#### Acceptance Criteria

1. THE Worker SHALL connect to the same Redis instance as the Gateway using `REDIS_HOST` and `REDIS_PORT` from the environment configuration.
2. WHEN the Worker is started, THE Worker SHALL listen on the Queue named "jobs".
3. WHEN a Job is picked up from the Queue, THE Worker SHALL log the job ID and the full job data to standard output.
4. THE Worker SHALL run as a standalone process independently of the Gateway.

### Requirement 3: Job Data Integrity

**User Story:** As a developer, I want job data to be preserved end-to-end, so that the worker receives exactly what the client sent.

#### Acceptance Criteria

1. FOR ALL valid JSON-RPC_Messages received by the Gateway, the Job data stored in the Queue SHALL contain the original message payload without modification.
2. WHEN the Worker processes a Job, the job data retrieved from the Queue SHALL be equivalent to the data that was enqueued by the Gateway (round-trip property).

### Requirement 4: Docker Compose Redis Service

**User Story:** As a developer, I want a local Redis instance available via Docker Compose, so that I can run the full stack without installing Redis manually.

#### Acceptance Criteria

1. THE docker-compose.yml file at the workspace root SHALL define a Redis service using the `redis:alpine` image.
2. THE Redis service SHALL expose port 6379 on the host machine mapped to port 6379 in the container.
3. WHEN `docker-compose up` is executed, THE Redis service SHALL start and accept connections on port 6379.
