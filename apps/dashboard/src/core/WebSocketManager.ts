/**
 * WebSocket Manager
 * Handles WebSocket connection lifecycle, authentication, and message routing
 */

import type {
  JSONRPCMessage,
  JSONRPCResponse,
  ConnectionStatus,
  WebSocketEvent,
  ConnectionEvent
} from '../types'

export interface WebSocketManagerConfig {
  url: string
  reconnectInterval: number
  maxReconnectAttempts: number
  heartbeatInterval: number
}

export interface MessageHandler {
  (message: WebSocketEvent): void
}

export interface ConnectionHandler {
  (event: ConnectionEvent): void
}

export class WebSocketManager {
  private ws: WebSocket | null = null
  private config: WebSocketManagerConfig
  private status: ConnectionStatus
  private messageHandlers: Set<MessageHandler> = new Set()
  private connectionHandlers: Set<ConnectionHandler> = new Set()
  private reconnectTimer: NodeJS.Timeout | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private messageQueue: JSONRPCMessage[] = []

  constructor(config: WebSocketManagerConfig) {
    this.config = config
    this.status = {
      connected: false,
      serverUrl: config.url,
      lastPing: null,
      reconnectAttempts: 0
    }
  }

  /**
   * Establish WebSocket connection with authentication token
   */
  async connect(token: string): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    this.status.token = token
    this.status.reconnectAttempts = 0
    
    return this.doConnect()
  }

  /**
   * Disconnect WebSocket and cleanup
   */
  disconnect(): void {
    this.clearTimers()
    
    if (this.ws) {
      this.ws.close(1000, 'user disconnect')
      this.ws = null
    }

    this.updateStatus({
      connected: false,
      reconnectAttempts: 0
    })

    this.emitConnectionEvent({
      type: 'disconnected',
      timestamp: new Date(),
      message: 'Disconnected by user'
    })
  }

  /**
   * Send message via WebSocket
   */
  send(message: JSONRPCMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      // Queue message for when connection is restored
      this.messageQueue.push(message)
    }
  }

  /**
   * Register message handler
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  /**
   * Register connection event handler
   */
  onConnection(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler)
    return () => this.connectionHandlers.delete(handler)
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return { ...this.status }
  }

  /**
   * Internal connection establishment
   */
  private async doConnect(): Promise<void> {
    if (!this.status.token) {
      throw new Error('No authentication token provided')
    }

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `${this.config.url}?token=${encodeURIComponent(this.status.token!)}`
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          this.updateStatus({
            connected: true,
            reconnectAttempts: 0
          })

          this.emitConnectionEvent({
            type: 'connected',
            timestamp: new Date(),
            message: 'Connected successfully'
          })

          this.startHeartbeat()
          this.flushMessageQueue()
          resolve()
        }

        this.ws.onclose = (event) => {
          this.updateStatus({ connected: false })
          this.clearTimers()

          const isTokenExpired = event.code === 4001
          const message = isTokenExpired ? 'Token expired' : `Connection closed (code: ${event.code})`

          this.emitConnectionEvent({
            type: isTokenExpired ? 'error' : 'disconnected',
            timestamp: new Date(),
            message,
            error: isTokenExpired ? 'Token expired' : undefined
          })

          // Auto-reconnect unless it's a token expiry or user disconnect
          if (event.code !== 4001 && event.code !== 1000) {
            this.scheduleReconnect()
          }
        }

        this.ws.onerror = () => {
          this.emitConnectionEvent({
            type: 'error',
            timestamp: new Date(),
            message: 'WebSocket connection error',
            error: 'Connection failed'
          })
          reject(new Error('WebSocket connection failed'))
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    // Handle ping/pong heartbeat
    if (data === '__ping__') {
      this.ws?.send('__pong__')
      this.updateStatus({ lastPing: new Date() })
      return
    }

    try {
      const message = JSON.parse(data) as JSONRPCResponse | WebSocketEvent
      
      // Emit to all registered handlers
      this.messageHandlers.forEach(handler => {
        try {
          handler(message as WebSocketEvent)
        } catch (error) {
          console.error('Error in message handler:', error)
        }
      })
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error)
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.status.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.emitConnectionEvent({
        type: 'error',
        timestamp: new Date(),
        message: 'Max reconnection attempts reached',
        error: 'Connection failed permanently'
      })
      return
    }

    this.status.reconnectAttempts++
    
    this.emitConnectionEvent({
      type: 'reconnecting',
      timestamp: new Date(),
      message: `Reconnecting... (attempt ${this.status.reconnectAttempts}/${this.config.maxReconnectAttempts})`
    })

    this.reconnectTimer = setTimeout(() => {
      this.doConnect().catch(() => {
        // Reconnection failed, will be handled by onclose
      })
    }, this.config.reconnectInterval)
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Heartbeat is handled by server sending __ping__
        // We just respond with __pong__ in handleMessage
      }
    }, this.config.heartbeatInterval)
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /**
   * Flush queued messages
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!
      this.send(message)
    }
  }

  /**
   * Update connection status
   */
  private updateStatus(updates: Partial<ConnectionStatus>): void {
    this.status = { ...this.status, ...updates }
  }

  /**
   * Emit connection event to handlers
   */
  private emitConnectionEvent(event: ConnectionEvent): void {
    this.connectionHandlers.forEach(handler => {
      try {
        handler(event)
      } catch (error) {
        console.error('Error in connection handler:', error)
      }
    })
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.disconnect()
    this.messageHandlers.clear()
    this.connectionHandlers.clear()
  }
}