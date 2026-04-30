# Real-Time Async Service

A production-ready, real-time asynchronous task processing system built with TypeScript, Bun, BullMQ, and WebSockets.

## 🚀 Features

- **Real-Time WebSocket Gateway** - Live task updates with JWT authentication
- **Distributed Task Queue** - Process background jobs with BullMQ and Redis
- **Email Service** - Send batch emails with SMTP integration (Gmail)
- **File Upload Handler** - Upload and process multiple file types
- **Progress Tracking** - Real-time progress updates for long-running tasks
- **REST API** - Comprehensive REST endpoints for task management
- **Dashboard UI** - Beautiful web interface for monitoring tasks
- **Scalable Architecture** - Multi-worker support for high throughput

## 📋 Prerequisites

- **Node.js** (v18+) or **Bun** runtime
- **Docker & Docker Compose** (for Redis)
- **Git**
- Gmail account with app-specific password

## 🛠️ Installation

### 1. Clone the repository
```bash
git clone https://github.com/ChinthaVarshini/Real-Time-Async-Service.git
cd Real-Time-Async-Service
```

### 2. Install dependencies
```bash
bun install
cd apps/gateway && bun install
cd ../worker && bun install
cd ../dashboard && bun install
cd ../../frontend && bun install
```

## ⚙️ Configuration

### Update `.env` file with your settings:

```env
PORT=3000
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your-secret-key

# SMTP Configuration (Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password
SMTP_FROM=your-email@gmail.com
```

### Update `apps/gateway/.env`:
```env
PORT=4005
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your-secret-key
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password
SMTP_FROM=your-email@gmail.com
```

## 🎯 Quick Start

Navigate to the project directory:
```bash
cd "path/to/Real-Time-Async-Service"
```

### Terminal 1 - Start Redis
```bash
docker compose up -d redis
```

### Terminal 2 - Start Gateway
```bash
bun run --cwd apps/gateway start
```

### Terminal 3 - Start Worker
```bash
bun run --cwd apps/worker start
```

### Terminal 4 - Generate Token (Optional)
```bash
bun run apps/gateway/generateToken.ts "demo-user"
```

## 🌐 Access Points

- **Gateway API**: http://localhost:4004
- **WebSocket**: ws://localhost:4004/ws
- **Dashboard**: http://localhost:3001

## 📦 Project Structure

```
Real-Time-Async-Service/
├── apps/
│   ├── gateway/          # WebSocket gateway & REST API
│   ├── worker/           # Background job processor
│   └── dashboard/        # Web UI dashboard
├── packages/
│   └── shared/          # Shared types & utilities
├── frontend/            # Frontend application
├── docker-compose.yml   # Docker services configuration
├── package.json         # Root dependencies
└── tsconfig.json        # TypeScript configuration
```

## 🔧 Available Commands

### Gateway Service
```bash
bun run --cwd apps/gateway start     # Start gateway server
bun run apps/gateway/generateToken.ts # Generate JWT token
```

### Worker Service
```bash
bun run --cwd apps/worker start      # Start worker process
```

### Dashboard
```bash
bun run --cwd apps/dashboard dev     # Start dashboard dev server
```

## 📡 API Endpoints

### Authentication
- `POST /auth/login` - Generate JWT token

### Tasks
- `POST /tasks` - Create new task
- `GET /tasks` - List all tasks
- `GET /tasks/:id` - Get task details
- `GET /tasks/:id/progress` - Get task progress

### Email
- `POST /email/send` - Send email task
- `GET /email/status/:id` - Check email status

### Files
- `POST /files/upload` - Upload files
- `GET /files/:id` - Download processed file

## 🔐 Security

- JWT-based authentication
- Environment variable protection
- CORS enabled
- Input validation on all endpoints

## 🚀 Deployment

### Docker Deployment
```bash
docker compose -f docker-compose.yml up -d
```

### Production Build
```bash
bun run build
NODE_ENV=production bun run start
```

## 📊 Performance

- **Concurrency**: 5 workers processing jobs simultaneously
- **Queue**: BullMQ with Redis backend
- **Real-time Updates**: WebSocket connections
- **Scalability**: Horizontal scaling with multiple worker instances

## 🐛 Troubleshooting

### Port already in use
```bash
# Find and kill process on port
netstat -ano | findstr :4004
taskkill /PID <PID> /F
```

### Redis connection issues
```bash
# Check Redis status
docker compose ps
docker compose logs redis
```

### Email sending fails
- Verify Gmail app-specific password
- Enable 2-factor authentication on Gmail
- Check SMTP credentials in `.env`

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 Support

For support, email your-email@example.com or open an issue on GitHub.

## 🔗 Links

- **Repository**: https://github.com/ChinthaVarshini/Real-Time-Async-Service
- **Issues**: https://github.com/ChinthaVarshini/Real-Time-Async-Service/issues
- **Documentation**: See [docs/](./docs) folder

---

**Built with ❤️ using TypeScript, Bun, and modern web technologies**
