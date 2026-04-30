# Implementation Plan: JWT Gateway Auth

## Overview

Minimal changes to `apps/gateway/index.ts` to add cryptographic JWT verification using `jsonwebtoken`. A startup guard ensures `JWT_SECRET` is present, and a `verifyToken` helper gates the WebSocket upgrade path.

## Tasks

- [x] 1. Add jsonwebtoken dependency
  - Add `"jsonwebtoken": "latest"` and `"@types/jsonwebtoken": "latest"` to `apps/gateway/package.json`
  - _Requirements: 4.1, 4.2_

- [x] 2. Add JWT_SECRET to environment configuration
  - Confirm `JWT_SECRET` entry exists in `.env.example` with a placeholder value
  - _Requirements: 3.2_

- [x] 3. Implement startup guard and verifyToken helper
  - [x] 3.1 Add startup guard in `apps/gateway/index.ts` before `Bun.serve`
    - Read `JWT_SECRET` from `process.env.JWT_SECRET`
    - Throw `new Error("JWT_SECRET environment variable is required")` if missing
    - _Requirements: 2.5, 3.1_

  - [ ]* 3.2 Write unit test for startup guard
    - Test that process throws when `JWT_SECRET` is unset
    - _Requirements: 2.5_

  - [x] 3.3 Implement `verifyToken(token: string): boolean` in `apps/gateway/index.ts`
    - Wrap `jwt.verify(token, JWT_SECRET)` in try/catch, return `true` on success and `false` on any error
    - Import `jwt` from `jsonwebtoken`
    - _Requirements: 2.1, 4.1_

  - [ ]* 3.4 Write unit tests for verifyToken
    - Test returns `true` for a freshly signed valid token
    - Test returns `false` for a token signed with the wrong secret
    - Test returns `false` for an expired token
    - _Requirements: 2.2, 2.3, 2.4_

- [x] 4. Modify /ws fetch handler to enforce JWT verification
  - [x] 4.1 Update the `/ws` branch in the `fetch` handler
    - Keep existing token presence check (returns 401 `"Unauthorized"` when missing)
    - Add `verifyToken` call after presence check; return 401 `"Invalid token"` if it returns `false`
    - Proceed to `server.upgrade(req)` only when token is present and valid
    - _Requirements: 1.1, 2.2, 2.3, 2.4_

  - [ ]* 4.2 Write property test for Property 1: Missing token yields 401 Unauthorized
    - **Property 1: Missing token yields 401 Unauthorized**
    - **Validates: Requirements 1.1**
    - Use `fast-check` with `numRuns: 100`; assert fetch handler returns status 401 with body `"Unauthorized"` for any request to `/ws` without a `token` param

  - [ ]* 4.3 Write property test for Property 2: Valid token allows upgrade
    - **Property 2: Valid token allows upgrade**
    - **Validates: Requirements 2.2, 5.4**
    - Use `fast-check` with `numRuns: 100`; for any payload signed with `JWT_SECRET`, assert handler does not return 401

  - [ ]* 4.4 Write property test for Property 3: Invalid signature yields 401 Invalid token
    - **Property 3: Invalid signature yields 401 Invalid token**
    - **Validates: Requirements 2.3, 5.5**
    - Use `fast-check` with `numRuns: 100`; for any token signed with a different secret, assert handler returns 401 with body `"Invalid token"`

  - [ ]* 4.5 Write property test for Property 4: Expired token yields 401 Invalid token
    - **Property 4: Expired token yields 401 Invalid token**
    - **Validates: Requirements 2.4**
    - Sign a token with `exp` in the past; assert handler returns 401 with body `"Invalid token"`

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests require `fast-check` as a dev dependency
- The `verifyToken` function must be extracted so it can be tested and referenced in the fetch handler
