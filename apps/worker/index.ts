import { Worker } from "bullmq";
import IORedis from "ioredis";
import nodemailer from "nodemailer";

const connection = new IORedis({
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
});

const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY ?? "5", 10);

// Simulated delay helper (skipped in test environment)
const delay = (ms: number) =>
  process.env.NODE_ENV === "test" ? Promise.resolve() : new Promise(resolve => setTimeout(resolve, ms));

// Progress helper: emits 10→25→50→75→100 with optional labels
async function runProgress(
  job: any,
  steps: { pct: number; label: string }[]
) {
  for (const step of steps) {
    console.log(`  [${job.data?.method ?? "job"}] ${step.label} (${step.pct}%)`);
    await job.updateProgress(step.pct);
    await delay(200);
  }
}

// ─── Hospital: task.medical ───────────────────────────────────────────────────
async function processMedical(job: any) {
  const { filename, mimeType, patientName, reportType } = job.data.params ?? {};
  console.log(`\n[HOSPITAL CLIENT] task.medical | Job: ${job.id}`);
  console.log(`  Patient: ${patientName ?? "Unknown"} | Report: ${reportType ?? "General"} | File: ${filename}`);

  await runProgress(job, [
    { pct: 10,  label: "Reading file" },
    { pct: 25,  label: "Analyzing content" },
    { pct: 50,  label: "Processing report" },
    { pct: 75,  label: "Generating result" },
    { pct: 100, label: "Done" },
  ]);

  const result = {
    reportType: reportType ?? "General",
    patientName: patientName ?? filename?.split("_")[0] ?? "Unknown",
    status: "processed",
    filename,
    mimeType,
  };
  console.log(`  [HOSPITAL] Result:`, result);
  return result;
}

// ─── Bank: task.transaction ───────────────────────────────────────────────────
async function processTransaction(job: any) {
  const { transactionId, accountFrom, accountTo, amount, currency } = job.data.params ?? {};
  console.log(`\n[BANK CLIENT] task.transaction | Job: ${job.id}`);
  console.log(`  TxID: ${transactionId} | ${accountFrom} → ${accountTo} | ${amount} ${currency ?? "USD"}`);

  await runProgress(job, [
    { pct: 10,  label: "Verifying account details" },
    { pct: 25,  label: "Checking balance" },
    { pct: 50,  label: "Processing transfer" },
    { pct: 75,  label: "Recording transaction" },
    { pct: 100, label: "Done" },
  ]);

  const result = {
    transactionId,
    status: amount > 0 ? "approved" : "rejected",
    amount,
    currency: currency ?? "USD",
    accountFrom,
    accountTo,
  };
  console.log(`  [BANK] Result:`, result);
  return result;
}

// ─── E-commerce: task.order ───────────────────────────────────────────────────
async function processOrder(job: any) {
  const { orderId, customerEmail, items, total } = job.data.params ?? {};
  console.log(`\n[ECOMMERCE CLIENT] task.order | Job: ${job.id}`);
  console.log(`  OrderID: ${orderId} | Customer: ${customerEmail} | Total: $${total}`);

  await runProgress(job, [
    { pct: 10,  label: "Confirming order" },
    { pct: 25,  label: "Sending confirmation email" },
    { pct: 50,  label: "Generating invoice PDF" },
    { pct: 75,  label: "Preparing tracking details" },
    { pct: 100, label: "Done" },
  ]);

  const result = {
    orderId,
    customerEmail,
    status: "confirmed",
    invoiceGenerated: true,
    trackingId: `TRK-${Date.now()}`,
    itemCount: Array.isArray(items) ? items.length : 0,
    total,
  };
  console.log(`  [ECOMMERCE] Result:`, result);
  return result;
}

// ─── School: task.assignment ──────────────────────────────────────────────────
async function processAssignment(job: any) {
  const { studentName, filename, mimeType, subject } = job.data.params ?? {};
  console.log(`\n[SCHOOL CLIENT] task.assignment | Job: ${job.id}`);
  console.log(`  Student: ${studentName} | Subject: ${subject} | File: ${filename}`);

  await runProgress(job, [
    { pct: 10,  label: "Reading submission" },
    { pct: 25,  label: "Checking plagiarism" },
    { pct: 50,  label: "Grading content" },
    { pct: 75,  label: "Generating feedback" },
    { pct: 100, label: "Done" },
  ]);

  const grade = Math.floor(Math.random() * 30) + 70; // 70–100
  const result = {
    studentName,
    subject,
    filename,
    grade: `${grade}/100`,
    plagiarismScore: `${Math.floor(Math.random() * 15)}%`,
    feedback: grade >= 90 ? "Excellent work!" : grade >= 75 ? "Good effort, minor improvements needed." : "Needs improvement.",
    status: "graded",
  };
  console.log(`  [SCHOOL] Result:`, result);
  return result;
}

