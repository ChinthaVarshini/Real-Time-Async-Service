/**
 * Simple Gateway Server for Dashboard Testing
 * Works without Redis - just serves dashboard and handles basic WebSocket
 */

import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "secret";

function verifyToken(token: string): { valid: boolean; userId?: string; error?: string } {
  try {
    const payload = jwt.verify(token, JWT_SECRET as string) as jwt.JwtPayload;
    return { valid: true, userId: String(payload.sub) };
  } catch (err: any) {
    if (err.name === "TokenExpiredError") return { valid: false, error: "Token expired" };
    return { valid: false, error: "Unauthorized" };
  }
}

// Dashboard file serving function
async function serveDashboardFile(filename: string): Promise<Response> {
  try {
    const file = Bun.file(filename);
    const exists = await file.exists();
    
    if (!exists) {
      console.log(`File not found: ${filename}`);
      return new Response("File not found", { status: 404 });
    }

    let contentType = "text/html";
    if (filename.endsWith(".js")) contentType = "application/javascript";
    else if (filename.endsWith(".css")) contentType = "text/css";
    else if (filename.endsWith(".json")) contentType = "application/json";
    
    return new Response(file, {
      headers: { "Content-Type": contentType }
    });
  } catch (error) {
    console.error("Error serving dashboard file:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

// Simple WebSocket connections tracking
const connectedClients = new Map<any, { userId: string; isAlive: boolean }>();

console.log("🚀 Starting Simple Gateway Server...");

Bun.serve({
  port: 4000,
  async fetch(req: Request, server: any) {
    const url = new URL(req.url);
    console.log(`📥 Request: ${req.method} ${url.pathname}`);

    // Upgrade WebSocket connections
    if (url.pathname === "/ws") {
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response("Unauthorized", { status: 401 });
      }
      const result = verifyToken(token);
      if (!result.valid) {
        console.log(`❌ Connection rejected: ${result.error}`);
        return new Response(result.error!, { status: 401 });
      }
      const upgraded = server.upgrade(req, { data: { userId: result.userId } });
      if (upgraded) return undefined as any;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // Serve Dashboard Files
    if (url.pathname === "/" || url.pathname === "/dashboard") {
      return await serveDashboardFile("simple.html");
    }
    if (url.pathname === "/simple.html") {
      return await serveDashboardFile("simple.html");
    }
    if (url.pathname === "/example.html") {
      return await serveDashboardFile("example.html");
    }
    if (url.pathname.startsWith("/dist/")) {
      return await serveDashboardFile(url.pathname.slice(1));
    }

    // API endpoints (mock responses for testing)
    if (url.pathname === "/api/status") {
      return new Response(JSON.stringify({ 
        status: "ok", 
        services: { gateway: "running", redis: "mock", worker: "mock" }
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Default to dashboard
    return await serveDashboardFile("simple.html");
  },
  
  websocket: {
    open(ws: any) {
      const userId = ws.data?.userId ?? "unknown";
      connectedClients.set(ws, { userId, isAlive: true });
      console.log(`✅ Client connected: ${userId}`);
      
      // Send welcome message
      ws.send(JSON.stringify({
        jsonrpc: "2.0",
        method: "connection.welcome",
        params: { 
          message: "Connected to Simple Gateway",
          userId: userId,
          timestamp: new Date().toISOString()
        }
      }));
    },
    
    async message(ws: any, message: any) {
      const raw = String(message);
      console.log(`📨 WebSocket message: ${raw}`);

      // Handle pong frames
      if (raw === "__pong__") {
        const client = connectedClients.get(ws);
        if (client) {
          client.isAlive = true;
          console.log(`🏓 Pong from: ${client.userId}`);
        }
        return;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        ws.send(JSON.stringify({ 
          jsonrpc: "2.0", 
          error: { code: -32700, message: "Parse error" }, 
          id: null 
        }));
        return;
      }

      const method = parsed?.method;
      console.log(`🔧 Method: ${method}`);

      // Mock responses for testing
      if (method === "file.uploadBulk") {
        // Simulate file upload
        ws.send(JSON.stringify({
          jsonrpc: "2.0",
          result: { status: "accepted", sessionId: "mock-session-" + Date.now() },
          id: parsed.id
        }));
        
        // Simulate progress updates
        setTimeout(() => {
          ws.send(JSON.stringify({
            jsonrpc: "2.0",
            method: "file.processing",
            params: { fileId: "mock-file-1", filename: "test.txt", sessionId: "mock-session" }
          }));
        }, 1000);
        
        return;
      }

      if (method === "email.send") {
        // Simulate email task
        ws.send(JSON.stringify({
          jsonrpc: "2.0",
          result: { status: "queued", jobId: "mock-job-" + Date.now() },
          id: parsed.id
        }));
        
        // Simulate email processing
        setTimeout(() => {
          ws.send(JSON.stringify({
            jsonrpc: "2.0",
            method: "job.progress",
            params: { progress: 50, jobId: "mock-job" }
          }));
        }, 1000);
        
        setTimeout(() => {
          ws.send(JSON.stringify({
            jsonrpc: "2.0",
            method: "job.result",
            params: { 
              result: { 
                results: [
                  { email: "test@example.com", status: "sent" }
                ]
              }
            }
          }));
        }, 2000);
        
        return;
      }

      // Default response
      ws.send(JSON.stringify({
        jsonrpc: "2.0",
        result: { status: "received", method: method },
        id: parsed.id
      }));
    },
    
    close(ws: any) {
      const client = connectedClients.get(ws);
      if (client) {
        console.log(`❌ Client disconnected: ${client.userId}`);
        connectedClients.delete(ws);
      }
    }
  }
});

console.log("✅ Simple Gateway Server started on http://localhost:4000");
console.log("📊 Dashboard available at: http://localhost:4000/");
console.log("🔌 WebSocket endpoint: ws://localhost:4000/ws");