# 🚀 Async Backend - Clean Startup Guide

## Step 1: Clean Up (Remove All Old Processes)

```powershell
# Kill all Bun processes
Get-Process bun -ErrorAction SilentlyContinue | Stop-Process -Force

# Kill all Redis processes
Get-Process redis-server -ErrorAction SilentlyContinue | Stop-Process -Force

# Wait for processes to terminate
Start-Sleep -Seconds 2
```

## Step 2: Start Fresh (Open 3 New Terminal Windows)

### Terminal 1 - Redis Server
```powershell
cd C:\Users\chint\OneDrive\Documents\async backend project\async backend project
redis-server
```

**Expected Output:**
```
* Ready to accept connections
```

### Terminal 2 - Gateway (HTTP + WebSocket on port 4001)
```powershell
cd C:\Users\chint\OneDrive\Documents\async backend project\async backend project
bun run apps/gateway/index.ts
```

**Expected Output:**
```
📄 Serving file: apps/gateway/dashboard.html
Server ready at http://localhost:4001
```

### Terminal 3 - Worker (Async Task Processor)
```powershell
cd C:\Users\chint\OneDrive\Documents\async backend project\async backend project
bun run apps/worker/index.ts
```

**Expected Output:**
```
✓ Worker listening on queue
```

### Terminal 4 (Optional) - Generate Token
```powershell
cd C:\Users\chint\OneDrive\Documents\async backend project\async backend project
bun run apps/gateway/generateToken.ts "user-type"
```

**Expected Output:**
```
🔑 JWT Token for Demo:
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Step 3: Access Dashboard

Once all 3 services are running:

1. Open browser: **http://localhost:4001/dashboard.html**
2. Paste your JWT token from Terminal 4
3. Click **"⚡ Connect"**
4. Start uploading files or queuing emails!

---

## 🆘 Troubleshooting

### Port 4001 Still in Use?
```powershell
# Find what's using port 4001
netstat -ano | findstr :4001

# Force kill the process (replace XXXX with PID)
taskkill /PID XXXX /F
```

### Redis Connection Failed?
- Make sure Redis server is running in Terminal 1
- Check Redis status: `redis-cli ping` (should return "PONG")

### Gateway/Worker Won't Start?
- Kill all Bun processes: `Get-Process bun | Stop-Process -Force`
- Wait 2 seconds
- Start fresh

### WebSocket Connection Fails?
- Check Dashboard console (F12)
- Verify JWT token is valid
- Ensure Gateway is running and serving port 4001

---

## ✅ Success Checklist

- [ ] Redis server running (Terminal 1)
- [ ] Gateway running on port 4001 (Terminal 2)
- [ ] Worker listening (Terminal 3)
- [ ] Dashboard loads at http://localhost:4001
- [ ] WebSocket connects with valid token
- [ ] File upload works
- [ ] Email task queuing works

---

**All errors should now be eliminated!** 🎉
