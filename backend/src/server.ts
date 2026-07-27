import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";

import { config } from "./config.js";
import { ocrClient } from "./ocrClient.js";
import {
  buildSessionRecord,
  databaseConnection,
  getSessionReport,
  initializeDatabase,
  saveSession,
  sessionReportToCsv,
} from "./storage.js";
import type { SessionInput } from "./types.js";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    callback(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype));
  },
});

app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", database: "mysql" });
});

app.post("/api/read-serial", upload.single("image"), async (request, response, next) => {
  try {
    if (!request.file) {
      response.status(400).json({ detail: "A JPG, PNG, or WebP image is required." });
      return;
    }
    const minimumConfidence = Number(request.query.minimum_confidence ?? 0.3);
    if (minimumConfidence < 0.1 || minimumConfidence > 0.9) {
      response.status(422).json({ detail: "minimum_confidence must be between 0.10 and 0.90." });
      return;
    }
    const extension = request.file.mimetype.split("/")[1].replace("jpeg", "jpg");
    response.json(await ocrClient.read(request.file.buffer, extension, minimumConfidence));
  } catch (error) {
    next(error);
  }
});

app.post("/api/sessions", async (request: Request<object, object, SessionInput>, response, next) => {
  try {
    const record = buildSessionRecord(request.body);
    const jsonPath = await saveSession(record);
    response.status(201).json({
      session_id: record.session_id,
      saved_at: record.saved_at,
      database_connection: databaseConnection,
      json_path: jsonPath,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/sessions/:sessionId", async (request, response, next) => {
  try {
    const sessionId = Number(request.params.sessionId);
    if (!Number.isSafeInteger(sessionId) || sessionId < 1) {
      response.status(400).json({ detail: "Invalid session ID." });
      return;
    }
    const record = await getSessionReport(sessionId);
    if (!record) {
      response.status(404).json({ detail: "Session not found." });
      return;
    }
    response.json(record);
  } catch (error) {
    next(error);
  }
});

app.get("/api/sessions/:sessionId/report.csv", async (request, response, next) => {
  try {
    const sessionId = Number(request.params.sessionId);
    if (!Number.isSafeInteger(sessionId) || sessionId < 1) {
      response.status(400).json({ detail: "Invalid session ID." });
      return;
    }
    const record = await getSessionReport(sessionId);
    if (!record) {
      response.status(404).json({ detail: "Session not found." });
      return;
    }
    response
      .type("text/csv")
      .attachment(`forgelens-session-${sessionId}.csv`)
      .send(sessionReportToCsv(record));
  } catch (error) {
    next(error);
  }
});

app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
  response.status(500).json({ detail: error.message || "Unexpected server error." });
});

await initializeDatabase();

export const server = app.listen(config.port, config.host, () => {
  console.log(`ForgeLens TypeScript API running at http://${config.host}:${config.port}`);
});
