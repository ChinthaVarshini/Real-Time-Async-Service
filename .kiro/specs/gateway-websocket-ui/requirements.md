# Requirements Document

## Introduction

This document defines the Day 2 enhancement for the Real-Time Async Service Backend monorepo. The feature adds two capabilities to the existing `apps/gateway` application:

1. **WebSocket Server** — Accept WebSocket connections on the configured port, authenticate clients via JWT query parameter, validate incoming JSON-RPC 2.0 messages using Zod, and respond with acknowledgements or structured errors.
2. **Static Web UI** — Serve a single-page HTML test client that connects to the WebSocket server, sends JSON-RPC messages, and displays server responses.

The implementation extends `apps/gateway/index.ts` and adds a static file at `apps/gateway/public/index.html`. Shared Zod schemas live in `packages/shared`.

## Glossary

- **Gateway**: The Fastify application at `apps/gateway/index.ts` that handles HTTP and WebSocket connections
- **WebSocket_Server**: The `@fastify/websocket` plugin instance registered on the Gateway
- **Client**: A browser or tool that opens a WebSocket connection to the Gateway
- **JWT**: JSON Web Token used to authenticate a connecting Client
- **JSON_RPC_Message**: A JSON object conforming to the JSON-RPC 2.0 specification: `{ jsonrpc: "2.0", method: string, params: object, id: string | number }`
- **JSON_RPC_Schema**: The Zod schema that validates a JSON_RPC_Message, defined in `packages/shared`
- **JSON_RPC_Error**: A JSON-RPC 2.0 error response: `{ jsonrpc: "2.0", error: { code: number, message: string }, id: string | number | null }`
- **JSON_RPC_Ack**: A JSON-RPC 2.0 success response: `{ jsonrpc: "2.0", result: "received", id: string | number }`
- **Static_Server**: The `@fastify/static` plugin instance registered on the Gateway that serves files from `apps/gateway/public/`
- **Web_UI**: The single-page HTML file at `apps/gateway/public/index.html` used to test the WebSocket connection
- **Environment_Config**: Runtime configuration loaded from `.env` — specifically `PORT` and `JWT_SECRET`

---

## Requirements

### Requirement 1: WebSocket Endpoint Registration

**User Story:** As a developer, I want the Gateway to accept WebSocket connections, so that clients can establish a persistent, bidirectional channel with the server.

#### Acceptance Criteria

1. THE Gateway SHALL register the `@fastify/websocket` plugin on startup
2. THE Gateway SHALL expose a WebSocket route at the path `/ws`
3. WHEN the Gateway starts, THE Gateway SHALL listen on the port defined by the `PORT` environment variable (default `3000`)

---

### Requirement 2: Client Connection Lifecycle Logging

**User Story:** As a developer, I want the Gateway to log client connect and disconnect events, so that I can observe connection activity during development and debugging.

#### Acceptance Criteria

1. WHEN a Client establishes a WebSocket connection, THE Gateway SHALL log a message indicating a new client has connected
2. WHEN a Client closes a WebSocket connection, THE Gateway SHALL log a message indicating the client has disconnected

---

### Requirement 3: JWT Authentication on Connection

**User Story:** As a developer, I want WebSocket connections to require a JWT token, so that only authenticated clients can interact with the server.

#### Acceptance Criteria

1. WHEN a Client connects to `/ws`, THE Gateway SHALL read the `token` query parameter from the connection URL
2. IF the `token` query parameter is absent, THEN THE Gateway SHALL close the WebSocket connection with code `4001` and reason `"Unauthorized"`
3. IF the `token` query parameter is present, THEN THE Gateway SHALL allow the connection to proceed
4. THE Gateway SHALL NOT validate the token signature at this stage — presence of the token is sufficient for acceptance

---

### Requirement 4: Incoming Message Parsing and Validation

**User Story:** As a developer, I want the Gateway to parse and validate incoming WebSocket messages as JSON-RPC 2.0, so that only well-formed messages are processed.

#### Acceptance Criteria

