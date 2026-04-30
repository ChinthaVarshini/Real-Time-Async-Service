export interface ChunkState {
  chunkIndex: number;
  status: "pending" | "processing" | "completed" | "failed";
  result?: any;
  error?: string;
}

export interface FileState {
  fileId: string;
  filename: string;
  mimeType: string;
  chunkCount: number;
  chunks: Map<number, ChunkState>;
  status: "pending" | "processing" | "completed" | "failed";
  result?: any;
  error?: string;
  failedChunkIndex?: number;
  jobIds: string[]; // one per chunk
}

export interface SessionState {
  sessionId: string;
  ws: any; // WebSocket reference
  files: Map<string, FileState>;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  startedAt: number; // Date.now()
  seq: number; // monotonically increasing per session
}

export class SessionStore {
  private sessions = new Map<string, SessionState>();
  // O(1) reverse lookup: jobId → { sessionId, fileId, chunkIndex }
  private jobIdIndex = new Map<string, { sessionId: string; fileId: string; chunkIndex: number }>();

  createSession(ws: any): SessionState {
    const sessionId = crypto.randomUUID();
    const session: SessionState = {
      sessionId,
      ws,
      files: new Map(),
      totalCount: 0,
      completedCount: 0,
      failedCount: 0,
      startedAt: Date.now(),
      seq: 0,
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  addFile(sessionId: string, file: Omit<FileState, "chunks" | "status">): FileState {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const chunks = new Map<number, ChunkState>();
    for (let i = 0; i < file.chunkCount; i++) {
      chunks.set(i, { chunkIndex: i, status: "pending" });
    }

    const fileState: FileState = {
      ...file,
      chunks,
      status: "pending",
    };

    session.files.set(file.fileId, fileState);
    session.totalCount++;

    // Register all jobIds in the reverse index
    for (let chunkIndex = 0; chunkIndex < file.jobIds.length; chunkIndex++) {
      const jobId = file.jobIds[chunkIndex];
      this.jobIdIndex.set(jobId, { sessionId, fileId: file.fileId, chunkIndex });
    }

    return fileState;
  }

  getFileByJobId(jobId: string): { session: SessionState; file: FileState; chunkIndex: number } | undefined {
    const entry = this.jobIdIndex.get(jobId);
    if (!entry) return undefined;

    const session = this.sessions.get(entry.sessionId);
    if (!session) return undefined;

    const file = session.files.get(entry.fileId);
    if (!file) return undefined;

    return { session, file, chunkIndex: entry.chunkIndex };
  }

  updateChunk(jobId: string, status: ChunkState["status"], result?: any, error?: string): void {
    const entry = this.jobIdIndex.get(jobId);
    if (!entry) return;

    const session = this.sessions.get(entry.sessionId);
    if (!session) return;

    const file = session.files.get(entry.fileId);
    if (!file) return;

    const chunk = file.chunks.get(entry.chunkIndex);
    if (!chunk) return;

    chunk.status = status;
    if (result !== undefined) chunk.result = result;
    if (error !== undefined) chunk.error = error;
  }

  deleteSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Clean up all jobId index entries for this session
    for (const file of session.files.values()) {
      for (const jobId of file.jobIds) {
        this.jobIdIndex.delete(jobId);
      }
    }

    this.sessions.delete(sessionId);
  }
}
