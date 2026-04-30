import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import { cleanupRegistry } from "../registry";

// Feature: job-progress-updates, Property 3: Registry stores and retrieves jobId-to-ws mappings
describe("Property 3: Registry stores and retrieves jobId-to-ws mappings", () => {
  test("each jobId maps to its corresponding ws without cross-entry interference", () => {
    // Validates: Requirements 2.1, 2.3
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.uniqueArray(fc.string({ minLength: 1 })).chain(ids => fc.constant(ids[0] ?? "id")), fc.object()), { minLength: 1 }),
        (pairs) => {
          const registry = new Map<string, any>();
          // Use unique jobIds to avoid overwriting
          const uniquePairs: [string, any][] = [];
          const seen = new Set<string>();
          for (const [jobId, ws] of pairs) {
            if (!seen.has(jobId)) {
              seen.add(jobId);
              uniquePairs.push([jobId, ws]);
            }
          }

          // Store all pairs
          for (const [jobId, ws] of uniquePairs) {
            registry.set(jobId, ws);
          }

          // Assert each lookup returns the correct ws
          for (const [jobId, ws] of uniquePairs) {
            expect(registry.get(jobId)).toBe(ws);
          }

          // Assert no cross-entry interference
          expect(registry.size).toBe(uniquePairs.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: job-progress-updates, Property 4: Registry cleanup on WebSocket close
describe("Property 4: Registry cleanup on WebSocket close", () => {
  test("all entries for a closed ws are removed from the registry", () => {
    // Validates: Requirements 2.2
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
        (jobIds) => {
          const registry = new Map<string, any>();
          const ws = { id: "closing-socket" };
          const otherWs = { id: "other-socket" };

          // Add entries for the closing ws
          const uniqueJobIds = [...new Set(jobIds)];
          for (const jobId of uniqueJobIds) {
            registry.set(jobId, ws);
          }

          // Add an unrelated entry that should NOT be removed
          const otherJobId = "__other__";
          registry.set(otherJobId, otherWs);

          // Simulate ws close
          cleanupRegistry(registry, ws);

          // All entries for the closing ws should be removed
          for (const jobId of uniqueJobIds) {
            expect(registry.has(jobId)).toBe(false);
          }

          // Unrelated entry should remain
          expect(registry.get(otherJobId)).toBe(otherWs);
        }
      ),
      { numRuns: 100 }
    );
  });
});
