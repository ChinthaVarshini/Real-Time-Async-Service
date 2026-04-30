import IORedis from "ioredis";
import { Queue, QueueEvents } from "bullmq";
import jwt from "jsonwebtoken";
import { join } from "path";
import { clientRegistry, cleanupRegistry } from "./registry";
import { handleProgress, handleCompleted, handleFailed } from "./queue-event-handlers";
import { SessionStore } from "./session-store";
import { handleFileUpload, handleFileUploadBulk, handleFileRetry, handleSessionStatus } from "./file-handlers";
import { handleChunkProgress, handleChunkCompleted, handleChunkFailed } from "./chunk-event-handlers";

export { clientRegistry, cleanupRegistry, handleProgress, handleCompleted, handleFailed };

// Dashboard file serving function
async function serveDashboardFile(filename: string): Promise<Response> {
  try {
    // Try multiple possible locations for the file
    const possiblePaths = [
      filename, // Current directory (apps/gateway/)
      `apps/gateway/${filename}`, // From project root
      `../dashboard/${filename}`, // From dashboard directory
      `../${filename}`, // Parent directory (for working-dashboard.html)
      join(process.cwd(), 'apps', 'gateway', filename), // Absolute path
    ];
    
    let file = null;
    let foundPath = '';
    
    for (const path of possiblePaths) {
      try {
        file = Bun.file(path);
        const exists = await file.exists();
        if (exists) {
          foundPath = path;
          break;
        }
      } catch (e) {
        // Continue to next path
      }
    }
    
    if (!file || !foundPath) {
      console.log(`File not found: ${filename} (tried: ${possiblePaths.join(', ')})`);
      // Return the embedded HTML as fallback
      return new Response(HTML, { headers: { "Content-Type": "text/html" } });
    }

    // Determine content type
    let contentType = "text/html";
    if (filename.endsWith(".js")) contentType = "application/javascript";
    else if (filename.endsWith(".css")) contentType = "text/css";
    else if (filename.endsWith(".json")) contentType = "application/json";
    
    console.log(`📄 Serving file: ${foundPath}`);
    return new Response(file, {
      headers: { "Content-Type": contentType }
    });
  } catch (error: any) {
    console.error("Error serving dashboard file:", error);
    // Return the embedded HTML as fallback
    return new Response(HTML, { headers: { "Content-Type": "text/html" } });
  }
}

// Heartbeat: track all connected WebSocket clients
const connectedClients = new Map<any, { userId: string; isAlive: boolean }>();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
if (!JWT_SECRET) {
  console.warn("⚠️  Using default JWT_SECRET. Set JWT_SECRET environment variable for production.");
}

function verifyToken(token: string): { valid: boolean; userId?: string; error?: string } {
  try {
    const payload = jwt.verify(token, JWT_SECRET as string) as jwt.JwtPayload;
    return { valid: true, userId: String(payload.sub) };
  } catch (err: any) {
    if (err.name === "TokenExpiredError") return { valid: false, error: "Token expired" };
    return { valid: false, error: "Unauthorized" };
  }
}

const connection = new IORedis({
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
});

const queue = new Queue("jobs", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "fixed", delay: 2000 },
  },
});

const sessionStore = new SessionStore();

export const queueEvents = new QueueEvents("jobs", { connection });

queueEvents.on("progress", ({ jobId, data }: { jobId: string; data: any }) => {
  if (sessionStore.getFileByJobId(jobId)) {
    handleChunkProgress(sessionStore, jobId, data as number);
  } else {
    handleProgress(clientRegistry, jobId, data as number);
  }
});

queueEvents.on("completed", ({ jobId, returnvalue }: { jobId: string; returnvalue: any }) => {
  if (sessionStore.getFileByJobId(jobId)) {
    handleChunkCompleted(sessionStore, jobId, returnvalue);
  } else {
    handleCompleted(clientRegistry, jobId, returnvalue);
  }
});

queueEvents.on("failed", ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
  if (sessionStore.getFileByJobId(jobId)) {
    handleChunkFailed(sessionStore, jobId, failedReason);
  } else {
    handleFailed(clientRegistry, jobId, failedReason);
  }
});

queueEvents.on("retries-exhausted", ({ jobId }: { jobId: string }) => {
  console.log(`[Job ${jobId}] All retries exhausted`);
});

