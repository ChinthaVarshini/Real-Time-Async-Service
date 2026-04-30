# Requirements Document

## Introduction

This document defines the foundation/setup stage for the Real-Time Async Service Backend, a Bun-based monorepo project. The goal is to establish the initial project structure, environment configuration, and dependencies required for a clean, demo-ready backend. No business logic is implemented at this stage.

## Glossary

- **Workspace**: The root Bun monorepo containing all apps and packages
- **Gateway**: The entry-point application located at `apps/gateway/`, responsible for handling incoming connections
- **Worker**: The background processing application located at `apps/worker/`, responsible for consuming async jobs
- **Shared**: The shared package located at `packages/shared/`, providing common utilities and types across apps
- **BullMQ**: A Redis-based queue library used for async job processing
- **IORedis**: A Redis client library used by BullMQ and the Gateway/Worker apps
- **Zod**: A TypeScript-first schema validation library
- **Fastify**: A high-performance Node/Bun HTTP framework used by the Gateway
- **Environment_Config**: The set of runtime configuration values loaded from `.env`

---

## Requirements

### Requirement 1: Monorepo Workspace Structure

**User Story:** As a developer, I want a Bun monorepo workspace set up with clearly separated apps and packages, so that each module can be developed and maintained independently.

#### Acceptance Criteria

1. THE Workspace SHALL contain a root `package.json` with a `workspaces` field listing `"apps/*"` and `"packages/*"`
2. THE Workspace SHALL contain an `apps/gateway/` directory with its own `package.json`
3. THE Workspace SHALL contain an `apps/worker/` directory with its own `package.json`
4. THE Workspace SHALL contain a `packages/shared/` directory with its own `package.json`
5. WHEN `bun install` is executed at the root, THE Workspace SHALL install all dependencies across all apps and packages without errors

---

### Requirement 2: Environment Configuration

**User Story:** As a developer, I want environment variables defined in `.env` and `.env.example` files, so that the project can be configured for different environments without hardcoding values.

#### Acceptance Criteria

1. THE Workspace SHALL contain a `.env` file at the root with the following variables: `PORT=3000`, `REDIS_HOST=localhost`, `REDIS_PORT=6379`, `JWT_SECRET=secret`
2. THE Workspace SHALL contain a `.env.example` file at the root with the same variable keys and example values as `.env`
3. IF the `.env` file is absent, THE Workspace SHALL provide `.env.example` as a reference for required configuration keys

---

### Requirement 3: Gateway Dependencies

**User Story:** As a developer, I want the Gateway app to have its required dependencies declared, so that it is ready to implement HTTP and WebSocket handling in future stages.

#### Acceptance Criteria

1. THE Gateway `package.json` SHALL declare `fastify` as a dependency
2. THE Gateway `package.json` SHALL declare `@fastify/websocket` as a dependency
3. THE Gateway `package.json` SHALL declare `zod` as a dependency
4. THE Gateway `package.json` SHALL declare `ioredis` as a dependency
5. THE Gateway `package.json` SHALL declare `bullmq` as a dependency
6. WHEN `bun install` is executed, THE Workspace SHALL resolve and install all Gateway dependencies without errors

---

### Requirement 4: Worker Dependencies

**User Story:** As a developer, I want the Worker app to have its required dependencies declared, so that it is ready to implement async job processing in future stages.

#### Acceptance Criteria

1. THE Worker `package.json` SHALL declare `bullmq` as a dependency
2. THE Worker `package.json` SHALL declare `ioredis` as a dependency
3. THE Worker `package.json` SHALL declare `zod` as a dependency
4. WHEN `bun install` is executed, THE Workspace SHALL resolve and install all Worker dependencies without errors

---

### Requirement 5: Shared Package Dependencies

**User Story:** As a developer, I want the Shared package to have its required dependencies declared, so that it can provide common schema validation utilities to other apps.

#### Acceptance Criteria

1. THE Shared `package.json` SHALL declare `zod` as a dependency
2. WHEN `bun install` is executed, THE Workspace SHALL resolve and install all Shared package dependencies without errors

---

### Requirement 6: Gateway Entry Point

**User Story:** As a developer, I want a minimal Gateway entry point file, so that I can verify the app starts correctly before implementing any business logic.

#### Acceptance Criteria

1. THE Gateway SHALL contain an `index.ts` file at `apps/gateway/index.ts`
2. WHEN `bun run apps/gateway/index.ts` is executed, THE Gateway SHALL print `"Gateway server started"` to standard output
3. WHEN `bun run apps/gateway/index.ts` is executed, THE Gateway SHALL exit without runtime errors
