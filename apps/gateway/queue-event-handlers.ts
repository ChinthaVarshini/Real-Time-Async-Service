export function handleProgress(registry: Map<string, any>, jobId: string, data: number): void {

  const ws = registry.get(jobId);
  if (!ws) return;
  try {
    ws.send(JSON.stringify({
      jsonrpc: "2.0",
      method: "job.progress",
      params: { jobId, progress: data },
    }));
  } catch (err) {
    console.error("ws.send error (progress):", err);
    registry.delete(jobId);
  }
}

export function handleCompleted(registry: Map<string, any>, jobId: string, returnvalue: any): void {
  const ws = registry.get(jobId);
  if (ws) {
    try {
      ws.send(JSON.stringify({
        jsonrpc: "2.0",
        method: "job.result",
        params: { jobId, result: returnvalue },
      }));
      console.log(`Final result → sent to browser ✅`);
    } catch (err) {
      console.error("ws.send error (completed):", err);
    }
  }
  registry.delete(jobId);
}

export function handleFailed(registry: Map<string, any>, jobId: string, failedReason: string): void {
  console.log(`[Job ${jobId}] Failed: ${failedReason}`);
  const ws = registry.get(jobId);
  if (ws) {
    try {
      ws.send(JSON.stringify({
        jsonrpc: "2.0",
        method: "job.failed",
        params: { jobId, error: failedReason },
      }));
    } catch (err) {
      console.error("ws.send error (failed):", err);
    }
  }
  registry.delete(jobId);
}