queueEvents.on("error", (err: Error) => {
  console.error("QueueEvents Redis error:", err);
});

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Async Task Processor</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#1e293b;min-height:100vh}
.app{max-width:920px;margin:0 auto;padding:24px 20px}
h1{font-size:22px;font-weight:700;color:#0f172a;margin-bottom:4px}
.sub{font-size:13px;color:#64748b;margin-bottom:24px}
.section{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.stitle{font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px}
label{display:block;font-size:12px;font-weight:600;color:#64748b;margin-bottom:5px}
input[type=text],textarea,select{width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:7px;padding:9px 12px;font-size:13px;color:#1e293b;outline:none;font-family:inherit}
input[type=text]:focus,textarea:focus,select:focus{border-color:#6366f1;box-shadow:0 0 0 3px #6366f120}
input[type=text]::placeholder,textarea::placeholder{color:#94a3b8}
select option{background:#fff}
textarea{resize:vertical;min-height:72px}
.row{display:flex;gap:10px;align-items:flex-end}
.row>*{flex:1}
.row>.shrink{flex:0 0 auto}
.btn{padding:9px 18px;font-size:13px;font-weight:600;border:none;border-radius:7px;cursor:pointer;transition:background .15s;white-space:nowrap}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-primary{background:#6366f1;color:#fff}
.btn-primary:hover:not(:disabled){background:#4f46e5}
.btn-danger{background:#ef4444;color:#fff}
.btn-danger:hover:not(:disabled){background:#dc2626}
.btn-success{background:#22c55e;color:#fff;font-weight:700}
.btn-success:hover:not(:disabled){background:#16a34a}
.btn-ghost{background:#fff;color:#64748b;border:1px solid #e2e8f0}
.btn-ghost:hover:not(:disabled){background:#f1f5f9;color:#1e293b}
.btn-warn{background:#f97316;color:#fff;font-weight:600}
.btn-warn:hover:not(:disabled){background:#ea580c}
.btn-sm{padding:5px 10px;font-size:12px}
.conn-row{display:flex;gap:8px;align-items:center}
.conn-row input{flex:1}
.status-pill{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;padding:6px 12px;border-radius:20px;background:#f8fafc;border:1px solid #e2e8f0;margin-top:10px}
.dot{width:8px;height:8px;border-radius:50%;background:#cbd5e1;flex-shrink:0}
.dot.ok{background:#22c55e;box-shadow:0 0 6px #22c55e66}
.dot.err{background:#ef4444}
.file-drop{border:2px dashed #e2e8f0;border-radius:10px;padding:22px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s;position:relative;background:#fafbfc}
.file-drop:hover,.file-drop.drag{border-color:#6366f1;background:#f5f3ff}
.file-drop input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.fd-icon{font-size:30px;margin-bottom:6px}
.fd-hint{font-size:13px;color:#64748b}
.fd-hint span{color:#6366f1;font-weight:600}
.fd-sub{font-size:11px;color:#94a3b8;margin-top:3px}
.sel-list{margin-top:10px;display:flex;flex-direction:column;gap:5px;max-height:180px;overflow-y:auto}
.sel-item{display:flex;align-items:center;gap:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;font-size:12px}
.si-icon{font-size:16px;flex-shrink:0}
.si-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1e293b}
.si-size{color:#94a3b8;flex-shrink:0}
.si-rm{color:#ef4444;cursor:pointer;flex-shrink:0;font-size:15px;line-height:1;padding:0 2px}
.pri-group{display:flex;gap:6px}
.pri-btn{flex:1;padding:7px 8px;font-size:12px;font-weight:600;border:1px solid #e2e8f0;border-radius:6px;background:#fff;color:#94a3b8;cursor:pointer;text-align:center;transition:all .15s}
.pri-btn.a-high{background:#fef2f2;border-color:#ef4444;color:#dc2626}
.pri-btn.a-normal{background:#eff6ff;border-color:#3b82f6;color:#2563eb}
.pri-btn.a-low{background:#f0fdf4;border-color:#22c55e;color:#16a34a}
.type-badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;background:#f1f5f9;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
.t-Email{background:#eff6ff;color:#2563eb}.t-File{background:#ecfeff;color:#0891b2}
.t-Image{background:#f5f3ff;color:#7c3aed}.t-Video{background:#fff1f2;color:#e11d48}
.t-Data{background:#f0fdf4;color:#16a34a}.t-Notification{background:#fffbeb;color:#d97706}
.t-Report{background:#f8fafc;color:#475569}.t-Database{background:#eef2ff;color:#4f46e5}
.ov-track{height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden;margin:8px 0}
.ov-fill{height:100%;width:0%;background:linear-gradient(90deg,#6366f1,#22c55e);border-radius:4px;transition:width .4s}
.ov-stats{display:flex;gap:18px;font-size:12px;color:#94a3b8}
.ov-stats b{color:#1e293b}
#taskList{display:flex;flex-direction:column;gap:10px}
.task-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.tc-hdr{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.tc-name{font-size:13px;font-weight:600;color:#0f172a;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tc-size{font-size:11px;color:#94a3b8;flex-shrink:0}
.sb{font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;flex-shrink:0}
.sb-pending{background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0}
.sb-processing{background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe}
.sb-done{background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0}
.sb-failed{background:#fef2f2;color:#dc2626;border:1px solid #fecaca}
.bar-track{height:5px;background:#f1f5f9;border-radius:3px;overflow:hidden}
.bar-fill{height:100%;width:0%;background:#6366f1;border-radius:3px;transition:width .3s}
.bar-fill.done{background:#22c55e}.bar-fill.failed{background:#ef4444}
.tc-foot{display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:11px;color:#94a3b8}
.tc-res{margin-top:8px;font-size:12px;background:#f8fafc;border-radius:6px;padding:8px 10px;word-break:break-all}
.tc-res.ok{color:#16a34a;border-left:3px solid #22c55e}
.tc-res.err{color:#dc2626;border-left:3px solid #ef4444;display:flex;align-items:center;justify-content:space-between;gap:8px}
.sum-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.sum-card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.sum-val{font-size:28px;font-weight:700}
.sum-lbl{font-size:11px;color:#94a3b8;margin-top:2px}
#log{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;height:120px;overflow-y:auto;font-size:11px;font-family:'Courier New',monospace;white-space:pre-wrap;margin-top:16px}
.li{color:#94a3b8}.lok{color:#16a34a}.lerr{color:#dc2626}.lev{color:#6366f1}
.hidden{display:none!important}
.mt10{margin-top:10px}
.flex-between{display:flex;justify-content:space-between;align-items:center}
.chip{display:inline-flex;align-items:center;gap:5px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:500}
.chip .chip-rm{cursor:pointer;color:#93c5fd;font-size:14px;line-height:1;margin-left:2px}
.chip .chip-rm:hover{color:#1d4ed8}
.email-result{margin-top:6px;font-size:12px;display:flex;flex-direction:column;gap:4px}
.er-row{display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:6px;background:#f8fafc;border:1px solid #e2e8f0}
.er-row.ok{background:#f0fdf4;border-color:#bbf7d0;color:#15803d}
.er-row.fail{background:#fef2f2;border-color:#fecaca;color:#dc2626}
.er-addr{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
</style>
</head>
<body>
<div class="app">
<h1>&#9889; Async Task Processor</h1>
<p class="sub">Real-time file processing &amp; task queue over WebSocket</p>

<div class="section">
  <div class="stitle">Connection</div>
  <div class="conn-row">
    <input id="tokenInput" type="text" placeholder="Paste your JWT token here..."/>
    <button id="btnConnect" class="btn btn-primary" onclick="doConnect()">Connect</button>
    <button id="btnDisconnect" class="btn btn-danger hidden" onclick="doDisconnect()">Disconnect</button>
  </div>
  <div class="status-pill"><div class="dot" id="statusDot"></div><span id="authStatus">Not connected</span></div>
</div>

<div id="mainSection" class="hidden">

<div class="section">
  <div class="stitle">File Upload</div>
  <div class="file-drop" id="fileDrop" ondragover="onDragOver(event)" ondragleave="onDragLeave()" ondrop="onDrop(event)">
    <input type="file" id="fileInput" multiple accept="*/*" onchange="onFileChange(event)"/>
    <div class="fd-icon">&#128193;</div>
    <div class="fd-hint">Drag &amp; drop files or <span>browse</span></div>
    <div class="fd-sub">PDF, images, video, CSV, Excel, ZIP &mdash; up to 500 files</div>
  </div>
  <div class="sel-list" id="selList"></div>
  <div class="flex-between mt10">
    <span id="fileCountLabel" style="font-size:12px;color:#64748b;"></span>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-ghost btn-sm" onclick="clearFiles()">Clear</button>
      <button id="btnUpload" class="btn btn-success" onclick="uploadFiles()">Upload &amp; Process</button>
    </div>
  </div>
</div>

<div class="section">
  <div class="stitle">&#128231; Send Email</div>
  <div style="margin-bottom:10px;">
    <label>Recipients</label>
    <div style="display:flex;gap:8px;margin-bottom:6px;">
      <input id="recipientInput" type="text" placeholder="email@example.com, another@example.com or one per line" style="flex:1"/>
      <button class="btn btn-ghost btn-sm" onclick="addRecipients()">Add</button>
    </div>
    <div id="recipientList" style="display:flex;flex-wrap:wrap;gap:6px;min-height:0;"></div>
  </div>
  <div style="margin-bottom:10px;">
    <label for="emailSubject">Subject</label>
    <input id="emailSubject" type="text" placeholder="Email subject..."/>
  </div>
  <div style="margin-bottom:12px;">
    <label for="emailBody">Message</label>
    <textarea id="emailBody" placeholder="Write your message here..." style="min-height:90px;"></textarea>
  </div>
  <div style="display:flex;justify-content:flex-end;gap:8px;align-items:center;">
    <span id="recipientCount" style="font-size:12px;color:#64748b;"></span>
    <button class="btn btn-ghost btn-sm" onclick="clearEmail()">Clear</button>
    <button class="btn btn-primary" onclick="sendEmail()">&#9993; Send Email</button>
  </div>
</div>

<div class="section hidden" id="progressSection">
  <div class="stitle">Progress</div>
  <div class="flex-between" style="margin-bottom:4px;">
    <span style="font-size:13px;font-weight:600;" id="overallLabel">0 / 0</span>
    <span style="font-size:12px;color:#64748b;" id="overallPct">0%</span>
  </div>
  <div class="ov-track"><div class="ov-fill" id="overallFill"></div></div>
  <div class="ov-stats mt10">
    <div>Total <b id="statTotal">0</b></div>
    <div>Done <b id="statDone" style="color:#22c55e">0</b></div>
    <div>Failed <b id="statFailed" style="color:#ef4444">0</b></div>
  </div>
</div>

<div id="taskList"></div>

<div class="section hidden" id="summarySection">
  <div class="stitle">Session Complete &#9989;</div>
  <div class="sum-grid">
    <div class="sum-card"><div class="sum-val" style="color:#0f172a" id="sumTotal">0</div><div class="sum-lbl">Tasks Sent</div></div>
    <div class="sum-card"><div class="sum-val" style="color:#16a34a" id="sumDone">0</div><div class="sum-lbl">Completed</div></div>
    <div class="sum-card"><div class="sum-val" style="color:#dc2626" id="sumFail">0</div><div class="sum-lbl">Failed</div></div>
    <div class="sum-card"><div class="sum-val" style="color:#6366f1" id="sumTime">0s</div><div class="sum-lbl">Total Time</div></div>
  </div>
</div>

</div>
<div id="log"></div>
</div>
<script>
let ws=null,selFiles=[],emailRecipients=[],taskState={},sesTotal=0,sesDone=0,sesFailed=0;
const completedFileIds=new Set();const failedFileIds=new Set();
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function fmtSize(b){if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';if(b<1073741824)return(b/1048576).toFixed(1)+' MB';return(b/1073741824).toFixed(2)+' GB';}
function fmtMs(ms){return ms<1000?ms+'ms':(ms/1000).toFixed(2)+'s';}
function fileIcon(n){const e=(n.split('.').pop()||'').toLowerCase();if(['jpg','jpeg','png','gif','webp','svg','bmp'].includes(e))return'🖼️';if(['mp4','mov','avi','mkv','webm'].includes(e))return'🎬';if(['mp3','wav','ogg','flac'].includes(e))return'🎵';if(e==='pdf')return'📕';if(['xls','xlsx'].includes(e))return'📊';if(e==='csv')return'📋';if(['zip','rar','7z','tar','gz'].includes(e))return'🗜️';if(['doc','docx'].includes(e))return'📝';if(['js','ts','py','java','go','rs'].includes(e))return'💻';return'📄';}
function logLine(t,c='li'){const el=document.getElementById('log');const s=document.createElement('span');s.className=c;s.textContent='['+new Date().toLocaleTimeString()+'] '+t+'\\n';el.appendChild(s);el.scrollTop=el.scrollHeight;}
function setConn(m,st){document.getElementById('authStatus').textContent=m;document.getElementById('statusDot').className='dot '+(st==='ok'?'ok':st==='err'?'err':'');}
function doConnect(){
  const token=document.getElementById('tokenInput').value.trim();
  if(!token){setConn('Please enter a token','err');return;}
  if(ws){ws.close();ws=null;}
  ws=new WebSocket('ws://localhost:4000/ws?token='+encodeURIComponent(token));
  ws.onopen=()=>{setConn('Connected','ok');document.getElementById('mainSection').classList.remove('hidden');document.getElementById('btnDisconnect').classList.remove('hidden');document.getElementById('btnConnect').classList.add('hidden');logLine('Connected','lok');};
  ws.onerror=()=>{};
  ws.onclose=(e)=>{document.getElementById('mainSection').classList.add('hidden');document.getElementById('btnDisconnect').classList.add('hidden');document.getElementById('btnConnect').classList.remove('hidden');setConn(e.code===4001?'Token expired':'Disconnected','err');logLine('Disconnected (code='+e.code+')','lerr');ws=null;};
  ws.onmessage=(e)=>{if(e.data==='__ping__'){ws.send('__pong__');return;}let msg;try{msg=JSON.parse(e.data);}catch{logLine('Raw: '+e.data);return;}handleMessage(msg);};
}
function doDisconnect(){if(ws){ws.close(1000,'user disconnect');ws=null;}}
function onDragOver(e){e.preventDefault();document.getElementById('fileDrop').classList.add('drag');}
function onDragLeave(){document.getElementById('fileDrop').classList.remove('drag');}
function onDrop(e){e.preventDefault();document.getElementById('fileDrop').classList.remove('drag');addFiles(Array.from(e.dataTransfer.files));}
function onFileChange(e){addFiles(Array.from(e.target.files));e.target.value='';}
function addFiles(files){for(const f of files){if(selFiles.length>=500)break;selFiles.push(f);}renderSel();}
function removeFile(i){selFiles.splice(i,1);renderSel();}
function clearFiles(){selFiles=[];renderSel();}
function renderSel(){
  const c=document.getElementById('selList');c.innerHTML='';
  selFiles.forEach((f,i)=>{const d=document.createElement('div');d.className='sel-item';d.innerHTML='<span class="si-icon">'+fileIcon(f.name)+'</span><span class="si-name">'+esc(f.name)+'</span><span class="si-size">'+fmtSize(f.size)+'</span><span class="si-rm" onclick="removeFile('+i+')" title="Remove">&#x2715;</span>';c.appendChild(d);});
  document.getElementById('fileCountLabel').textContent=selFiles.length?selFiles.length+' file(s) selected':'';
}
async function uploadFiles(){
  if(!selFiles.length){logLine('No files selected','lerr');return;}
  if(!ws||ws.readyState!==WebSocket.OPEN){logLine('Not connected','lerr');return;}
  document.getElementById('btnUpload').disabled=true;
  resetProgress();
  logLine('Reading '+selFiles.length+' file(s)...','li');
  const descs=await Promise.all(selFiles.map(f=>new Promise(res=>{const r=new FileReader();r.onload=()=>res({filename:f.name,mimeType:f.type||'application/octet-stream',size:f.size,data:r.result.split(',')[1]});r.readAsDataURL(f);})));
  ws.send(JSON.stringify({jsonrpc:'2.0',method:'file.uploadBulk',params:{files:descs},id:Date.now()}));
  logLine('Sent '+selFiles.length+' file(s)','lok');
  document.getElementById('btnUpload').disabled=false;
}
// Email helpers
function parseEmails(raw){return raw.split(/[,\\n]+/).map(s=>s.trim()).filter(s=>s.includes('@'));}
function addRecipients(){
  const inp=document.getElementById('recipientInput');
  const emails=parseEmails(inp.value);
  emails.forEach(e=>{if(!emailRecipients.includes(e))emailRecipients.push(e);});
  inp.value='';renderRecipients();
}
function removeRecipient(i){emailRecipients.splice(i,1);renderRecipients();}
function renderRecipients(){
  const c=document.getElementById('recipientList');c.innerHTML='';
  emailRecipients.forEach((e,i)=>{const d=document.createElement('span');d.className='chip';d.innerHTML=esc(e)+'<span class="chip-rm" onclick="removeRecipient('+i+')" title="Remove">&#x2715;</span>';c.appendChild(d);});
  document.getElementById('recipientCount').textContent=emailRecipients.length?emailRecipients.length+' recipient(s)':'';
}
function clearEmail(){emailRecipients=[];renderRecipients();document.getElementById('recipientInput').value='';document.getElementById('emailSubject').value='';document.getElementById('emailBody').value='';}
function sendEmail(){
  const inp=document.getElementById('recipientInput').value;
  if(inp.trim())addRecipients();
  if(!emailRecipients.length){logLine('Add at least one recipient','lerr');return;}
  const subject=document.getElementById('emailSubject').value.trim();
  const body=document.getElementById('emailBody').value.trim();
  if(!subject){logLine('Subject is required','lerr');return;}
  if(!ws||ws.readyState!==WebSocket.OPEN){logLine('Not connected','lerr');return;}
  const id=Date.now();const key='email-'+id;
  taskState[key]={name:'Email: '+subject,size:null,type:'Email',startedAt:Date.now(),chunkProgress:{},totalChunks:1,done:false,recipients:[...emailRecipients]};
  ws.send(JSON.stringify({jsonrpc:'2.0',method:'email.send',params:{recipients:[...emailRecipients],subject,body},id}));
  logLine('Sending email to '+emailRecipients.length+' recipient(s)','lev');
  sesTotal++;document.getElementById('progressSection').classList.remove('hidden');updateOverall();
  getOrCreateCard(key,'Email: '+subject,'Email',null);
}
function resetProgress(){
  Object.keys(taskState).forEach(k=>delete taskState[k]);
  completedFileIds.clear();failedFileIds.clear();
  document.getElementById('taskList').innerHTML='';
  document.getElementById('summarySection').classList.add('hidden');
  document.getElementById('progressSection').classList.add('hidden');
  sesTotal=0;sesDone=0;sesFailed=0;updateOverall();
}
function updateOverall(){
  const done=sesDone+sesFailed;const pct=sesTotal?Math.round(done/sesTotal*100):0;
  document.getElementById('overallFill').style.width=pct+'%';
  document.getElementById('overallLabel').textContent=done+' / '+sesTotal;
  document.getElementById('overallPct').textContent=pct+'%';
  document.getElementById('statTotal').textContent=sesTotal;
  document.getElementById('statDone').textContent=sesDone;
  document.getElementById('statFailed').textContent=sesFailed;
}
function getOrCreateCard(id,name,type,size){
  let card=document.getElementById('card-'+id);
  if(!card){
    card=document.createElement('div');card.className='task-card';card.id='card-'+id;
    const tc='t-'+(type||'File');
    card.innerHTML='<div class="tc-hdr"><span class="tc-name">'+fileIcon(name)+' '+esc(name)+'</span>'+(size!=null?'<span class="tc-size">'+fmtSize(size)+'</span>':'')+'<span class="type-badge '+tc+'">'+esc(type||'File')+'</span><span class="sb sb-pending" id="sb-'+id+'">pending</span></div><div class="bar-track"><div class="bar-fill" id="bf-'+id+'"></div></div><div class="tc-foot"><span id="pct-'+id+'">0%</span><span id="time-'+id+'"></span></div><div id="res-'+id+'" style="display:none"></div>';
    document.getElementById('taskList').appendChild(card);
  }
  return card;
}
function setStatus(id,text,cls,barCls){const sb=document.getElementById('sb-'+id);if(sb){sb.textContent=text;sb.className='sb '+cls;}const bf=document.getElementById('bf-'+id);if(bf&&barCls)bf.className='bar-fill '+barCls;}
function setProgress(id,pct){const bf=document.getElementById('bf-'+id);if(bf)bf.style.width=pct+'%';const pe=document.getElementById('pct-'+id);if(pe)pe.textContent=pct+'%';}
function setTime(id,ms){const e=document.getElementById('time-'+id);if(e)e.textContent=fmtMs(ms);}
function setResult(id,html,ok,retryFn){
  const e=document.getElementById('res-'+id);if(!e)return;
  e.style.display='block';e.className='tc-res '+(ok?'ok':'err');
  if(!ok&&retryFn){
    e.innerHTML='<span>&#10060; '+html+'</span><button class="btn btn-warn btn-sm" onclick="('+retryFn+')()">&#8635; Retry</button>';
  } else {
    e.innerHTML=html;
  }
}
function retryFile(sessionId,fileId){
  if(!ws||ws.readyState!==WebSocket.OPEN){logLine('Not connected','lerr');return;}
  ws.send(JSON.stringify({jsonrpc:'2.0',method:'file.retry',params:{sessionId,fileId},id:Date.now()}));
  logLine('Retrying file: '+fileId,'lev');
  // Reset card state
  setStatus(fileId,'pending','sb-pending','');setProgress(fileId,0);
  const res=document.getElementById('res-'+fileId);if(res)res.style.display='none';
  sesFailed--;updateOverall();
}
function retryManual(key){
  if(!ws||ws.readyState!==WebSocket.OPEN){logLine('Not connected','lerr');return;}
  const st=taskState[key];if(!st)return;
  const id=Date.now();const newKey='manual-'+id;
  taskState[newKey]={name:st.name,size:null,type:st.type,startedAt:Date.now(),chunkProgress:{},totalChunks:1};
  ws.send(JSON.stringify({jsonrpc:'2.0',method:'queue.add',params:{input:st.name,type:st.type,priority:curPriority},id}));
  logLine('Retrying task: '+st.name,'lev');
  sesTotal++;sesFailed--;updateOverall();
  getOrCreateCard(newKey,st.name,st.type,null);
}
function handleMessage(msg){
  if(msg.result&&msg.result.status==='accepted'&&msg.result.fileCount!=null){
    sesTotal=msg.result.fileCount;sesDone=0;sesFailed=0;
    completedFileIds.clear();failedFileIds.clear();
    document.getElementById('progressSection').classList.remove('hidden');
    document.getElementById('summarySection').classList.add('hidden');
    document.getElementById('taskList').innerHTML='';
    Object.keys(taskState).forEach(k=>delete taskState[k]);
    updateOverall();logLine('Session: '+msg.result.sessionId+' ('+sesTotal+' files)','lok');return;
  }
  if(msg.result&&msg.result.status==='queued'){logLine('Job queued: '+msg.result.jobId,'lev');return;}
  if(msg.error){logLine('Error '+msg.error.code+': '+msg.error.message,'lerr');return;}
  const p=msg.params;if(!p){logLine('Msg: '+JSON.stringify(msg));return;}
  switch(msg.method){
    case 'file.processing':{
      if(!taskState[p.fileId])taskState[p.fileId]={name:p.filename,size:null,type:'File',startedAt:Date.now(),chunkProgress:{},totalChunks:1,done:false};
      else if(!taskState[p.fileId].startedAt)taskState[p.fileId].startedAt=Date.now();
      getOrCreateCard(p.fileId,p.filename,'File',taskState[p.fileId].size);
      setStatus(p.fileId,'processing','sb-processing','');
      logLine('['+p.filename+'] processing...','lev');break;
    }
    case 'chunk.progress':{
      if(!taskState[p.fileId])taskState[p.fileId]={name:p.filename,size:null,type:'File',startedAt:Date.now(),chunkProgress:{},totalChunks:p.chunkCount,done:false};
      taskState[p.fileId].chunkProgress[p.chunkIndex]=p.progress;
      taskState[p.fileId].totalChunks=p.chunkCount;
      const vals=Object.values(taskState[p.fileId].chunkProgress);
      const avg=Math.min(99,Math.round(vals.reduce((a,b)=>a+b,0)/p.chunkCount));
      getOrCreateCard(p.fileId,p.filename,'File',taskState[p.fileId].size);
      setStatus(p.fileId,'processing','sb-processing','');
      setProgress(p.fileId,avg);break;
    }
    case 'file.completed':{
      // Guard: only count each fileId once
      if(completedFileIds.has(p.fileId))break;
      completedFileIds.add(p.fileId);
      const st=taskState[p.fileId];const el=st&&st.startedAt?Date.now()-st.startedAt:null;
      setStatus(p.fileId,'done ✓','sb-done','done');setProgress(p.fileId,100);
      if(el!=null)setTime(p.fileId,el);
      const doneNow=completedFileIds.size;
      setResult(p.fileId,'&#9989; Completed'+(el!=null?' in '+fmtMs(el):''),true,null);
      sesDone=Math.min(doneNow,sesTotal);updateOverall();
      logLine('['+p.filename+'] done ('+sesDone+'/'+sesTotal+')','lok');break;
    }
    case 'file.failed':{
      // Guard: only count each fileId once
      if(failedFileIds.has(p.fileId))break;
      failedFileIds.add(p.fileId);
      const st=taskState[p.fileId];const el=st&&st.startedAt?Date.now()-st.startedAt:null;
      setStatus(p.fileId,'failed ✗','sb-failed','failed');if(el!=null)setTime(p.fileId,el);
      const retryFn='function(){retryFile("'+p.sessionId+'","'+p.fileId+'")}';
      setResult(p.fileId,esc(p.error),false,retryFn);
      sesFailed=Math.min(failedFileIds.size,sesTotal);updateOverall();
      logLine('['+p.filename+'] FAILED: '+p.error,'lerr');break;
    }
    case 'session.completed':{
      // Use server values for the summary (authoritative), but cap display
      const total=sesTotal||p.totalCount;
      const done=Math.min(p.completedCount,total);
      const fail=Math.min(p.failedCount,total);
      document.getElementById('summarySection').classList.remove('hidden');
      document.getElementById('sumTotal').textContent=total;
      document.getElementById('sumDone').textContent=done;
      document.getElementById('sumFail').textContent=fail;
      document.getElementById('sumTime').textContent=fmtMs(p.durationMs);
      logLine('Session complete — '+done+'/'+total+' in '+fmtMs(p.durationMs),'lok');break;
    }
    case 'job.progress':logLine('Job progress: '+p.progress+'%','lev');break;
    case 'job.result':{
      logLine('Job result: '+JSON.stringify(p.result),'lok');
      const keys=Object.keys(taskState).filter(k=>(k.startsWith('manual-')||k.startsWith('email-'))&&!taskState[k].done);
      if(keys.length){const k=keys[keys.length-1];taskState[k].done=true;
        const el=taskState[k].startedAt?Date.now()-taskState[k].startedAt:null;
        // Email result with per-recipient breakdown
        if(k.startsWith('email-')&&p.result&&p.result.results){
          const rows=p.result.results;
          const sent=rows.filter(r=>r.status==='sent').length;
          const failed=rows.filter(r=>r.status==='failed').length;
          const allOk=failed===0;
          setStatus(k,allOk?'sent ✓':'partial ⚠','sb-'+(allOk?'done':'failed'),'');
          setProgress(k,100);if(el)setTime(k,el);
          const html='<div class="email-result">'+rows.map(r=>'<div class="er-row '+(r.status==='sent'?'ok':'fail')+'"><span>'+(r.status==='sent'?'✓':'✗')+'</span><span class="er-addr">'+esc(r.email)+'</span>'+(r.error?'<span style="font-size:11px;opacity:.8">'+esc(r.error)+'</span>':'')+'</div>').join('')+'</div>';
          const e=document.getElementById('res-'+k);if(e){e.style.display='block';e.className='tc-res '+(allOk?'ok':'err');e.innerHTML=html;}
          if(allOk)sesDone=Math.min(sesDone+1,sesTotal);else sesFailed=Math.min(sesFailed+1,sesTotal);
          logLine('Email: '+sent+' sent, '+failed+' failed','lok');
        } else {
          setStatus(k,'done ✓','sb-done','done');setProgress(k,100);if(el)setTime(k,el);
          const out=typeof p.result==='object'?(p.result.output||JSON.stringify(p.result)):String(p.result);
          setResult(k,'&#9989; '+esc(out),true,null);sesDone=Math.min(sesDone+1,sesTotal);
        }
        updateOverall();}break;
    }
    case 'job.failed':{
      logLine('Job failed: '+p.error,'lerr');
      const keys=Object.keys(taskState).filter(k=>(k.startsWith('manual-')||k.startsWith('email-'))&&!taskState[k].done);
      if(keys.length){const k=keys[keys.length-1];taskState[k].done=true;
        setStatus(k,'failed ✗','sb-failed','failed');
        setResult(k,esc(p.error),false,null);
        sesFailed=Math.min(sesFailed+1,sesTotal);updateOverall();}break;
    }
    default:logLine('Event: '+JSON.stringify(msg));
  }
}
</script>
</body>
</html>`;

// @ts-ignore
Bun.serve({
  port: 4000,
  async fetch(req: Request, server: any) {
    const url = new URL(req.url);

    // Upgrade WebSocket connections
    if (url.pathname === "/ws") {
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response("Unauthorized", { status: 401 });
      }
      const result = verifyToken(token);
      if (!result.valid) {
        console.log(`Connection rejected: ${result.error}`);
        return new Response(result.error!, { status: 401 });
      }
      const upgraded = server.upgrade(req, { data: { userId: result.userId } });
      if (upgraded) return undefined as any;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // Serve Dashboard Files
    if (url.pathname === "/dashboard" |working-dashboard.html");
    }
    if (url.pathname === "/simple.html") {
      return await serveDashboardFile("simple.html");
    }
    if (url.pathname === "/example.html") {
      return await serveDashboardFile("example.html");
    }
    if (url.pathname === "/dashboard.html") {
      return await serveDashboardFile("working-ml") {
      return await serveDashboardFile("dashboard.html");
    }
    if (url.pathname.startsWith("/dist/")) {
      return await serveDashboardFile(url.pathname.slice(1)); // Remove leading slash
    }

    // Serve original HTML UI (legacy)
    if (url.pathname === "/legacy") {
      return new Response(HTML, { headers: { "Content-Type": "text/html" } });
    }

    // Default to dashboard
    return await serveDashboardFile("simple.html");
  },
  websocket: {
    open(ws: any) {
      const userId = ws.data?.userId ?? "unknown";
      connectedClients.set(ws, { userId, isAlive: true });
      console.log(`Client connected with userID: ${userId} ✅`);
    },
    async message(ws: any, message: any) {
      const raw = String(message);

      // Handle pong frames sent as text "__pong__"
      if (raw === "__pong__") {
        const client = connectedClients.get(ws);
        if (client) {
          client.isAlive = true;
          console.log(`Pong received from userID: ${client.userId}`);
        }
        return;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        ws.send(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
        return;
      }

      const input = parsed?.params?.input ?? parsed?.id ?? "unknown";
      console.log(`Received: job "${input}"`);

      const method = parsed?.method;

      if (method === "file.upload") {
        await handleFileUpload(ws, parsed, queue, sessionStore, clientRegistry);
        return;
      }
      if (method === "file.uploadBulk") {
        await handleFileUploadBulk(ws, parsed, queue, sessionStore, clientRegistry);
        return;
      }
      if (method === "file.retry") {
        await handleFileRetry(ws, parsed, queue, sessionStore, clientRegistry);
        return;
      }
      if (method === "session.status") {
        handleSessionStatus(ws, parsed, sessionStore);
        return;
      }

      if (method === "email.send") {
        try {
          const job = await queue.add("email.send", parsed);
          clientRegistry.set(job.id!, ws);
          ws.send(JSON.stringify({ jsonrpc: "2.0", result: { status: "queued", jobId: job.id }, id: parsed.id ?? null }));
        } catch (err) {
          console.error("Failed to enqueue email job:", err);
          ws.send(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: parsed.id ?? null }));
        }
        return;
      }

      try {
        const job = await queue.add(parsed.method, parsed);
        clientRegistry.set(job.id!, ws);
        ws.send(JSON.stringify({ jsonrpc: "2.0", result: { status: "queued", jobId: job.id }, id: parsed.id ?? null }));
      } catch (err) {
        console.error("Failed to enqueue job:", err);
        ws.send(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: parsed.id ?? null }));
      }
    },
    close(ws: any) {
      const client = connectedClients.get(ws);
      const userId = client?.userId ?? "unknown";
      console.log(`Client ${userId} disconnected — cleaned up`);
      connectedClients.delete(ws);
      cleanupRegistry(clientRegistry, ws);
    },
  },
});

console.log("Gateway server started on http://localhost:4000");

// Heartbeat interval — every 30 seconds
setInterval(() => {
  for (const [ws, client] of connectedClients) {
    if (!client.isAlive) {
      console.log(`Client ${client.userId} disconnected — cleaned up`);
      connectedClients.delete(ws);
      cleanupRegistry(clientRegistry, ws);
      ws.close();
      continue;
    }
    client.isAlive = false;
    console.log(`Ping sent to userID: ${client.userId}`);
    try { ws.send("__ping__"); } catch { connectedClients.delete(ws); }
  }
}, 30_000);
