# Design Document: BullMQ Redis Integration

## Overview

This feature wires BullMQ and Redis into the existing Bun monorepo WebSocket gateway. The gateway (`apps/gateway/index.ts`) already handles WebSocket connections via `Bun.serve()` on port 4000. The integration adds:

1. A BullMQ `Queue` in the gateway — valid JSON-RPC messages are enqueued and the client receives a job acknowledgement.
2. A BullMQ `Worker` in `apps/worker/index.ts` — consumes jobs from the same queue and logs each job's ID and data.
3. A `docker-compose.yml` at the workspace root — provides a local Redis instance via `redis:alpine`.

Both the gateway and worker read `REDIS_HOST` and `REDIS_PORT` from the environment (`.env`).

---

## Architecture

```mermaid
flowchart LR
    Client -->|WebSocket JSON-RPC| Gateway
    Gateway -->|Queue.add()| BullMQ_Queue
    BullMQ_Queue -->|backed by| Redis
    Worker -->|Worker.process()| BullMQ_Queue
    Gateway -->|Job_Acknowledgement| Client

    subgraph apps/gateway
        Gateway
    end

    subgraph apps/worker
        Worker
    end

    subgraph Docker
        Redis
    end
```

Message flow:
1. Client sends a JSON-RPC 2.0 WebSocket message.
2. Gateway parses the message. On parse failure → sends error response, stops.
3. Gateway calls `queue.add()` with the message payload.
4. Gateway sends `Job_Acknowledgement` containing the BullMQ-assigned job ID back to the client.
5. Worker independently picks up the job and logs its ID and data.

---

## Components and Interfaces

### Gateway (`apps/gateway/index.ts`)

Additions to the existing `Bun.serve()` setup:

- **Redis connection**: `IORedis` instance constructed from `REDIS_HOST` / `REDIS_PORT` env vars, created once at module level.
- **BullMQ Queue**: `new Queue("jobs", { connection })` created once at module level.
- **`websocket.message` handler** (modified):
  - Parse incoming message as JSON.
  - On parse error → send JSON-RPC parse error response, return.
  - Validate as JSON-RPC 2.0 shape (has `jsonrpc`, `method`, `id`).
  - Call `queue.add(parsed.method, parsed)` to enqueue.
  - Send `Job_Acknowledgement` with the returned job ID.

```typescript
// Connection (shared)
const connection = new IORedis({
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
});

// Queue
const queue = new Queue("jobs", { connection });

// In websocket.message handler:
let parsed: any;
try {
  parsed = JSON.parse(raw);
} catch {
  ws.send(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
  return;
}

const job = await queue.add(parsed.method, parsed);
ws.send(JSON.stringify({ jsonrpc: "2.0", result: { status: "queued", jobId: job.id }, id: parsed.id ?? null }));
```

### Worker (`apps/worker/index.ts`)

New standalone process:

- **Redis connection**: Same `IORedis` construction pattern as gateway.
- **BullMQ Worker**: `new Worker("jobs", processor, { connection })`.
- **Processor**: Logs `job.id` and `job.data` to stdout.

```typescript
import { Worker } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis({
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
});

new Worker("jobs", async (job) => {
  console.log(`Job ID: ${job.id}`);
  console.log("Job data:", job.data);
}, { connection });

console.log("Worker listening on queue: jobs");
```

### Docker Compose (`docker-compose.yml`)

```yaml
services:
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
```

---

## Data Models

### JSON-RPC Message (inbound WebSocket)

```typescript
interface JsonRpcMessage {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
  id: string | number | null;
}
```

### BullMQ Job Data

The job data stored in the queue is the full parsed `JsonRpcMessage` object — no transformation, no stripping of fields.

```typescript
// queue.add(message.method, message)
// job.data === message  (deep equality)
```

### Job Acknowledgement (outbound WebSocket)

```typescript
interface JobAcknowledgement {
  jsonrpc: "2.0";
  result: {
    status: "queued";
    jobId: string;
  };
  id: string | number | null;
}
```

### Parse Error Response (outbound WebSocket)

```typescript
interface ParseErrorResponse {
  jsonrpc: "2.0";
  error: {
    code: -32700;
    message: "Parse error";
  };
  id: null;
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Job data round-trip

*For any* valid JSON-RPC 2.0 message received by the gateway, the job data stored in the BullMQ queue shall be deeply equal to the original message payload — no fields added, removed, or modified.

**Validates: Requirements 1.1, 3.1, 3.2**

### Property 2: Acknowledgement shape

*For any* valid JSON-RPC 2.0 message successfully enqueued, the response sent to the client shall conform to the `Job_Acknowledgement` shape: `{ jsonrpc: "2.0", result: { status: "queued", jobId: <non-empty string> }, id: <original message id> }`.

**Validates: Requirements 1.2**

### Property 3: Parse error path rejects invalid JSON

*For any* string that is not valid JSON, the gateway message handler shall respond with the parse error shape `{ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }` and shall not add any job to the queue.

**Validates: Requirements 1.3**

### Property 4: Worker processor logs job ID and data

*For any* job with any ID and any data object, the worker's processor function shall log both the job ID and the full job data to standard output.

**Validates: Requirements 2.3**

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Invalid JSON in WebSocket message | Respond with JSON-RPC parse error `{ code: -32700 }`, do not enqueue |
| Redis connection failure at startup | Process exits with error log — no silent swallowing |
| BullMQ `queue.add()` throws | Log the error, send a generic JSON-RPC internal error response to the client |
| Worker job processor throws | BullMQ marks the job as failed; default retry behavior applies |

The `maxRetriesPerRequest: null` option on the IORedis connection is required by BullMQ to prevent connection errors from being swallowed silently.

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are used. Unit tests cover specific examples and configuration assertions; property tests verify universal correctness across randomized inputs.

### Property-Based Testing

Library: **fast-check** (TypeScript-native, works with Bun's test runner).

Each property test runs a minimum of **100 iterations**.

Each test is tagged with a comment in the format:
`// Feature: bullmq-redis-integration, Property <N>: <property text>`

| Property | Test description | fast-check arbitraries |
|---|---|---|
| Property 1 | Enqueue a random valid JSON-RPC message, read back `job.data`, assert deep equality | `fc.record({ jsonrpc: fc.constant("2.0"), method: fc.string(), params: fc.anything(), id: fc.oneof(fc.integer(), fc.string()) })` |
| Property 2 | For any valid message, assert response matches `Job_Acknowledgement` shape with correct `id` | Same as above |
| Property 3 | For any non-JSON string, assert parse error response and zero jobs enqueued | `fc.string()` filtered to exclude valid JSON |
| Property 4 | For any job ID and data, call processor, assert both are logged | `fc.record({ id: fc.string(), data: fc.anything() })` |

### Unit Tests (Examples)

- Gateway connects to Redis using `REDIS_HOST` / `REDIS_PORT` env vars (Requirement 1.4)
- Worker connects to Redis using `REDIS_HOST` / `REDIS_PORT` env vars (Requirement 2.1)
- Worker is constructed with queue name `"jobs"` (Requirement 2.2)
- `docker-compose.yml` defines a `redis` service with image `redis:alpine` and port mapping `6379:6379` (Requirements 4.1, 4.2)

### Test File Layout

```
apps/gateway/
  __tests__/
    gateway.test.ts      # Property tests for Properties 1, 2, 3
apps/worker/
  __tests__/
    worker.test.ts       # Property test for Property 4
    worker.unit.test.ts  # Unit tests for connection/queue name
```
