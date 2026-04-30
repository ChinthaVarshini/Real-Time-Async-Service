# Requirements Document

## Introduction

This feature adds JWT token verification to the existing Bun WebSocket Gateway. Currently the Gateway checks for the presence of a `token` query parameter but does not cryptographically verify it. After this change, the Gateway will validate the token using the `jsonwebtoken` library against a secret key loaded from the environment. Invalid or missing tokens are rejected before the WebSocket upgrade is performed. Valid tokens allow the connection to proceed and jobs to be processed as normal. The feature also covers how to test the authentication path with both valid and invalid tokens.

## Glossary

- **Gateway**: The Bun WebSocket server running in `apps/gateway/index.ts` on port 4000
- **JWT**: A JSON Web Token as defined by RFC 7519, signed with the HS256 algorithm
- **JWT_Secret**: The secret key used to sign and verify JWTs, loaded from the `JWT_SECRET` environment variable
- **Token**: A JWT string supplied by the client as the `token` query parameter in the WebSocket connection URL
- **Verifier**: The component inside the Gateway responsible for verifying the Token using the JWT_Secret
- **Authenticated_Connection**: A WebSocket connection that has passed JWT verification
- **Rejected_Connection**: A WebSocket connection attempt that failed JWT verification

---

## Requirements

### Requirement 1: Token Presence Check

**User Story:** As the Gateway, I want to reject connections that provide no token, so that unauthenticated clients cannot establish a WebSocket session.

#### Acceptance Criteria

1. WHEN a WebSocket upgrade request is received without a `token` query parameter, THE Gateway SHALL return an HTTP 401 response with the body `"Unauthorized"` and SHALL NOT upgrade the connection.

### Requirement 2: JWT Verification

**User Story:** As the Gateway, I want to cryptographically verify the JWT supplied by the client, so that only clients with a valid token can connect.

#### Acceptance Criteria

1. WHEN a WebSocket upgrade request is received with a `token` query parameter, THE Verifier SHALL verify the Token using the JWT_Secret loaded from the `JWT_SECRET` environment variable.
2. WHEN the Token signature is valid and the token is not expired, THE Gateway SHALL upgrade the connection to an Authenticated_Connection and allow job processing to proceed.
3. IF the Token signature is invalid, THEN THE Gateway SHALL return an HTTP 401 response with the body `"Invalid token"` and SHALL NOT upgrade the connection.
4. IF the Token is expired, THEN THE Gateway SHALL return an HTTP 401 response with the body `"Invalid token"` and SHALL NOT upgrade the connection.
5. IF the `JWT_SECRET` environment variable is not set, THEN THE Gateway SHALL throw a startup error and SHALL NOT accept any connections.

### Requirement 3: Secret Key Configuration

**User Story:** As a developer, I want the JWT secret to be loaded from the environment, so that the secret is never hard-coded in source code.

#### Acceptance Criteria

1. THE Gateway SHALL read the JWT_Secret exclusively from the `JWT_SECRET` environment variable at startup.
2. THE `.env.example` file SHALL include a `JWT_SECRET` entry with a placeholder value.

### Requirement 4: Dependency on jsonwebtoken

**User Story:** As a developer, I want the Gateway to use the `jsonwebtoken` library for token verification, so that JWT handling follows a well-tested standard implementation.

#### Acceptance Criteria

1. THE Gateway SHALL use the `jsonwebtoken` npm package to verify tokens.
2. THE `apps/gateway/package.json` SHALL declare `jsonwebtoken` as a dependency.

### Requirement 5: Testing with Valid and Invalid Tokens

**User Story:** As a developer, I want to know how to test the JWT authentication path, so that I can verify the feature works correctly during development.

#### Acceptance Criteria

1. THE documentation SHALL describe how to generate a valid JWT using the `JWT_SECRET` from `.env` for use in manual testing.
2. THE documentation SHALL describe how to connect to the Gateway with a valid token and confirm the connection is accepted.
3. THE documentation SHALL describe how to connect to the Gateway with an invalid token and confirm the connection is rejected with an HTTP 401 response.
4. WHEN a client connects using a valid token via `wscat` or a browser, THE Gateway SHALL accept the connection and process subsequent JSON-RPC messages normally.
5. WHEN a client connects using an invalid or tampered token via `wscat` or a browser, THE Gateway SHALL reject the connection with HTTP 401 before the WebSocket handshake completes.
