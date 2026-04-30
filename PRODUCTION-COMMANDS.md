# 🚀 Production Commands - Real-Time Async Backend

## Complete Setup Commands

Run these commands in **5 separate terminals** in the project root directory:

### Terminal 1: Redis Database
```bash
docker compose up -d redis
```

### Terminal 2: Gateway Service (Port 4003)
```bash
bun run --cwd apps/gateway start
```

### Terminal 3: Worker Service
```bash
bun run --cwd apps/worker start
```

### Terminal 4: Frontend Dashboard (Port 3001)
```bash
cd apps/dashboard && bun run dev --port 3001
```

### Terminal 5: Email System Client Demo
```bash
bun run start-client.ts
```

---

## 🔑 Token Generation

### Production Token (Admin with 7-day expiry)
```bash
cd apps/gateway
bun run generateProductionToken.ts [userId] [userName] [expiry]
```

### Regular Token (24-hour expiry)
```bash
cd apps/gateway
bun run generateToken.ts [userId] [userName] [expiry]
```

---

## 🌐 Access URLs

- **Gateway API**: http://localhost:4003
- **Dashboard**: http://localhost:4003/ (built-in)
- **Frontend Dev**: http://localhost:3001 (if running Terminal 4)
- **WebSocket**: ws://localhost:4003/ws

---

## 📧 Email Configuration

Make sure your `.env` file has:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM=your-email@gmail.com
```

---

## ✅ Verification

1. **Redis**: Check `docker ps` shows redis container running
2. **Gateway**: Visit http://localhost:4003 - should show dashboard
3. **Worker**: Check terminal shows worker connected to Redis
4. **Frontend**: Visit http://localhost:3001 (if running)
5. **Client**: Check terminal shows demo client connecting

---

## 🛑 Stop Services

```bash
# Stop Redis
docker compose down

# Stop other services: Ctrl+C in each terminal
```

---

## 🔧 Troubleshooting

- **Port conflicts**: Make sure ports 4003, 3001, 6379 are available
- **Redis connection**: Ensure Docker is running
- **Email issues**: Verify Gmail App Password is correct
- **Token errors**: Check JWT_SECRET in .env file