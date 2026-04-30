/**
 * Dashboard Configuration
 * Central configuration for all dashboard components and features
 */

import type { DashboardConfig } from '../types'

export const DEFAULT_CONFIG: DashboardConfig = {
  websocket: {
    url: 'ws://localhost:4000/ws',
    reconnectInterval: 3000, // 3 seconds
    maxReconnectAttempts: 10,
    heartbeatInterval: 30000 // 30 seconds
  },
  
  fileUpload: {
    maxFileSize: 500 * 1024 * 1024, // 500MB
    maxFiles: 500,
    supportedFormats: [
      // Images
      'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp',
      // Videos
      'mp4', 'mov', 'avi', 'mkv', 'webm',
      // Documents
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv',
      // Archives
      'zip', 'rar', '7z', 'tar', 'gz',
      // Code files
      'js', 'ts', 'py', 'java', 'go', 'rs', 'html', 'css',
      // Text files
      'txt', 'md', 'json', 'xml', 'yaml', 'yml',
      // Audio
      'mp3', 'wav', 'ogg', 'flac'
    ],
    chunkSize: 1024 * 1024 // 1MB chunks
  },
  
  email: {
    maxRecipients: 1000,
    maxSubjectLength: 200,
    maxBodyLength: 10000
  },
  
  ui: {
    theme: {
      mode: 'dark',
      accentColor: '#6366f1', // Indigo
      fontSize: 'medium'
    },
    animations: true,
    autoRefresh: true,
    refreshInterval: 5000 // 5 seconds
  },
  
  logging: {
    maxEntries: 1000,
    levels: ['info', 'success', 'warning', 'error'],
    categories: ['connection', 'task', 'worker', 'email', 'system']
  }
}

/**
 * Environment-specific configuration overrides
 */
export function getConfig(): DashboardConfig {
  const config = { ...DEFAULT_CONFIG }
  
  // Override with environment variables if available
  if (typeof window !== 'undefined') {
    // Browser environment - could read from localStorage or URL params
    const savedTheme = localStorage.getItem('dashboard-theme')
    if (savedTheme) {
      try {
        config.ui.theme = { ...config.ui.theme, ...JSON.parse(savedTheme) }
      } catch {
        // Ignore invalid saved theme
      }
    }
  }
  
  // Development overrides
  if (process.env.NODE_ENV === 'development') {
    config.websocket.reconnectInterval = 1000 // Faster reconnect in dev
    config.logging.maxEntries = 5000 // More logs in dev
  }
  
  return config
}

/**
 * Validate configuration object
 */
export function validateConfig(config: Partial<DashboardConfig>): string[] {
  const errors: string[] = []
  
  if (config.websocket) {
    if (config.websocket.reconnectInterval < 1000) {
      errors.push('WebSocket reconnect interval must be at least 1000ms')
    }
    if (config.websocket.maxReconnectAttempts < 1) {
      errors.push('WebSocket max reconnect attempts must be at least 1')
    }
  }
  
  if (config.fileUpload) {
    if (config.fileUpload.maxFileSize < 1024) {
      errors.push('Max file size must be at least 1KB')
    }
    if (config.fileUpload.maxFiles < 1) {
      errors.push('Max files must be at least 1')
    }
  }
  
  if (config.email) {
    if (config.email.maxRecipients < 1) {
      errors.push('Max recipients must be at least 1')
    }
    if (config.email.maxSubjectLength < 10) {
      errors.push('Max subject length must be at least 10 characters')
    }
  }
  
  return errors
}

/**
 * Merge user configuration with defaults
 */
export function mergeConfig(userConfig: Partial<DashboardConfig>): DashboardConfig {
  const errors = validateConfig(userConfig)
  if (errors.length > 0) {
    throw new Error(`Invalid configuration: ${errors.join(', ')}`)
  }
  
  return {
    websocket: { ...DEFAULT_CONFIG.websocket, ...userConfig.websocket },
    fileUpload: { ...DEFAULT_CONFIG.fileUpload, ...userConfig.fileUpload },
    email: { ...DEFAULT_CONFIG.email, ...userConfig.email },
    ui: { 
      ...DEFAULT_CONFIG.ui, 
      ...userConfig.ui,
      theme: { ...DEFAULT_CONFIG.ui.theme, ...userConfig.ui?.theme }
    },
    logging: { ...DEFAULT_CONFIG.logging, ...userConfig.logging }
  }
}