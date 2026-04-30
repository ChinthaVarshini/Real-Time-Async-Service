/**
 * WebSocket Manager Tests
 * Unit tests for WebSocket connection management
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { WebSocketManager } from '../WebSocketManager'
import type { WebSocketManagerConfig } from '../WebSocketManager'

// Mock WebSocket for testing
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null

  constructor(public url: string) {
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.(new Event('open'))
    }, 10)
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.(new CloseEvent('close', { code: code || 1000, reason }))
  }
}

// Replace global WebSocket with mock
const originalWebSocket = globalThis.WebSocket
beforeEach(() => {
  globalThis.WebSocket = MockWebSocket as any
})

afterEach(() => {
  globalThis.WebSocket = originalWebSocket
})

describe('WebSocketManager', () => {
  let config: WebSocketManagerConfig
  let manager: WebSocketManager

  beforeEach(() => {
    config = {
      url: 'ws://localhost:4000/ws',
      reconnectInterval: 1000,
      maxReconnectAttempts: 3,
      heartbeatInterval: 5000
    }
    manager = new WebSocketManager(config)
  })

  afterEach(() => {
    manager.destroy()
  })

  describe('Connection Management', () => {
    it('should initialize with disconnected status', () => {
      const status = manager.getConnectionStatus()
      expect(status.connected).toBe(false)
      expect(status.serverUrl).toBe(config.url)
      expect(status.reconnectAttempts).toBe(0)
    })

    it('should connect successfully with valid token', async () => {
      const token = 'valid-jwt-token'
      
      await manager.connect(token)
      
      const status = manager.getConnectionStatus()
      expect(status.connected).toBe(true)
      expect(status.token).toBe(token)
    })

    it('should fail to connect without token', async () => {
      await expect(manager.connect('')).rejects.toThrow('No authentication token provided')
    })

    it('should disconnect cleanly', async () => {
      await manager.connect('test-token')
      
      manager.disconnect()
      
      const status = manager.getConnectionStatus()
      expect(status.connected).toBe(false)
    })
  })

  describe('Message Handling', () => {
    it('should register and call message handlers', async () => {
      const handler = mock(() => {})
      const unsubscribe = manager.onMessage(handler)
      
      await manager.connect('test-token')
      
      // Simulate incoming message
      const mockWs = (manager as any).ws
      const testMessage = { method: 'test.message', params: { data: 'test' } }
      mockWs.onmessage(new MessageEvent('message', { 
        data: JSON.stringify(testMessage) 
      }))
      
      expect(handler).toHaveBeenCalledWith(testMessage)
      
      unsubscribe()
    })

    it('should handle ping/pong heartbeat', async () => {
      await manager.connect('test-token')
      
      const mockWs = (manager as any).ws
      const originalSend = mockWs.send
      let sendCalled = false
      let sendData = ''
      
      mockWs.send = (data: string) => {
        sendCalled = true
        sendData = data
        return originalSend.call(mockWs, data)
      }
      
      // Simulate ping from server
      mockWs.onmessage(new MessageEvent('message', { data: '__ping__' }))
      
      expect(sendCalled).toBe(true)
      expect(sendData).toBe('__pong__')
    })

    it('should queue messages when disconnected', () => {
      const message = {
        jsonrpc: '2.0' as const,
        method: 'test.method',
        id: 1
      }
      
      // Send message while disconnected
      manager.send(message)
      
      // Message should be queued
      expect((manager as any).messageQueue).toHaveLength(1)
    })
  })

  describe('Connection Events', () => {
    it('should emit connection events', async () => {
      const handler = mock(() => {})
      manager.onConnection(handler)
      
      await manager.connect('test-token')
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'connected',
          message: 'Connected successfully'
        })
      )
    })

    it('should emit disconnection events', async () => {
      const handler = mock(() => {})
      manager.onConnection(handler)
      
      await manager.connect('test-token')
      manager.disconnect()
      
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'disconnected',
          message: 'Disconnected by user'
        })
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid JSON messages gracefully', async () => {
      const handler = mock(() => {})
      manager.onMessage(handler)
      
      await manager.connect('test-token')
      
      const mockWs = (manager as any).ws
      mockWs.onmessage(new MessageEvent('message', { data: 'invalid-json' }))
      
      // Should not crash, handler should not be called
      expect(handler).not.toHaveBeenCalled()
    })

    it('should handle message handler errors gracefully', async () => {
      const errorHandler = mock(() => {
        throw new Error('Handler error')
      })
      manager.onMessage(errorHandler)
      
      await manager.connect('test-token')
      
      const mockWs = (manager as any).ws
      mockWs.onmessage(new MessageEvent('message', { 
        data: JSON.stringify({ method: 'test' }) 
      }))
      
      // Should not crash the manager
      expect(errorHandler).toHaveBeenCalled()
    })
  })
})