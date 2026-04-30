/**
 * Type Exports
 * Central export point for all dashboard types
 */

// WebSocket communication types
export * from './websocket'

// Dashboard core types
export * from './dashboard'

// Re-export commonly used types with aliases for convenience
export type {
  JSONRPCMessage as WSMessage,
  JSONRPCResponse as WSResponse,
  ConnectionStatus as WSConnectionStatus,
  FileDescriptor as WSFileDescriptor,
  SystemMetrics as WSSystemMetrics
} from './websocket'

export type {
  DashboardState as AppState,
  TaskProgressInfo as TaskInfo,
  LogEntry as LogMessage,
  DashboardConfig as AppConfig
} from './dashboard'