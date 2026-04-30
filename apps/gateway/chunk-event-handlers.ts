import type { SessionState, SessionStore } from "./session-store";

function allFilesTerminal(session: SessionState): boolean {
  return Array.from(session.files.values()).every(
    (f) => f.status === "completed" || f.status === "failed"
  );
}

export function handleChunkProgress(
  sessionStore: SessionStore,
  jobId: string,
  progress: number
): void {
  const entry = sessionStore.getFileByJobId(jobId);
  if (!entry) {
    console.log(`[orphaned] chunk.progress for jobId: ${jobId}`);
    return;
  }

  const { session, file, chunkIndex } = entry;

  // Send file.processing on first chunk starting (first progress event for this file)
  if (file.status === "pending") {
    file.status = "processing";
    session.seq++;
    console.log(`[Gateway] file.processing → ${file.filename} (fileId: ${file.fileId})`);
    session.ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "file.processing",
        params: {
          sessionId: session.sessionId,
          fileId: file.fileId,
          filename: file.filename,
          seq: session.seq,
        },
      })
    );
  }

  // Update chunk status to processing
  const chunk = file.chunks.get(chunkIndex);
  if (chunk && chunk.status === "pending") {
    chunk.status = "processing";
  }

  console.log(`[Gateway] chunk.progress → ${file.filename} chunk ${chunkIndex}/${file.chunkCount} @ ${progress}%`);

  session.seq++;
  session.ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "chunk.progress",
      params: {
        sessionId: session.sessionId,
        fileId: file.fileId,
        filename: file.filename,
        chunkIndex,
        chunkCount: file.chunkCount,
        progress,
        seq: session.seq,
      },
    })
  );
}

export function handleChunkCompleted(
  sessionStore: SessionStore,
  jobId: string,
  result: any
): void {
  const entry = sessionStore.getFileByJobId(jobId);
  if (!entry) {
    console.log(`[orphaned] chunk.completed for jobId: ${jobId}`);
    return;
  }

  const { session, file, chunkIndex } = entry;

  sessionStore.updateChunk(jobId, "completed", result);

  // file.processing is now sent from handleChunkProgress on first progress event
  // Just ensure status is set to processing if somehow missed
  if (file.status === "pending") {
    file.status = "processing";
  }

  // Check if all chunks for this file are completed
  const completedChunks = Array.from(file.chunks.values()).filter(
    (c) => c.status === "completed"
  ).length;
  const allChunksDone = file.chunks.size === file.chunkCount && completedChunks === file.chunkCount;

  if (allChunksDone) {
    file.status = "completed";
    session.completedCount++;

    const aggregatedResults = Array.from(file.chunks.values())
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map((c) => c.result);

    console.log(`[Gateway] file.completed → ${file.filename} (${session.completedCount}/${session.totalCount})`);

    session.seq++;
    session.ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "file.completed",
        params: {
          sessionId: session.sessionId,
          fileId: file.fileId,
          filename: file.filename,
          result: aggregatedResults,
          completedCount: session.completedCount,
          totalCount: session.totalCount,
          seq: session.seq,
        },
      })
    );

    if (allFilesTerminal(session)) {
      const durationMs = Date.now() - session.startedAt;
      console.log(`[Gateway] session.completed → ${session.sessionId} (${session.completedCount} done, ${session.failedCount} failed, ${durationMs}ms)`);
      session.seq++;
      session.ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session.completed",
          params: {
            sessionId: session.sessionId,
            totalCount: session.totalCount,
            completedCount: session.completedCount,
            failedCount: session.failedCount,
            durationMs,
            seq: session.seq,
          },
        })
      );
    }
  }
}

export function handleChunkFailed(
  sessionStore: SessionStore,
  jobId: string,
  error: string
): void {
  const entry = sessionStore.getFileByJobId(jobId);
  if (!entry) {
    console.log(`[orphaned] chunk.failed for jobId: ${jobId}`);
    return;
  }

  const { session, file, chunkIndex } = entry;

  sessionStore.updateChunk(jobId, "failed", undefined, error);

  file.status = "failed";
  file.failedChunkIndex = chunkIndex;
  file.error = error;
  session.failedCount++;

  console.log(`[Gateway] file.failed → ${file.filename} chunk ${chunkIndex}: ${error}`);

  session.seq++;
  session.ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "file.failed",
      params: {
        sessionId: session.sessionId,
        fileId: file.fileId,
        filename: file.filename,
        error,
        failedChunkIndex: chunkIndex,
        totalCount: session.totalCount,
        seq: session.seq,
      },
    })
  );

  if (allFilesTerminal(session)) {
    const durationMs = Date.now() - session.startedAt;
    session.seq++;
    session.ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "session.completed",
        params: {
          sessionId: session.sessionId,
          totalCount: session.totalCount,
          completedCount: session.completedCount,
          failedCount: session.failedCount,
          durationMs,
          seq: session.seq,
        },
      })
    );
  }
}
