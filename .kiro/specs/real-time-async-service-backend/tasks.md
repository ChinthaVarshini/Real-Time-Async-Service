# Implementation Plan: Real-Time Async Service Backend (Foundation/Setup)

## Overview

Scaffold a Bun-based monorepo with `apps/gateway`, `apps/worker`, and `packages/shared`, configure environment variables, and verify the Gateway entry point starts cleanly.

## Tasks

- [x] 1. Create workspace root structure
  - Create root `package.json` with `workspaces: ["apps/*", "packages/*"]`
  - Create `.env` with `PORT=3000`, `REDIS_HOST=localhost`, `REDIS_PORT=6379`, `JWT_SECRET=secret`
  - Create `.env.example` mirroring the same keys and example values
  - Add `.env` to `.gitignore`
  - _Requirements: 1.1, 2.1, 2.2, 2.3_

- [x] 2. Create package manifests for each workspace member
  - [x] 2.1 Create `apps/gateway/package.json` declaring `fastify`, `@fastify/websocket`, `zod`, `ioredis`, `bullmq`
    - _Requirements: 1.2, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.2 Create `apps/worker/package.json` declaring `bullmq`, `ioredis`, `zod`
    - _Requirements: 1.3, 4.1, 4.2, 4.3_

  - [x] 2.3 Create `packages/shared/package.json` with `name: "@repo/shared"` declaring `zod`
    - _Requirements: 1.4, 5.1_

- [x] 3. Implement Gateway entry point
  - [x] 3.1 Create `apps/gateway/index.ts` that prints `"Gateway server started"` to stdout and exits cleanly
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 4. Checkpoint — verify workspace installs and Gateway starts
  - Ensure `bun install` at the root resolves all dependencies without errors
  - Ensure `bun run apps/gateway/index.ts` prints `"Gateway server started"` and exits without errors
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 1.5, 3.6, 4.4, 5.2, 6.2, 6.3_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
