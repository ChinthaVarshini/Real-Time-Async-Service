/**
 * Dashboard Core Types
 * Defines interfaces for dashboard components and state management
 */

// Task and session models
export interface TaskSession {
  sessionId: string
  userId: string
  startTime: Date
  totalFiles: number
  completedFiles: number
  failedFiles: number
  status: 'active' | 'completed' | 'failed'
}

export interface FileTask {
  fileId: string
  sessionId: string
  filename: string
  mimeType: string
  size: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  chunkCount: number
  processedChunks: number
  startTime?: Date
  endTime?: Date
  error?: string
}

export interface EmailTask {
  taskId: string
  subject: string
  body: string
  recipients: EmailRecipient[]
  status: 'queued' | 'processing' | 'completed' | 'failed'
  queuedAt: Date
  processedAt?: Date
  totalSent: number
  totalFailed: number
}

export interface EmailRecipient {
  email: string
  status: 'pending' | 'sent' | 'failed'
  error?: string
  sentAt?: Date
}

// UI state models
export interface DashboardState {
  connection: ConnectionState
  files: FileUploadState
  email: EmailTaskState
  metrics: MetricsState
  logs: LogsState
  theme: ThemeState
}

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  serverUrl: string
  token: string
  lastConnected?: Date
  reconnectAttempts: number
}

export interface FileUploadState {
  selectedFiles: File[]
  uploadProgress: Map<string, number>
  processingFiles: Map<string, FileTask>
  supportedFormats: string[]
  maxFiles: number
}

export interface EmailTaskState {
  recipients: string[]
  subject: string
  body: string
  fromAddress: string
  activeTask?: EmailTask
  taskHistory: EmailTask[]
}

export interface MetricsState {
  current: SystemMetrics
  history: MetricsSnapshot[]
  overallProgress: number
  lastUpdated: Date
}

export interface LogsState {
  entries: LogEntry[]
  maxEntries: number
  filters: LogFilter[]
  autoScroll: boolean
}

export interface ThemeState {
  mode: 'dark' | 'light'
  accentColor: string
  fontSize: 'small' | 'medium' | 'large'
}

// Metrics and progress tracking
export interface SystemMetrics {
  totalTasks: number
  processing: number
  success: number
  failed: number
  queueSize: number
  activeWorkers: number
  startTime: Date
}

export interface MetricsSnapshot {
  timestamp: Date
  metrics: SystemMetrics
}

export interface ProgressSummary {
  totalTasks: number
  completedTasks: number
  failedTasks: number
  overallProgress: number
  estimatedTimeRemaining?: number
}

// Logging system
export interface LogEntry {
  id: string
  timestamp: Date
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
  category: 'connection' | 'task' | 'worker' | 'email' | 'system'
  data?: any
}

export interface LogFilter {
  level?: LogLevel[]
  category?: LogCategory[]
  timeRange?: {
    start: Date
    end: Date
  }
  searchText?: string
}

export type LogLevel = 'info' | 'success' | 'warning' | 'error'
export type LogCategory = 'connection' | 'task' | 'worker' | 'email' | 'system'

// Component interfaces
export interface ComponentState {
  mounted: boolean
  visible: boolean
  loading: boolean
  error?: string
}

export interface UIComponent {
  element: HTMLElement
  state: ComponentState
  render(): void
  destroy(): void
  show(): void
  hide(): void
}

// Event system
export interface DashboardEvent {
  type: string
  timestamp: Date
  data?: any
  source: string
}

export interface EventHandler<T = any> {
  (event: DashboardEvent & { data: T }): void
}

// File upload specific types
export interface FileValidationResult {
  valid: boolean
  error?: string
  warnings?: string[]
}

export interface FilePreview {
  file: File
  preview?: string // data URL for images
  icon: string
  validationResult: FileValidationResult
}

// Email validation types
export interface EmailValidationResult {
  valid: boolean
  email: string
  error?: string
}

export interface EmailComposition {
  recipients: string[]
  subject: string
  body: string
  attachments?: File[]
}

// Progress tracking types
export interface TaskProgressInfo {
  taskId: string
  name: string
  type: 'file' | 'email' | 'system'
  status: TaskStatus
  progress: number
  startTime: Date
  endTime?: Date
  duration?: number
  result?: any
  error?: string
}

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

// Real-time update types
export interface RealTimeUpdate {
  type: 'metrics' | 'task' | 'log' | 'connection'
  timestamp: Date
  data: any
}

export interface UpdateHandler {
  (update: RealTimeUpdate): void
}

// Configuration types
export interface DashboardConfig {
  websocket: {
    url: string
    reconnectInterval: number
    maxReconnectAttempts: number
    heartbeatInterval: number
  }
  fileUpload: {
    maxFileSize: number
    maxFiles: number
    supportedFormats: string[]
    chunkSize: number
  }
  email: {
    maxRecipients: number
    maxSubjectLength: number
    maxBodyLength: number
  }
  ui: {
    theme: ThemeState
    animations: boolean
    autoRefresh: boolean
    refreshInterval: number
  }
  logging: {
    maxEntries: number
    levels: LogLevel[]
    categories: LogCategory[]
  }
}