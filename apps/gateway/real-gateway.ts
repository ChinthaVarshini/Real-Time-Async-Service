/**
 * Real Gateway Server with File Upload and Email Functionality
 * Uses in-memory queue instead of Redis for simplicity
 */

import { config } from "dotenv";
config();

console.log("SMTP Configuration:");
console.log("   SMTP_HOST: " + process.env.SMTP_HOST);
console.log("   SMTP_PORT: " + process.env.SMTP_PORT);
console.log("   SMTP_USER: " + process.env.SMTP_USER);
console.log("   SMTP_FROM: " + process.env.SMTP_FROM);

import jwt from "jsonwebtoken";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import nodemailer from "nodemailer";

const JWT_SECRET = process.env.JWT_SECRET || "secret";

const connectedClients = new Map<any, { userId: string; isAlive: boolean }>();

class SimpleQueue {
  private jobs: Map<string, any> = new Map();
  private processing = false;

  addJob(type: string, data: any): string {
    const jobId = "job_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
    const job = { id: jobId, type, data, status: "pending", createdAt: new Date(), progress: 0 };
    this.jobs.set(jobId, job);
    console.log("Job queued: " + jobId + " (" + type + ")");
    this.processJobs();
    return jobId;
  }

  async processJobs() {
    if (this.processing) return;
    this.processing = true;
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status === "pending") {
        job.status = "processing";
        console.log("Processing job: " + jobId);
        try {
          await this.processJob(job);
          job.status = "completed";
          job.progress = 100;
          console.log("Job completed: " + jobId);
        } catch (error: any) {
          job.status = "failed";
          job.error = error.message;
          console.log("Job failed: " + jobId + " - " + error.message);
        }
      }
    }
    this.processing = false;
  }

  private async processJob(job: any) {
    if (job.type === "file.uploadBulk") {
      await this.processFileUpload(job);
    } else if (job.type === "email.send") {
      await this.processEmailSend(job);
    }
  }

  private async processFileUpload(job: any) {
    const { files } = job.data.params;
    const uploadDir = join(process.cwd(), "uploads");

    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileData = Buffer.from(file.data, "base64");
      const filePath = join(uploadDir, file.filename);
      const ext = file.filename.split(".").pop()?.toLowerCase() ?? "";

      this.emitProgress(job.id, 10, "Received: " + file.filename);
      await this.delay(400);

      writeFileSync(filePath, fileData);
      this.emitProgress(job.id, 25, "Saved: " + file.filename);
      await this.delay(400);

      if (ext === "pdf" || file.type === "application/pdf") {
        try {
          this.emitProgress(job.id, 40, "Reading PDF...");
          await this.delay(400);
          const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs" as any);
          const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fileData) });
          const pdfDoc = await loadingTask.promise;
          const numPages = pdfDoc.numPages;
          let fullText = "";
          for (let p = 1; p <= numPages; p++) {
            const page = await pdfDoc.getPage(p);
            const content = await page.getTextContent();
            fullText += content.items.map((item: any) => item.str).join(" ") + "\n";
            const pct = 40 + Math.round((p / numPages) * 45);
            this.emitProgress(job.id, pct, "Reading page " + p + "/" + numPages + "...");
          }
          const wordCount = fullText.trim().split(/\s+/).filter(Boolean).length;
          this.emitProgress(job.id, 90, numPages + " pages, " + wordCount + " words extracted");
          await this.delay(300);
          this.emitProgress(job.id, 100, "PDF processed! " + numPages + " pages, " + wordCount + " words");
          this.emitFileCompleted(job.id, file.filename, filePath);
        } catch (err: any) {
          this.emitProgress(job.id, 100, "PDF failed: " + err.message);
          this.emitFileFailed(job.id, file.filename, err.message);
        }
      } else if (ext === "csv" || file.type === "text/csv") {
        try {
          this.emitProgress(job.id, 40, "Reading CSV...");
          await this.delay(400);
          const text = fileData.toString("utf-8");
          const lines = text.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
          const headers = lines[0].split(",").map((h: string) => h.trim().replace(/^"|"$/g, ""));
          const dataRows = lines.slice(1);
          this.emitProgress(job.id, 60, "Analyzing " + headers.length + " columns...");
          await this.delay(400);
          this.emitProgress(job.id, 85, dataRows.length + " rows x " + headers.length + " columns");
          await this.delay(300);
          this.emitProgress(job.id, 100, "CSV done! " + dataRows.length + " rows, " + headers.length + " cols");
          this.emitFileCompleted(job.id, file.filename, filePath);
        } catch (err: any) {
          this.emitProgress(job.id, 100, "CSV failed: " + err.message);
          this.emitFileFailed(job.id, file.filename, err.message);
        }
      } else if (["jpg", "jpeg", "png", "webp", "bmp", "gif"].includes(ext)) {
        try {
          this.emitProgress(job.id, 40, "Reading image metadata...");
          await this.delay(400);
          const sharp = (await import("sharp")).default;
          const originalSize = fileData.length;
          const metadata = await sharp(fileData).metadata();
          this.emitProgress(job.id, 55, metadata.width + "x" + metadata.height + " " + (metadata.format ?? "").toUpperCase() + " detected");
          await this.delay(400);
          this.emitProgress(job.id, 70, "Compressing to WebP quality 80...");
          await this.delay(400);
          const compressedName = "compressed_" + file.filename.replace(/\.[^.]+$/, "") + ".webp";
          const compressedPath = join(uploadDir, compressedName);
          const compressed = await sharp(fileData)
            .resize(metadata.width && metadata.width > 1920 ? 1920 : undefined, undefined, { withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
          writeFileSync(compressedPath, compressed);
          const savedBytes = originalSize - compressed.length;
          const ratio = ((savedBytes / originalSize) * 100).toFixed(1);
          this.emitProgress(job.id, 90, (originalSize / 1024).toFixed(1) + "KB to " + (compressed.length / 1024).toFixed(1) + "KB saved " + ratio + "%");
          await this.delay(300);
          this.emitProgress(job.id, 100, "Image compressed! " + ratio + "% smaller saved as " + compressedName);
          this.emitFileCompleted(job.id, compressedName, compressedPath);
        } catch (err: any) {
          this.emitProgress(job.id, 100, "Image failed: " + err.message);
          this.emitFileFailed(job.id, file.filename, err.message);
        }
      } else {
        this.emitProgress(job.id, 100, "File saved: " + file.filename + " " + (fileData.length / 1024).toFixed(1) + "KB");
        this.emitFileCompleted(job.id, file.filename, filePath);
      }
    }
  }

  private async processEmailSend(job: any) {
    const { recipients, subject, body } = job.data.params;
    console.log("Starting email processing for job " + job.id);

    let transporter;
    try {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
    } catch (error: any) {
      throw new Error("Email setup failed: " + error.message);
    }

    const results = [];
    this.emitProgress(job.id, 5, "Initializing email send to " + recipients.length + " recipients");
    await this.delay(500);
    this.emitProgress(job.id, 10, "Connecting to SMTP server...");
    await this.delay(500);

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const baseProgress = 10;
      const sendingProgress = Math.round((i / recipients.length) * 80);
      const currentProgress = baseProgress + sendingProgress;
      job.progress = currentProgress;
      this.emitProgress(job.id, currentProgress, "Sending email " + (i + 1) + "/" + recipients.length + " to " + recipient);

      try {
        const info = await transporter.sendMail({
          from: process.env.SMTP_FROM || "noreply@example.com",
          to: recipient,
          subject,
          text: body,
          html: "<p>" + body.replace(/\n/g, "<br>") + "</p>"
        });
        results.push({ email: recipient, status: "sent", messageId: info.messageId });
        this.emitEmailSuccess(job.id, recipient, info.messageId);
        const afterProgress = baseProgress + Math.round(((i + 1) / recipients.length) * 80);
        this.emitProgress(job.id, afterProgress, "Email " + (i + 1) + "/" + recipients.length + " delivered to " + recipient);
      } catch (error: any) {
        results.push({ email: recipient, status: "failed", error: error.message });
        this.emitEmailFailure(job.id, recipient, error.message);
        const afterProgress = baseProgress + Math.round(((i + 1) / recipients.length) * 80);
        this.emitProgress(job.id, afterProgress, "Email " + (i + 1) + "/" + recipients.length + " failed to " + recipient);
      }

      if (i < recipients.length - 1) await this.delay(800);
    }

    this.emitProgress(job.id, 95, "Finalizing email batch...");
    await this.delay(500);
    const successCount = results.filter((r: any) => r.status === "sent").length;
    const failureCount = results.filter((r: any) => r.status === "failed").length;
    this.emitProgress(job.id, 100, "Email batch completed: " + successCount + " sent, " + failureCount + " failed");
    this.emitEmailResults(job.id, results);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private emitProgress(jobId: string, progress: number, message: string) {
    connectedClients.forEach((_, ws) => {
      ws.send(JSON.stringify({ jsonrpc: "2.0", method: "job.progress", params: { jobId, progress, message, timestamp: new Date() } }));
    });
  }

  private emitFileCompleted(jobId: string, filename: string, filePath: string) {
    connectedClients.forEach((_, ws) => {
      ws.send(JSON.stringify({ jsonrpc: "2.0", method: "file.completed", params: { jobId, filename, filePath, timestamp: new Date() } }));
    });
  }

  private emitFileFailed(jobId: string, filename: string, error: string) {
    connectedClients.forEach((_, ws) => {
      ws.send(JSON.stringify({ jsonrpc: "2.0", method: "file.failed", params: { jobId, filename, error, timestamp: new Date() } }));
    });
  }

  private emitEmailResults(jobId: string, results: any[]) {
    connectedClients.forEach((_, ws) => {
      ws.send(JSON.stringify({ jsonrpc: "2.0", method: "job.result", params: { jobId, result: { results }, timestamp: new Date() } }));
    });
  }

  private emitEmailSuccess(jobId: string, recipient: string, messageId: string) {
    connectedClients.forEach((_, ws) => {
      ws.send(JSON.stringify({ jsonrpc: "2.0", method: "email.success", params: { jobId, recipient, messageId, timestamp: new Date() } }));
    });
  }

  private emitEmailFailure(jobId: string, recipient: string, error: string) {
    connectedClients.forEach((_, ws) => {
      ws.send(JSON.stringify({ jsonrpc: "2.0", method: "email.failure", params: { jobId, recipient, error, timestamp: new Date() } }));
    });
  }

  getJob(jobId: string) { return this.jobs.get(jobId); }
  getAllJobs() { return Array.from(this.jobs.values()); }
}

