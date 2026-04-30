# Async Task Dashboard

A modern, dark-themed web interface for monitoring and managing real-time asynchronous task processing. Built with TypeScript and WebSocket connectivity for real-time updates.

## Features

- **Real-time WebSocket Communication**: Live updates for task progress, file processing, and system metrics
- **Multi-format File Upload**: Drag-and-drop support for PDF, images, video, CSV, Excel, ZIP files
- **Email Task Management**: Compose and queue bulk email tasks with recipient validation
- **Live System Monitoring**: Real-time metrics, progress tracking, and event logging
- **Dark Theme UI**: Professional dark theme with neon accents and responsive design
- **TypeScript**: Full type safety and excellent developer experience

## Architecture

The dashboard is built as a modular TypeScript application with the following core components:

- **WebSocketManager**: Handles connection lifecycle, authentication, and message routing
- **FileUploadHandler**: Manages multi-format file uploads with validation and progress tracking
- **EmailTaskManager**: Handles email composition, recipient management, and task queuing
- **Configuration System**: Centralized configuration with environment-specific overrides

## Getting Started

### Prerequisites

- Bun runtime (latest version)
- Access to the gateway service WebSocket endpoint
- Valid JWT authentication token

### Installation

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Build for production
bun run build

# Run tests
bun test
```

### Configuration

The dashboard can be configured through the `DashboardConfig` interface:

```typescript
import { initializeDashboard } from './src'

const dashboard = await initializeDashboard({
  websocket: {
    url: 'ws://localhost:4000/ws',
    reconnectInterval: 3000,
    maxReconnectAttempts: 10
  },
  fileUpload: {
    maxFileSize: 500 * 1024 * 1024, // 500MB
    maxFiles: 500,
    supportedFormats: ['pdf', 'jpg', 'png', 'mp4', 'csv', 'zip']
  },
  email: {
    maxRecipients: 1000,
    maxSubjectLength: 200,
    maxBodyLength: 10000
  }
})
```

## Usage

### Basic Setup

```typescript
import { Dashboard } from './src'

// Create dashboard instance
const dashboard = new Dashboard()

// Initialize and connect
await dashboard.initialize()
await dashboard.connect('your-jwt-token')

// Access core managers
const wsManager = dashboard.getWebSocketManager()
const fileManager = dashboard.getFileUploadManager()
const emailManager = dashboard.getEmailTaskManager()
```

### File Upload

```typescript
const fileManager = dashboard.getFileUploadManager()

// Add files
fileManager.addFiles(selectedFiles)

// Upload files
await fileManager.uploadFiles()

// Monitor progress via WebSocket events
dashboard.getWebSocketManager().onMessage((message) => {
  if (message.method === 'file.progress') {
    console.log('File progress:', message.params)
  }
})
```

### Email Tasks

```typescript
const emailManager = dashboard.getEmailTaskManager()

// Compose email
emailManager.addRecipients(['user1@example.com', 'user2@example.com'])
emailManager.setSubject('Important Update')
emailManager.setBody('Hello, this is an important message.')

// Queue for processing
await emailManager.queueEmailTask()
```

### Real-time Events

The dashboard emits custom events that can be handled by UI components:

```typescript
// Listen for file events
window.addEventListener('dashboard:file-event', (event) => {
  console.log('File event:', event.detail)
})

// Listen for job events
window.addEventListener('dashboard:job-event', (event) => {
  console.log('Job event:', event.detail)
})

// Listen for metrics updates
window.addEventListener('dashboard:metrics-update', (event) => {
  console.log('Metrics:', event.detail.data)
})
```

## WebSocket Protocol

The dashboard communicates with the gateway service using JSON-RPC over WebSocket:

### File Upload
```json
{
  "jsonrpc": "2.0",
  "method": "file.uploadBulk",
  "params": {
    "files": [
      {
        "filename": "document.pdf",
        "mimeType": "application/pdf",
        "size": 1024000,
        "data": "base64-encoded-content"
      }
    ]
  },
  "id": 1234567890
}
```

### Email Task
```json
{
  "jsonrpc": "2.0",
  "method": "email.send",
  "params": {
    "recipients": ["user@example.com"],
    "subject": "Test Email",
    "body": "Hello World"
  },
  "id": 1234567890
}
```

## Development

### Project Structure

```
src/
├── types/           # TypeScript type definitions
│   ├── websocket.ts # WebSocket communication types
│   ├── dashboard.ts # Dashboard core types
│   └── index.ts     # Type exports
├── core/            # Core functionality
│   ├── WebSocketManager.ts    # WebSocket connection management
│   ├── FileUploadHandler.ts   # File upload handling
│   └── EmailTaskManager.ts    # Email task management
├── config/          # Configuration
│   └── dashboard.config.ts    # Dashboard configuration
└── index.ts         # Main entry point
```

### Testing

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run specific test file
bun test src/core/WebSocketManager.test.ts
```

### Building

```bash
# Build for production
bun run build

# The built files will be in the dist/ directory
```

## Integration

This dashboard is designed to work with the existing gateway service that provides:

- WebSocket endpoint at `/ws` with JWT authentication
- File upload processing via `file.uploadBulk` method
- Email task queuing via `email.send` method
- Real-time progress updates and event notifications

## Requirements Mapping

This implementation addresses the following requirements:

- **Requirement 1**: WebSocket connection management with status indicators
- **Requirement 2**: Multi-format file upload with drag-and-drop support
- **Requirement 3**: Email task management with recipient validation
- **Requirement 4**: Real-time task status dashboard with metrics
- **Requirement 5**: Live event logging with color-coded messages
- **Requirement 6**: Dark theme visual design (UI components to be implemented)
- **Requirement 7**: Real-time system observability
- **Requirement 8**: File processing progress tracking
- **Requirement 9**: Email task result tracking

## License

This project is part of the async task processing system and follows the same licensing terms.