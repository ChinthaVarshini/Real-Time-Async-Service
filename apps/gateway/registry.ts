export const clientRegistry = new Map<string, any>(); // jobId → ws

export function cleanupRegistry(registry: Map<string, any>, ws: any): void {
  for (const [jobId, socket] of registry) {
    if (socket === ws) registry.delete(jobId);
  }
}
