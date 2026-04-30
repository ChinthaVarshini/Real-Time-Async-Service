# Real-Time Async Service

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-000000?style=flat&logo=bun&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)
![BullMQ](https://img.shields.io/badge/BullMQ-FF6B6B?style=flat&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-010101?style=flat&logoColor=white)

A **production-ready, real-time asynchronous task processing system** built with TypeScript, Bun, BullMQ, and WebSockets. Features a beautiful dashboard UI for monitoring tasks in real-time.

---

## 🚀 Features

| Feature | Description |
|---|---|
| 🔌 Real-Time WebSocket Gateway | Live task updates with JWT authentication |
| 📋 Distributed Task Queue | Process background jobs with BullMQ and Redis |
| 📧 Email Service | Send batch emails with SMTP integration (Gmail) |
| 📁 File Upload Handler | Upload and process multiple file types |
| 📊 Progress Tracking | Real-time progress updates for long-running tasks |
| 🌐 REST API | Comprehensive REST endpoints for task management |
| 🖥️ Dashboard UI | Beautiful web interface for monitoring tasks |
| ⚡ Scalable Architecture | Multi-worker support for high throughput |

---

## 🏗️ Architecture

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

---

## 📋 Prerequisites

- Node.js (v18+) or **Bun runtime**
- Docker & Docker Compose (for Redis)
- Git
- Gmail account with app-specific password

---

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

---

## ⚙️ Configuration

### Root `.env` file
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

### `apps/gateway/.env`
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

> ⚠️ Never commit your `.env` files to GitHub. Add them to `.gitignore`.

---

## 🎯 Quick Start

### Terminal 1 — Start Redis
```bash
docker compose up -d redis
```

### Terminal 2 — Start Gateway
```bash
bun run --cwd apps/gateway start
```

### Terminal 3 — Start Worker
```bash
bun run --cwd apps/worker start
```

### Terminal 4 — Generate JWT Token
```bash
bun run apps/gateway/generateToken.ts "demo-user"
```

---

## 🌐 Access Points

| Service | URL |
|---|---|
| Gateway API | http://localhost:4004 |
| WebSocket | ws://localhost:4004/ws |
| Dashboard | http://localhost:3001 |

---

## 📡 API Endpoints

### Authentication
```
POST /auth/login        → Generate JWT token
```

### Tasks
```
POST /tasks             → Create new task
GET  /tasks             → List all tasks
GET  /tasks/:id         → Get task details
GET  /tasks/:id/progress → Get task progress
```

### Email
```
POST /email/send        → Send email task
GET  /email/status/:id  → Check email status
```

### Files
```
POST /files/upload      → Upload files
GET  /files/:id         → Download processed file
```

---

## 🔐 Security

- ✅ JWT-based authentication
- ✅ Environment variable protection
- ✅ CORS enabled
- ✅ Input validation on all endpoints
- ✅ App-specific password for SMTP (never use real Gmail password)

---

## 🚀 Docker Deployment

```bash
docker compose -f docker-compose.yml up -d
```

### Production Build
```bash
bun run build
NODE_ENV=production bun run start
```

---

## 📊 Performance

| Metric | Value |
|---|---|
| Concurrency | 5 workers simultaneously |
| Queue Backend | BullMQ with Redis |
| Real-time Updates | WebSocket connections |
| Scalability | Horizontal scaling supported |

---

## 🐛 Troubleshooting

### Port already in use
```bash
netstat -ano | findstr :4004
taskkill /PID <PID> /F
```

### Redis connection issues
```bash
docker compose ps
docker compose logs redis
```

### Email sending fails
- Verify Gmail app-specific password
- Enable 2-factor authentication on Gmail
- Check SMTP credentials in `.env`

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 License

MIT License — See [LICENSE](LICENSE) file for details.

---

## 📞 Support

For support, email **varshinichintha0@gmail.com** or open an issue on [GitHub](https://github.com/ChinthaVarshini/Real-Time-Async-Service/issues).

---

## 🔗 Links

- 📁 Repository: [github.com/ChinthaVarshini/Real-Time-Async-Service](https://github.com/ChinthaVarshini/Real-Time-Async-Service)
- 🐛 Issues: [Report a bug](https://github.com/ChinthaVarshini/Real-Time-Async-Service/issues)

---

Built with ❤️ by **Varshini Chintha**  
[LinkedIn](https://linkedin.com/in/varshini-chintha-108424314) • [GitHub](https://github.com/ChinthaVarshini)
