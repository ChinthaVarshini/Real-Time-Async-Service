/**
 * Dashboard Entry Point
 * Main application initialization and setup
 */

import { WebSocketManager } from './core/WebSocketManager'
import { FileUploadManager } from './core/FileUploadHandler'
import { EmailTaskHandler } from './core/EmailTaskManager'
import { getConfig } from './config/dashboard.config'
import type { DashboardConfig } from './types/dashboard'

/**
 * Main Dashboard Application Class
 */
export class Dashboard {
  private config: DashboardConfig
  private wsManager: WebSocketManager
  private fileUploadManager: FileUploadManager
  private emailTaskManager: EmailTaskHandler
  private initialized = false

  constructor(userConfig?: Partial<DashboardConfig>) {
    this.config = userConfig ? 
      { ...getConfig(), ...userConfig } : 
      getConfig()

    // Initialize core managers
    this.wsManager = new WebSocketManager(this.config.websocket)
    this.fileUploadManager = new FileUploadManager(this.config.fileUpload)
    this.emailTaskManager = new EmailTaskHandler({
      ...this.config.email,
      fromAddress: 'system@example.com' // Will be configured by backend
    })

    this.setupHandlers()
  }

  /**
   * Initialize the dashboard application
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    console.log('🚀 Initializing Async Task Dashboard...')
    
    try {
      // Setup WebSocket message routing
      this.setupWebSocketHandlers()
      
      // Setup file upload integration
      this.setupFileUploadIntegration()
      
      // Setup email task integration
      this.setupEmailTaskIntegration()
      
      this.initialized = true
      console.log('✅ Dashboard initialized successfully')
      
    } catch (error) {
      console.error('❌ Failed to initialize dashboard:', error)
      throw error
    }
  }

  /**
   * Connect to WebSocket server
   */
  async connect(token: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
    
    await this.wsManager.connect(token)
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.wsManager.disconnect()
  }

  /**
   * Get WebSocket manager instance
   */
  getWebSocketManager(): WebSocketManager {
    return this.wsManager
  }

  /**
   * Get file upload manager instance
   */
  getFileUploadManager(): FileUploadManager {
    return this.fileUploadManager
  }

  /**
   * Get email task manager instance
   */
  getEmailTaskManager(): EmailTaskHandler {
    return this.emailTaskManager
  }

  /**
   * Get current configuration
   */
  getConfig(): DashboardConfig {
    return { ...this.config }
  }

  /**
   * Setup core event handlers
   */
  private setupHandlers(): void {
    // WebSocket connection events
    this.wsManager.onConnection((event) => {
      console.log(`🔌 Connection ${event.type}:`, event.message)
      
      if (event.type === 'connected') {
        this.onConnected()
      } else if (event.type === 'disconnected') {
        this.onDisconnected()
      } else if (event.type === 'error') {
        this.onConnectionError(event.error || 'Unknown error')
      }
    })
  }

  /**
   * Setup WebSocket message handlers
   */
  private setupWebSocketHandlers(): void {
    this.wsManager.onMessage((message) => {
      console.log('📨 Received message:', message.method || 'response')
      
      // Route messages to appropriate handlers
      switch (message.method) {
        case 'file.processing':
        case 'chunk.progress':
        case 'file.completed':
        case 'file.failed':
        case 'session.completed':
          this.handleFileEvent(message)
          break
          
        case 'job.progress':
        case 'job.result':
        case 'job.failed':
          this.handleJobEvent(message)
          break
          
        case 'metrics.updated':
          this.handleMetricsUpdate(message)
          break
          
        default:
          console.log('📋 Unhandled message:', message)
      }
    })
  }

  /**
   * Setup file upload integration with WebSocket
   */
  private setupFileUploadIntegration(): void {
    this.fileUploadManager.setUploadHandler(async (files) => {
      console.log(`📁 Uploading ${files.length} files...`)
      
      this.wsManager.send({
        jsonrpc: '2.0',
        method: 'file.uploadBulk',
        params: { files },
        id: Date.now()
      })
    })
  }

  /**
   * Setup email task integration with WebSocket
   */
  private setupEmailTaskIntegration(): void {
    this.emailTaskManager.setQueueHandler(async (request) => {
      console.log(`📧 Queuing email to ${request.params.recipients.length} recipients...`)
      
      this.wsManager.send(request)
    })
  }

  /**
   * Handle WebSocket connection established
   */
  private onConnected(): void {
    console.log('🟢 Dashboard connected to server')
    
    // Subscribe to real-time events
    this.wsManager.send({
      jsonrpc: '2.0',
      method: 'dashboard.subscribe',
      params: {
        events: ['metrics', 'tasks', 'files', 'emails']
      },
      id: 'subscribe'
    })
  }

  /**
   * Handle WebSocket disconnection
   */
  private onDisconnected(): void {
    console.log('🔴 Dashboard disconnected from server')
  }

  /**
   * Handle WebSocket connection error
   */
  private onConnectionError(error: string): void {
    console.error('❌ Connection error:', error)
  }

  /**
   * Handle file-related events
   */
  private handleFileEvent(message: any): void {
    console.log(`📁 File event: ${message.method}`, message.params)
    
    // Emit custom events for UI components to handle
    this.emitEvent('file-event', {
      type: message.method,
      data: message.params
    })
  }

  /**
   * Handle job-related events
   */
  private handleJobEvent(message: any): void {
    console.log(`⚙️ Job event: ${message.method}`, message.params)
    
    // Emit custom events for UI components to handle
    this.emitEvent('job-event', {
      type: message.method,
      data: message.params
    })
  }

  /**
   * Handle metrics updates
   */
  private handleMetricsUpdate(message: any): void {
    console.log('📊 Metrics updated:', message.params)
    
    // Emit custom events for UI components to handle
    this.emitEvent('metrics-update', {
      data: message.params
    })
  }

  /**
   * Emit custom dashboard events
   */
  private emitEvent(type: string, detail: any): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`dashboard:${type}`, { detail }))
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.wsManager.destroy()
    this.initialized = false
    console.log('🧹 Dashboard destroyed')
  }
}

// Export singleton instance for easy access
let dashboardInstance: Dashboard | null = null

/**
 * Get or create dashboard instance
 */
export function getDashboard(config?: Partial<DashboardConfig>): Dashboard {
  if (!dashboardInstance) {
    dashboardInstance = new Dashboard(config)
  }
  return dashboardInstance
}

/**
 * Initialize dashboard with configuration
 */
export async function initializeDashboard(config?: Partial<DashboardConfig>): Promise<Dashboard> {
  const dashboard = getDashboard(config)
  await dashboard.initialize()
  return dashboard
}

// Re-export types and core classes
export * from './types'
export * from './core/WebSocketManager'
export * from './core/FileUploadHandler'
export * from './core/EmailTaskManager'
export * from './config/dashboard.config'