const queue = new SimpleQueue();

function verifyToken(token: string): { valid: boolean; userId?: string; error?: string } {
  try {
    const payload = jwt.verify(token, JWT_SECRET as string) as jwt.JwtPayload;
    return { valid: true, userId: String(payload.sub) };
  } catch (err: any) {
    if (err.name === "TokenExpiredError") return { valid: false, error: "Token expired" };
    return { valid: false, error: "Unauthorized" };
  }
}

function getDashboardHTML(): string {
  const html = [
    "<!DOCTYPE html>",
    "<html lang='en'>",
    "<head>",
    "<meta charset='UTF-8'>",
    "<meta name='viewport' content='width=device-width, initial-scale=1.0'>",
    "<title>Async Task Dashboard</title>",
    "<style>",
    "* { margin: 0; padding: 0; box-sizing: border-box; }",
    "body { font-family: Segoe UI, sans-serif; background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%); color: #fff; min-height: 100vh; padding: 20px; }",
    ".container { max-width: 1200px; margin: 0 auto; }",
    ".header { text-align: center; margin-bottom: 30px; }",
    ".header h1 { font-size: 2.5rem; background: linear-gradient(45deg, #00d4ff, #ff00ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 10px; }",
    ".grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 20px; margin-bottom: 30px; }",
    ".card { background: rgba(42,42,42,0.8); border: 1px solid #333; border-radius: 12px; padding: 25px; backdrop-filter: blur(10px); }",
    ".card h2 { color: #00d4ff; margin-bottom: 20px; font-size: 1.3rem; }",
    ".status { padding: 12px 20px; border-radius: 8px; margin: 10px 0; font-weight: bold; text-align: center; }",
    ".status.connected { background: linear-gradient(45deg, #065f46, #10b981); color: #fff; }",
    ".status.disconnected { background: linear-gradient(45deg, #7f1d1d, #ef4444); color: #fff; }",
    ".input { width: 100%; background: #1a1a2e; border: 2px solid #333; color: #fff; padding: 12px 16px; border-radius: 8px; margin: 8px 0; font-size: 14px; }",
    ".input:focus { outline: none; border-color: #00d4ff; }",
    ".textarea { min-height: 100px; resize: vertical; font-family: inherit; }",
    ".button { background: linear-gradient(45deg, #4f46e5, #7c3aed); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin: 8px 8px 8px 0; font-weight: bold; font-size: 14px; }",
    ".button.success { background: linear-gradient(45deg, #059669, #10b981); }",
    ".button.danger { background: linear-gradient(45deg, #dc2626, #ef4444); }",
    ".button:disabled { background: #666; cursor: not-allowed; }",
    ".log { background: #0a0a0a; border: 1px solid #333; padding: 20px; border-radius: 8px; height: 300px; overflow-y: auto; font-family: Courier New, monospace; font-size: 13px; }",
    ".log-entry { margin-bottom: 4px; }",
    ".log-entry.info { color: #94a3b8; }",
    ".log-entry.success { color: #10b981; }",
    ".log-entry.error { color: #ef4444; }",
    ".log-entry.warning { color: #f59e0b; }",
    ".stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px; margin: 20px 0; }",
    ".stat { background: rgba(0,212,255,0.1); border: 1px solid rgba(0,212,255,0.3); padding: 15px; border-radius: 8px; text-align: center; }",
    ".stat-value { font-size: 1.8rem; font-weight: bold; color: #00d4ff; }",
    ".stat-label { font-size: 0.9rem; color: #94a3b8; margin-top: 5px; }",
    ".file-drop { border: 2px dashed #555; border-radius: 8px; padding: 30px; text-align: center; margin: 15px 0; cursor: pointer; }",
    ".file-drop:hover { border-color: #00d4ff; }",
    ".progress-bar { width: 100%; height: 20px; background: #333; border-radius: 10px; overflow: hidden; margin: 10px 0; position: relative; }",
    ".progress-fill { height: 100%; background: linear-gradient(45deg, #00d4ff, #ff00ff); width: 0%; transition: width 0.5s ease; }",
    ".progress-text { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); color: #fff; font-weight: bold; font-size: 12px; z-index: 10; }",
    "</style>",
    "</head>",
    "<body>",
    "<div class='container'>",
    "<div class='header'><h1>Async Task Dashboard</h1><p>Real-time File Upload and Email Processing System</p></div>",
    "<div class='grid'>",
    "<div class='card'>",
    "<h2>Connection Status</h2>",
    "<div id='status' class='status disconnected'>Disconnected</div>",
    "<input type='text' id='token' class='input' placeholder='Enter JWT token' />",
    "<button id='connect' class='button'>Connect</button>",
    "<button id='disconnect' class='button danger' disabled>Disconnect</button>",
    "</div>",
    "<div class='card'>",
    "<h2>Task Statistics</h2>",
    "<div class='stats'>",
    "<div class='stat'><div class='stat-value' id='totalTasks'>0</div><div class='stat-label'>Total</div></div>",
    "<div class='stat'><div class='stat-value' id='processingTasks'>0</div><div class='stat-label'>Processing</div></div>",
    "<div class='stat'><div class='stat-value' id='completedTasks'>0</div><div class='stat-label'>Completed</div></div>",
    "<div class='stat'><div class='stat-value' id='failedTasks'>0</div><div class='stat-label'>Failed</div></div>",
    "</div>",
    "</div>",
    "</div>",
    "<div class='grid'>",
    "<div class='card'>",
    "<h2>File Upload</h2>",
    "<div id='fileDrop' class='file-drop'><p>Drag and drop files here or click to select</p><p style='font-size:0.9rem;color:#666;margin-top:10px;'>Supports: PDF, Images, CSV, ZIP and more</p></div>",
    "<input type='file' id='fileInput' multiple style='display:none;' />",
    "<div id='fileList'></div>",
    "<button id='uploadFiles' class='button success' disabled>Upload and Process Files</button>",
    "<div class='progress-bar'><div id='uploadProgress' class='progress-fill'></div><div id='uploadProgressText' class='progress-text'>0%</div></div>",
    "</div>",
    "<div class='card'>",
    "<h2>Email Task</h2>",
    "<input type='text' class='input' value='varshinichintha0@gmail.com' readonly />",
    "<textarea id='emailRecipients' class='input textarea' placeholder='Recipients one per line'></textarea>",
    "<input type='text' id='emailSubject' class='input' placeholder='Email subject' />",
    "<textarea id='emailBody' class='input textarea' placeholder='Email message body'></textarea>",
    "<button id='sendEmail' class='button success' disabled>Queue Email Task</button>",
    "<div class='progress-bar'><div id='emailProgress' class='progress-fill'></div><div id='emailProgressText' class='progress-text'>0%</div></div>",
    "</div>",
    "</div>",
    "<div class='card'><h2>Live Event Log</h2><div id='log' class='log'></div><button id='clearLog' class='button' style='margin-top:10px;'>Clear Log</button></div>",
    "</div>",
    "<script>",
    "var ws=null,connected=false,selectedFiles=[];",
    "var statusEl=document.getElementById('status');",
    "var tokenEl=document.getElementById('token');",
    "var connectBtn=document.getElementById('connect');",
    "var disconnectBtn=document.getElementById('disconnect');",
    "var fileDropEl=document.getElementById('fileDrop');",
    "var fileInputEl=document.getElementById('fileInput');",
    "var fileListEl=document.getElementById('fileList');",
    "var uploadBtn=document.getElementById('uploadFiles');",
    "var uploadProgressEl=document.getElementById('uploadProgress');",
    "var uploadProgressTextEl=document.getElementById('uploadProgressText');",
    "var emailRecipientsEl=document.getElementById('emailRecipients');",
    "var emailSubjectEl=document.getElementById('emailSubject');",
    "var emailBodyEl=document.getElementById('emailBody');",
    "var sendEmailBtn=document.getElementById('sendEmail');",
    "var emailProgressEl=document.getElementById('emailProgress');",
    "var emailProgressTextEl=document.getElementById('emailProgressText');",
    "var logEl=document.getElementById('log');",
    "function addLog(message,type){",
    "  if(!type)type='info';",
    "  var time=new Date().toLocaleTimeString();",
    "  var entry=document.createElement('div');",
    "  entry.className='log-entry '+type;",
    "  entry.textContent='['+time+'] '+message;",
    "  logEl.appendChild(entry);",
    "  logEl.scrollTop=logEl.scrollHeight;",
    "  return entry;",
    "}",
    "function updateUI(isConnected){",
    "  connected=isConnected;",
    "  if(isConnected){",
    "    statusEl.textContent='Connected to Real Gateway';",
    "    statusEl.className='status connected';",
    "    connectBtn.disabled=true;",
    "    disconnectBtn.disabled=false;",
    "    uploadBtn.disabled=selectedFiles.length===0;",
    "    sendEmailBtn.disabled=false;",
    "  }else{",
    "    statusEl.textContent='Disconnected';",
    "    statusEl.className='status disconnected';",
    "    connectBtn.disabled=false;",
    "    disconnectBtn.disabled=true;",
    "    uploadBtn.disabled=true;",
    "    sendEmailBtn.disabled=true;",
    "  }",
    "}",
    "function connect(){",
    "  var token=tokenEl.value.trim();",
    "  if(!token){addLog('Please enter a JWT token','error');return;}",
    "  var wsUrl='ws://localhost:4004/ws?token='+token;",
    "  addLog('Connecting to '+wsUrl,'info');",
    "  ws=new WebSocket(wsUrl);",
    "  ws.onopen=function(){addLog('WebSocket connected successfully!','success');updateUI(true);updateStats();};",
    "  ws.onmessage=function(event){try{handleMessage(JSON.parse(event.data));}catch(e){addLog('Invalid message','error');}};",
    "  ws.onclose=function(){addLog('WebSocket connection closed','warning');updateUI(false);};",
    "  ws.onerror=function(){addLog('WebSocket error','error');updateUI(false);};",
    "}",
    "function disconnect(){if(ws){ws.close();ws=null;}updateUI(false);}",
    "function handleMessage(data){",
    "  var method=data.method,params=data.params,result=data.result;",
    "  if(method==='connection.welcome'){",
    "    addLog('Welcome: '+params.message,'success');",
    "    addLog('Features: '+params.features.join(', '),'info');",
    "  }else if(method==='job.progress'){",
    "    addLog(params.message+' ('+params.progress+'%)','info');",
    "    var msg=params.message.toLowerCase();",
    "    if(msg.indexOf('email')>=0||msg.indexOf('sending')>=0||msg.indexOf('smtp')>=0||msg.indexOf('finalizing')>=0){",
    "      updateProgress(params.progress,'email');",
    "    }else{",
    "      updateProgress(params.progress,'upload');",
    "    }",
    "  }else if(method==='file.completed'){",
    "    var entry=addLog('File completed: '+params.filename,'success');",
    "    var dlBtn=document.createElement('a');",
    "    dlBtn.href='/download/'+encodeURIComponent(params.filename);",
    "    dlBtn.download=params.filename;",
    "    dlBtn.style.cssText='background:#10b981;color:white;padding:3px 10px;border-radius:6px;text-decoration:none;font-size:11px;margin-left:8px;';",
    "    dlBtn.textContent='Download';",
    "    entry.appendChild(dlBtn);",
    "  }else if(method==='file.failed'){",
    "    addLog('File failed: '+params.filename+' - '+params.error,'error');",
    "  }else if(method==='email.success'){",
    "    addLog('Email delivered: '+params.recipient,'success');",
    "  }else if(method==='email.failure'){",
    "    addLog('Email failed: '+params.recipient+' - '+params.error,'error');",
    "  }else if(method==='job.result'){",
    "    if(params.result&&params.result.results){",
    "      var sent=params.result.results.filter(function(r){return r.status==='sent';}).length;",
    "      var failed=params.result.results.filter(function(r){return r.status==='failed';}).length;",
    "      addLog('Email batch: '+sent+'/'+params.result.results.length+' sent','success');",
    "      if(failed>0)addLog(failed+' emails failed','warning');",
    "      updateProgress(100,'email');",
    "      setTimeout(function(){emailProgressEl.style.width='0%';emailProgressTextEl.textContent='0%';},3000);",
    "    }",
    "  }else{",
    "    if(method)addLog('Received: '+method,'info');",
    "    else if(result&&result.message)addLog(result.message,'success');",
    "  }",
    "  updateStats();",
    "}",
    "function updateProgress(progress,type){",
    "  if(type==='upload'){uploadProgressEl.style.width=progress+'%';uploadProgressTextEl.textContent=progress+'%';}",
    "  else{emailProgressEl.style.width=progress+'%';emailProgressTextEl.textContent=progress+'%';}",
    "}",
    "async function updateStats(){",
    "  try{",
    "    var data=await fetch('/api/status').then(function(r){return r.json();});",
    "    if(data.stats){",
    "      document.getElementById('totalTasks').textContent=data.stats.totalJobs||0;",
    "      document.getElementById('processingTasks').textContent=data.stats.processing||0;",
    "      document.getElementById('completedTasks').textContent=data.stats.completed||0;",
    "      document.getElementById('failedTasks').textContent=data.stats.failed||0;",
    "    }",
    "  }catch(e){}",
    "}",
    "function handleFiles(files){",
    "  selectedFiles=Array.from(files);",
    "  fileListEl.innerHTML='';",
    "  selectedFiles.forEach(function(file,index){",
    "    var item=document.createElement('div');",
    "    item.style.cssText='padding:8px;background:#333;margin:5px 0;border-radius:4px;display:flex;justify-content:space-between;align-items:center;';",
    "    item.innerHTML='<span>'+file.name+' ('+(file.size/1024).toFixed(1)+' KB)</span><button onclick=\"removeFile('+index+')\" style=\"background:#ef4444;border:none;color:white;padding:4px 8px;border-radius:4px;cursor:pointer;\">X</button>';",
    "    fileListEl.appendChild(item);",
    "  });",
    "  uploadBtn.disabled=!connected||selectedFiles.length===0;",
    "}",
    "window.removeFile=function(index){selectedFiles.splice(index,1);handleFiles(selectedFiles);};",
    "function fileToBase64(file){",
    "  return new Promise(function(resolve,reject){",
    "    var reader=new FileReader();",
    "    reader.onload=function(){resolve(reader.result.split(',')[1]);};",
    "    reader.onerror=reject;",
    "    reader.readAsDataURL(file);",
    "  });",
    "}",
    "async function uploadFiles(){",
    "  if(!connected||selectedFiles.length===0)return;",
    "  addLog('Starting upload of '+selectedFiles.length+' files...','info');",
    "  uploadProgressEl.style.width='0%';uploadProgressTextEl.textContent='0%';",
    "  try{",
    "    var files=await Promise.all(selectedFiles.map(async function(file){",
    "      return{filename:file.name,data:await fileToBase64(file),size:file.size,type:file.type};",
    "    }));",
    "    ws.send(JSON.stringify({jsonrpc:'2.0',method:'file.uploadBulk',params:{files:files},id:Date.now()}));",
    "    addLog('File upload request sent to server','info');",
    "  }catch(error){addLog('Upload failed: '+error.message,'error');}",
    "}",
    "function sendEmail(){",
    "  if(!connected)return;",
    "  var recipients=emailRecipientsEl.value.split(/[,\\n]/).map(function(e){return e.trim();}).filter(function(e){return e.length>0;});",
    "  var subject=emailSubjectEl.value.trim();",
    "  var body=emailBodyEl.value.trim();",
    "  if(recipients.length===0||!subject||!body){addLog('Please fill in all email fields','error');return;}",
    "  addLog('Queuing email to '+recipients.length+' recipients...','info');",
    "  emailProgressEl.style.width='0%';emailProgressTextEl.textContent='0%';",
    "  ws.send(JSON.stringify({jsonrpc:'2.0',method:'email.send',params:{recipients:recipients,subject:subject,body:body},id:Date.now()}));",
    "  addLog('Email task submitted to server','info');",
    "}",
    "connectBtn.addEventListener('click',connect);",
    "disconnectBtn.addEventListener('click',disconnect);",
    "fileDropEl.addEventListener('click',function(){fileInputEl.click();});",
    "fileInputEl.addEventListener('change',function(e){handleFiles(e.target.files);});",
    "fileDropEl.addEventListener('dragover',function(e){e.preventDefault();fileDropEl.classList.add('dragover');});",
    "fileDropEl.addEventListener('dragleave',function(){fileDropEl.classList.remove('dragover');});",
    "fileDropEl.addEventListener('drop',function(e){e.preventDefault();fileDropEl.classList.remove('dragover');handleFiles(e.dataTransfer.files);});",
    "uploadBtn.addEventListener('click',uploadFiles);",
    "sendEmailBtn.addEventListener('click',sendEmail);",
    "document.getElementById('clearLog').addEventListener('click',function(){logEl.innerHTML='';addLog('Log cleared','info');});",
    "updateUI(false);",
    "addLog('Dashboard initialized - Ready to connect!','success');",
    "setInterval(updateStats,5000);",
    "</script>",
    "</body>",
    "</html>"
  ];
  return html.join("\n");
}