1. WHEN a Client sends a message, THE Gateway SHALL attempt to parse the message payload as JSON
2. IF the message payload is not valid JSON, THEN THE Gateway SHALL send a JSON_RPC_Error with code `-32700` (Parse error) and `id: null`
3. WHEN a parsed JSON object is received, THE Gateway SHALL validate it against the JSON_RPC_Schema
4. IF the parsed object does not conform to the JSON_RPC_Schema, THEN THE Gateway SHALL send a JSON_RPC_Error with code `-32600` (Invalid Request) and the original `id` if present, otherwise `null`
5. WHEN a valid JSON_RPC_Message is received, THE Gateway SHALL log the method name and id of the message

---

### Requirement 5: Acknowledgement Response

**User Story:** As a developer, I want the Gateway to acknowledge valid JSON-RPC messages, so that clients can confirm their messages were received and accepted.

#### Acceptance Criteria

1. WHEN a valid JSON_RPC_Message is received, THE Gateway SHALL send a JSON_RPC_Ack to the Client
2. THE JSON_RPC_Ack SHALL have the same `id` as the received JSON_RPC_Message
3. THE JSON_RPC_Ack SHALL have `result` set to `"received"`

---

### Requirement 6: Shared JSON-RPC Schema

**User Story:** As a developer, I want the JSON-RPC 2.0 Zod schema defined in `packages/shared`, so that it can be reused across gateway and worker apps.

#### Acceptance Criteria

1. THE Shared package SHALL export a Zod schema named `jsonRpcMessageSchema` that validates objects with the shape `{ jsonrpc: "2.0", method: string, params: object, id: string | number }`
2. THE Shared package SHALL export the inferred TypeScript type `JsonRpcMessage` derived from `jsonRpcMessageSchema`
3. THE Gateway SHALL import `jsonRpcMessageSchema` from `@repo/shared` for message validation

---

### Requirement 7: Static File Serving

**User Story:** As a developer, I want the Gateway to serve static files from `apps/gateway/public/`, so that the Web UI is accessible via HTTP without a separate server.

#### Acceptance Criteria

1. THE Gateway SHALL register the `@fastify/static` plugin on startup
2. THE Static_Server SHALL serve files from the `apps/gateway/public/` directory
3. WHEN a GET request is made to `http://localhost:3000/`, THE Static_Server SHALL respond with `apps/gateway/public/index.html`
4. THE Gateway `package.json` SHALL declare `@fastify/static` as a dependency

---

### Requirement 8: Web UI — Connection and Display

**User Story:** As a developer, I want a simple HTML page that connects to the WebSocket server, so that I can test the full message flow from a browser without external tooling.

#### Acceptance Criteria

1. THE Web_UI SHALL have the page title `"Async Backend Demo"`
2. WHEN the Web_UI is loaded in a browser, THE Web_UI SHALL automatically open a WebSocket connection to `ws://localhost:3000/ws?token=test-token`
3. WHEN the WebSocket connection is established, THE Web_UI SHALL display the text `"Connected to server"` in the output area
4. WHEN the WebSocket connection is closed, THE Web_UI SHALL display the text `"Disconnected"` in the output area
5. WHEN the Gateway sends a message, THE Web_UI SHALL display the raw JSON response in the output area

---

### Requirement 9: Web UI — Message Sending

**User Story:** As a developer, I want the Web UI to send JSON-RPC messages on demand, so that I can trigger server-side processing and observe the response.

#### Acceptance Criteria

1. THE Web_UI SHALL contain a text input field for user input
2. THE Web_UI SHALL contain a `"Send"` button
3. WHEN the `"Send"` button is clicked, THE Web_UI SHALL construct a JSON_RPC_Message with `method: "data.processHeavyTask"`, `params: { input: <user input value> }`, and `id: Date.now()`
4. WHEN the `"Send"` button is clicked, THE Web_UI SHALL send the constructed JSON_RPC_Message over the open WebSocket connection
5. IF the WebSocket connection is not open when the `"Send"` button is clicked, THEN THE Web_UI SHALL display an error message in the output area instead of attempting to send
