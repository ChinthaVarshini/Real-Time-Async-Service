export const CHUNK_SIZE_BYTES = parseInt(process.env.CHUNK_SIZE_BYTES ?? "1048576", 10);
export const MAX_FILE_SIZE_BYTES = parseInt(process.env.MAX_FILE_SIZE_BYTES ?? "104857600", 10);

/**
 * Splits a Uint8Array into sequential chunks of at most chunkSizeBytes each.
 * A file with 0 bytes returns a single empty chunk.
 * A file <= chunkSizeBytes returns exactly one chunk.
 */
export function splitIntoChunks(fileBytes: Uint8Array, chunkSizeBytes: number): Uint8Array[] {
  if (fileBytes.length === 0) {
    return [new Uint8Array(0)];
  }

  const chunks: Uint8Array[] = [];
  let offset = 0;

  while (offset < fileBytes.length) {
    const end = Math.min(offset + chunkSizeBytes, fileBytes.length);
    chunks.push(fileBytes.slice(offset, end));
    offset = end;
  }

  return chunks;
}

import type { SessionStore } from "./session-store";

function sendError(ws: any, id: any, code: number, message: string): void {
  ws.send(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: id ?? null }));
}

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

function decodeBase64(data: string): Buffer | null {
  if (!data || !BASE64_RE.test(data)) return null;
  return Buffer.from(data, "base64");
}

export async function handleFileUpload(
  ws: any,
  parsed: any,
  queue: any,
  sessionStore: SessionStore,
  registry: Map<string, any>
): Promise<void> {
  const { filename, mimeType, data } = parsed.params ?? {};

  const fileBytes = decodeBase64(data);
  if (!fileBytes) {
    return sendError(ws, parsed.id, -32602, "Invalid file payload");
  }

  if (fileBytes.length > MAX_FILE_SIZE_BYTES) {
    return sendError(ws, parsed.id, -32602, "File exceeds maximum allowed size");
  }

  const session = sessionStore.createSession(ws);
  const { sessionId } = session;

  const chunks = splitIntoChunks(fileBytes, CHUNK_SIZE_BYTES);
  const fileId = crypto.randomUUID();
  const chunkCount = chunks.length;
  const jobIds: string[] = [];

  try {
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunkData = Buffer.from(chunks[chunkIndex]).toString("base64");
      const job = await queue.add("file.processChunk", {
        method: "file.processChunk",
        sessionId,
        fileId,
        filename,
        mimeType,
        chunkIndex,
        chunkCount,
        data: chunkData,
      });
      jobIds.push(job.id);
    }
  } catch {
    return sendError(ws, parsed.id, -32603, "Internal error");
  }

  for (const jobId of jobIds) {
    registry.set(jobId, ws);
  }

  sessionStore.addFile(sessionId, { fileId, filename, mimeType, chunkCount, jobIds });

  ws.send(JSON.stringify({ jsonrpc: "2.0", result: { status: "accepted", sessionId }, id: parsed.id ?? null }));
}

export async function handleFileUploadBulk(
  ws: any,
  parsed: any,
  queue: any,
  sessionStore: SessionStore,
  registry: Map<string, any>
): Promise<void> {
  const { files } = parsed.params ?? {};

  if (!Array.isArray(files) || files.length > 500) {
    return sendError(ws, parsed.id, -32602, "Bulk limit exceeded");
  }

  // Validate all files before creating session
  for (const file of files) {
    const decoded = decodeBase64(file.data);
    if (!decoded) {
      return sendError(ws, parsed.id, -32602, "Invalid file payload");
    }
    if (decoded.length > MAX_FILE_SIZE_BYTES) {
      return sendError(ws, parsed.id, -32602, "File exceeds maximum allowed size");
    }
  }

  const session = sessionStore.createSession(ws);
  const { sessionId } = session;
  const allJobIds: string[] = [];

  try {
    for (const file of files) {
      const { filename, mimeType, data } = file;
      const fileBytes = Buffer.from(data, "base64");
      const fileId = crypto.randomUUID();
      const chunks = splitIntoChunks(fileBytes, CHUNK_SIZE_BYTES);
      const chunkCount = chunks.length;
      const jobIds: string[] = [];

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunkData = Buffer.from(chunks[chunkIndex]).toString("base64");
        const job = await queue.add("file.processChunk", {
          method: "file.processChunk",
          sessionId,
          fileId,
          filename,
          mimeType,
          chunkIndex,
          chunkCount,
          data: chunkData,
        });
        jobIds.push(job.id);
      }

      for (const jobId of jobIds) {
        registry.set(jobId, ws);
      }

      sessionStore.addFile(sessionId, { fileId, filename, mimeType, chunkCount, jobIds });
      allJobIds.push(...jobIds);
      console.log(`[Gateway] Received file: ${filename} → ${chunkCount} chunk(s), jobIds: ${jobIds.join(", ")}`);
    }
  } catch {
    return sendError(ws, parsed.id, -32603, "Internal error");
  }

  console.log(`[Gateway] file.uploadBulk accepted: sessionId=${sessionId}, ${files.length} file(s), ${allJobIds.length} total chunk job(s)`);
  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      result: { status: "accepted", sessionId, fileCount: files.length, jobIds: allJobIds },
      id: parsed.id ?? null,
    })
  );
}

export async function handleFileRetry(
  ws: any,
  parsed: any,
  queue: any,
  sessionStore: SessionStore,
  registry: Map<string, any>
): Promise<void> {
  const { sessionId, fileId } = parsed.params ?? {};

  const session = sessionStore.getSession(sessionId);
  if (!session) {
    return sendError(ws, parsed.id, -32602, "Unknown session or file");
  }

  const file = session.files.get(fileId);
  if (!file) {
    return sendError(ws, parsed.id, -32602, "Unknown session or file");
  }

  const newJobIds: string[] = [];

  try {
    for (let chunkIndex = 0; chunkIndex < file.chunkCount; chunkIndex++) {
      const job = await queue.add("file.processChunk", {
        method: "file.processChunk",
        sessionId,
        fileId,
        filename: file.filename,
        mimeType: file.mimeType,
        chunkIndex,
        chunkCount: file.chunkCount,
        data: "",
      });
      newJobIds.push(job.id);
    }
  } catch {
    return sendError(ws, parsed.id, -32603, "Internal error");
  }

  // Remove old jobIds from registry
  for (const oldJobId of file.jobIds) {
    registry.delete(oldJobId);
  }

  // Register new jobIds
  for (const jobId of newJobIds) {
    registry.set(jobId, ws);
  }

  // Update file state with new jobIds
  file.jobIds = newJobIds;

  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      result: { status: "requeued", jobId: newJobIds[0] },
      id: parsed.id ?? null,
    })
  );
}

export function handleSessionStatus(
  ws: any,
  parsed: any,
  sessionStore: SessionStore
): void {
  const { sessionId } = parsed.params ?? {};

  const session = sessionStore.getSession(sessionId);
  if (!session) {
    return sendError(ws, parsed.id, -32602, "Unknown session");
  }

  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      result: {
        sessionId,
        totalCount: session.totalCount,
        completedCount: session.completedCount,
        failedCount: session.failedCount,
        files: Array.from(session.files.values()).map(f => ({
          fileId: f.fileId,
          filename: f.filename,
          status: f.status,
          chunkCount: f.chunkCount,
          chunksCompleted: Array.from(f.chunks.values()).filter(c => c.status === "completed").length,
        })),
      },
      id: parsed.id ?? null,
    })
  );
}