console.log("Starting Real Gateway Server...");

Bun.serve({
  port: 4004,
  async fetch(req: Request, server: any) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const token = url.searchParams.get("token");
      if (!token) return new Response("Unauthorized", { status: 401 });
      const result = verifyToken(token);
      if (!result.valid) return new Response(result.error!, { status: 401 });
      const upgraded = server.upgrade(req, { data: { userId: result.userId } });
      if (upgraded) return undefined as any;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    if (url.pathname === "/" || url.pathname === "/dashboard" || url.pathname === "/dashboard.html") {
      return new Response(getDashboardHTML(), { headers: { "Content-Type": "text/html" } });
    }

    if (url.pathname.startsWith("/download/")) {
      const filename = decodeURIComponent(url.pathname.replace("/download/", ""));
      const filePath = join(process.cwd(), "uploads", filename);
      if (existsSync(filePath)) {
        const fileData = readFileSync(filePath);
        return new Response(fileData, {
          headers: {
            "Content-Disposition": "attachment; filename=\"" + filename + "\"",
            "Content-Type": "application/octet-stream"
          }
        });
      }
      return new Response("File not found", { status: 404 });
    }

    if (url.pathname === "/api/status") {
      const jobs = queue.getAllJobs();
      return new Response(JSON.stringify({
        status: "ok",
        stats: {
          totalJobs: jobs.length,
          pending: jobs.filter((j: any) => j.status === "pending").length,
          processing: jobs.filter((j: any) => j.status === "processing").length,
          completed: jobs.filter((j: any) => j.status === "completed").length,
          failed: jobs.filter((j: any) => j.status === "failed").length
        }
      }), { headers: { "Content-Type": "application/json" } });
    }

    return new Response(getDashboardHTML(), { headers: { "Content-Type": "text/html" } });
  },

  websocket: {
    open(ws: any) {
      const userId = ws.data?.userId ?? "unknown";
      connectedClients.set(ws, { userId, isAlive: true });
      console.log("Client connected: " + userId);
      ws.send(JSON.stringify({
        jsonrpc: "2.0",
        method: "connection.welcome",
        params: { message: "Connected to Real Gateway", userId, timestamp: new Date().toISOString(), features: ["file-upload", "email-send", "real-time-progress"] }
      }));
    },

    async message(ws: any, message: any) {
      const raw = String(message);
      if (raw === "__pong__") { const client = connectedClients.get(ws); if (client) client.isAlive = true; return; }
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch (error: any) {
        ws.send(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null })); return;
      }
      const method = parsed?.method;
      if (method === "file.uploadBulk") {
        const jobId = queue.addJob("file.uploadBulk", parsed);
        ws.send(JSON.stringify({ jsonrpc: "2.0", result: { status: "accepted", jobId, message: "File upload started" }, id: parsed.id }));
        return;
      }
      if (method === "email.send") {
        const jobId = queue.addJob("email.send", parsed);
        ws.send(JSON.stringify({ jsonrpc: "2.0", result: { status: "queued", jobId, message: "Email task queued" }, id: parsed.id }));
        return;
      }
      ws.send(JSON.stringify({ jsonrpc: "2.0", result: { status: "received", method: method || "undefined" }, id: parsed.id }));
    },

    close(ws: any) {
      const client = connectedClients.get(ws);
      if (client) { console.log("Client disconnected: " + client.userId); connectedClients.delete(ws); }
    }
  }
});

console.log("Real Gateway Server started on http://localhost:4004");