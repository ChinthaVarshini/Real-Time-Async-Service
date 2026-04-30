/**
 * WebSocket Communication Types
 * Defines interfaces for real-time communication between dashboard and gateway
 */

// Core WebSocket message structure
export interface JSONRPCMessage {
  jsonrpc: '2.0'
  method: string
  params?: any
  id?: string | number | null
}

export interface JSONRPCResponse {
  jsonrpc: '2.0'
  result?: any
  error?: JSONRPCError
  id: string | number | null
}

export interface JSONRPCError {
  code: number
  message: string
  data?: any
}

// Connection management
export interface ConnectionStatus {
  connected: boolean
  serverUrl: string
  lastPing: Date | null
  reconnectAttempts: number
  token?: string
}

export interface ConnectionEvent {
  type: 'connected' | 'disconnected' | 'error' | 'reconnecting'
  timestamp: Date
  message?: string
  error?: string
}

// File upload types
export interface FileDescriptor {
  filename: string
  mimeType: string
  size: number
  data: string // base64 encoded
}

export interface FileUploadRequest extends JSONRPCMessage {
  method: 'file.uploadBulk'
  params: {
    files: FileDescriptor[]
  }
}

export interface FileUploadResponse {
  status: 'accepted'
  sessionId: string
  fileCount: number
}

// File processing events
export interface FileProcessingEvent {
  method: 'file.processing'
  params: {
    fileId: string
    filename: string
    sessionId: string
  }
}

export interface ChunkProgressEvent {
  method: 'chunk.progress'
  params: {
    fileId: string
    filename: string
    chunkIndex: number
    chunkCount: number
    progress: number
  }
}

export interface FileCompletedEvent {
  method: 'file.completed'
  params: {
    fileId: string
    filename: string
    sessionId: string
    result?: any
  }
}

export interface FileFailedEvent {
  method: 'file.failed'
  params: {
    fileId: string
    filename: string
    sessionId: string
    error: string
  }
}

export interface SessionCompletedEvent {
  method: 'session.completed'
  params: {
    sessionId: string
    totalCount: number
    completedCount: number
    failedCount: number
    durationMs: number
  }
}

// Email task types
export interface EmailTaskRequest extends JSONRPCMessage {
  method: 'email.send'
  params: {
    recipients: string[]
    subject: string
    body: string
  }
}

export interface EmailTaskResponse {
  status: 'queued'
  jobId: string
}

export interface EmailResultEvent {
  method: 'job.result'
  params: {
    result: {
      results: EmailRecipientResult[]
    }
  }
}

export interface EmailRecipientResult {
  email: string
  status: 'sent' | 'failed'
  error?: string
}

// Task progress events
export interface JobProgressEvent {
  method: 'job.progress'
  params: {
    progress: number
    jobId?: string
  }
}

export interface JobFailedEvent {
  method: 'job.failed'
  params: {
    error: string
    jobId?: string
  }
}

// Dashboard-specific message types
export interface DashboardMetricsRequest extends JSONRPCMessage {
  method: 'dashboard.getMetrics'
}

export interface DashboardSubscribeRequest extends JSONRPCMessage {
  method: 'dashboard.subscribe'
  params: {
    events: string[]
  }
}

export interface DashboardUnsubscribeRequest extends JSONRPCMessage {
  method: 'dashboard.unsubscribe'
  params: {
    events: string[]
  }
}

// System metrics and status
export interface SystemMetrics {
  totalTasks: number
  processing: number
  success: number
  failed: number
  queueSize: number
  activeWorkers: number
  startTime: Date
}

export interface MetricsUpdatedEvent {
  method: 'metrics.updated'
  params: SystemMetrics
}

export interface TaskStatusChangedEvent {
  method: 'task.statusChanged'
  params: TaskProgress
}

export interface WorkerActivityEvent {
  method: 'worker.activity'
  params: WorkerActivity
}

export interface SystemAlertEvent {
  method: 'system.alert'
  params: SystemAlert
}

export interface TaskProgress {
  taskId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  result?: any
  error?: string
}

export interface WorkerActivity {
  workerId: string
  status: 'active' | 'idle' | 'error'
  currentTask?: string
  lastActivity: Date
}

export interface SystemAlert {
  level: 'info' | 'warning' | 'error'
  message: string
  timestamp: Date
  category: string
}

// Union type for all possible WebSocket events
export type WebSocketEvent = 
  | FileProcessingEvent
  | ChunkProgressEvent
  | FileCompletedEvent
  | FileFailedEvent
  | SessionCompletedEvent
  | EmailResultEvent
  | JobProgressEvent
  | JobFailedEvent
  | MetricsUpdatedEvent
  | TaskStatusChangedEvent
  | WorkerActivityEvent
  | SystemAlertEvent