// ─── Company: task.bulk_email ─────────────────────────────────────────────────
async function processBulkEmail(job: any) {
  const { recipients, subject, body } = job.data.params ?? {};
  console.log(`\n[COMPANY CLIENT] task.bulk_email | Job: ${job.id}`);
  console.log(`  Recipients: ${recipients?.length ?? 0} | Subject: ${subject}`);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const list: string[] = Array.isArray(recipients) ? recipients : [];
  const results: { email: string; status: "sent" | "failed"; error?: string }[] = [];
  const startTime = Date.now();

  for (let i = 0; i < list.length; i++) {
    const email = list[i];
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
        to: email,
        subject,
        text: body,
      });
      results.push({ email, status: "sent" });
    } catch (err: any) {
      results.push({ email, status: "failed", error: err.message });
    }
    const pct = Math.round(((i + 1) / list.length) * 100);
    console.log(`  [COMPANY] Sent ${i + 1}/${list.length} (${pct}%)`);
    await job.updateProgress(pct);
  }

  const sent = results.filter(r => r.status === "sent").length;
  const failed = results.filter(r => r.status === "failed").length;
  const result = { totalSent: sent, failed, timeTakenMs: Date.now() - startTime, results };
  console.log(`  [COMPANY] Result: sent=${sent}, failed=${failed}`);
  return result;
}

// ─── Media: task.media ────────────────────────────────────────────────────────
async function processMedia(job: any) {
  const { filename, mimeType, sizeBytes } = job.data.params ?? {};
  console.log(`\n[MEDIA CLIENT] task.media | Job: ${job.id}`);
  console.log(`  File: ${filename} | Type: ${mimeType} | Size: ${sizeBytes} bytes`);

  const isVideo = mimeType?.startsWith("video/");
  const steps = isVideo
    ? [
        { pct: 10,  label: "Reading video file" },
        { pct: 25,  label: "Analyzing codec" },
        { pct: 50,  label: "Compressing with ffmpeg" },
        { pct: 75,  label: "Finalizing output" },
        { pct: 100, label: "Done" },
      ]
    : [
        { pct: 10,  label: "Reading image" },
        { pct: 25,  label: "Resizing" },
        { pct: 50,  label: "Optimizing with sharp" },
        { pct: 75,  label: "Saving output" },
        { pct: 100, label: "Done" },
      ];

  await runProgress(job, steps);

  const compressedSize = Math.round((sizeBytes ?? 1000000) * 0.6);
  const result = {
    filename,
    mimeType,
    sizeBefore: sizeBytes,
    sizeAfter: compressedSize,
    savedBytes: (sizeBytes ?? 0) - compressedSize,
    compressionRatio: "40%",
    status: "processed",
  };
  console.log(`  [MEDIA] Result:`, result);
  return result;
}

// ─── file.processChunk ────────────────────────────────────────────────────────
async function processFileChunk(job: any) {
  const { sessionId, fileId, filename, chunkIndex, chunkCount, data } = job.data;
  console.log(`\n[BULK FILE] file.processChunk | Job: ${job.id}`);
  console.log(`  Chunk ${chunkIndex + 1}/${chunkCount} of "${filename}"`);

  await runProgress(job, [
    { pct: 10,  label: "Reading chunk" },
    { pct: 25,  label: "Analyzing" },
    { pct: 50,  label: "Processing" },
    { pct: 75,  label: "Finalizing" },
    { pct: 100, label: "Done" },
  ]);

  return {
    sessionId, fileId, filename, chunkIndex, chunkCount,
    processedBytes: data ? Buffer.from(data, "base64").length : 0,
    status: "processed",
  };
}

// ─── email.send (legacy) ──────────────────────────────────────────────────────
async function processLegacyEmail(job: any) {
  const { recipients, subject, body } = job.data.params as {
    recipients: string[]; subject: string; body: string;
  };
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const results: { email: string; status: "sent" | "failed"; error?: string }[] = [];
  for (let i = 0; i < recipients.length; i++) {
    const email = recipients[i];
    try {
      await transporter.sendMail({ from: process.env.SMTP_FROM ?? process.env.SMTP_USER, to: email, subject, text: body });
      results.push({ email, status: "sent" });
    } catch (err: any) {
      results.push({ email, status: "failed", error: err.message });
    }
    await job.updateProgress(Math.round(((i + 1) / recipients.length) * 100));
  }
  return { results };
}

// ─── Main job processor ───────────────────────────────────────────────────────
export async function processJob(job: {
  id?: string;
  data?: any;
  attemptsMade?: number;
  updateProgress: (n: number) => Promise<void>;
}) {
  if (job.attemptsMade && job.attemptsMade > 0) {
    console.log(`[Job ${job.id}] Retry attempt ${job.attemptsMade}`);
  }

  const method = job.data?.method;

  switch (method) {
    case "task.medical":      return processMedical(job);
    case "task.transaction":  return processTransaction(job);
    case "task.order":        return processOrder(job);
    case "task.assignment":   return processAssignment(job);
    case "task.bulk_email":   return processBulkEmail(job);
    case "task.media":        return processMedia(job);
    case "file.processChunk": return processFileChunk(job);
    case "email.send":        return processLegacyEmail(job);
    default: {
      console.log(`\n[GENERIC] Job: ${job.id} | method: ${method ?? "none"}`);
      await runProgress(job, [
        { pct: 10,  label: "Starting" },
        { pct: 25,  label: "Processing" },
        { pct: 50,  label: "Halfway" },
        { pct: 75,  label: "Almost done" },
        { pct: 100, label: "Done" },
      ]);
      return { output: `Processed: ${job.data?.params?.input ?? job.id}`, jobId: job.id };
    }
  }
}

new Worker("jobs", processJob, {
  connection,
  concurrency: WORKER_CONCURRENCY,
  limiter: { max: WORKER_CONCURRENCY, duration: 1000 },
});

console.log(`Worker listening on queue: jobs (concurrency: ${WORKER_CONCURRENCY})`);
