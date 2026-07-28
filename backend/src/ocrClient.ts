import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { config } from "./config.js";
import type { OcrResult } from "./types.js";

interface WorkerResponse extends OcrResult {
  id: string;
  error?: string;
}

interface PendingRequest {
  resolve: (result: OcrResult) => void;
  reject: (error: Error) => void;
}

const temporaryDirectory = config.temporaryDirectory;

class OcrClient {
  private worker: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, PendingRequest>();

  private startWorker(): ChildProcessWithoutNullStreams {
    if (this.worker && !this.worker.killed) return this.worker;
    const workerPath = path.join(config.backendDirectory, "ocr_worker.py");
    this.worker = spawn(config.pythonExecutable, [workerPath], {
      cwd: config.projectDirectory,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const lines = readline.createInterface({ input: this.worker.stdout });
    lines.on("line", (line) => {
      try {
        const response = JSON.parse(line) as WorkerResponse;
        const request = this.pending.get(response.id);
        if (!request) return;
        this.pending.delete(response.id);
        if (response.error) request.reject(new Error(response.error));
        else request.resolve(response);
      } catch {
        // Ignore non-protocol output from native OCR dependencies.
      }
    });
    this.worker.stderr.on("data", (chunk) => process.stderr.write(chunk));
    this.worker.on("exit", () => {
      for (const request of this.pending.values()) {
        request.reject(new Error("The Python OCR worker stopped unexpectedly."));
      }
      this.pending.clear();
      this.worker = null;
    });
    return this.worker;
  }

  async read(image: Buffer, extension: string, minimumConfidence = 0.3, checkType = "serial"): Promise<OcrResult> {
    await mkdir(temporaryDirectory, { recursive: true });
    const requestId = randomUUID();
    const imagePath = path.join(temporaryDirectory, `${requestId}.${extension}`);
    await writeFile(imagePath, image);
    try {
      const worker = this.startWorker();
      const result = new Promise<OcrResult>((resolve, reject) => {
        this.pending.set(requestId, { resolve, reject });
      });
      worker.stdin.write(`${JSON.stringify({
        id: requestId,
        image_path: imagePath,
        minimum_confidence: minimumConfidence,
        check_type: checkType,
      })}\n`);
      return await result;
    } finally {
      await unlink(imagePath).catch(() => undefined);
    }
  }
}

export const ocrClient = new OcrClient();
