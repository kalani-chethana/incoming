import { Router } from "express";
import multer from "multer";

import authorize from "../../common/middlewares/authorization.js";
import * as controller from "../controllers/serialnumber.controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    callback(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype));
  },
});

export const serialnumberRoutes = Router();

serialnumberRoutes.get(
  "/health",
  authorize([{ property: "serialnumber", permission: "read" }]),
  async (_req, res) => {
    try {
      const response = await controller.getHealthController();
      res.sendData(response);
    } catch (err) {
      res.sendData(err);
    }
  },
);

serialnumberRoutes.post(
  "/read-serial",
  upload.single("image"),
  authorize([{ property: "serialnumber", permission: "create" }]),
  async (req, res) => {
    try {
      const response = await controller.readSerialController(req.file, req.query);
      res.sendData(response);
    } catch (err) {
      res.sendData(err);
    }
  },
);

serialnumberRoutes.post(
  "/sessions",
  authorize([{ property: "session", permission: "create" }]),
  async (req, res) => {
    try {
      const response = await controller.createSessionController(req.body);
      res.sendData(response);
    } catch (err) {
      res.sendData(err);
    }
  },
);

serialnumberRoutes.get(
  "/sessions",
  authorize([{ property: "session", permission: "read" }]),
  async (req, res) => {
    try {
      const response = await controller.getAllSessionsController(req.query.limit as string);
      res.sendData(response);
    } catch (err) {
      res.sendData(err);
    }
  },
);

serialnumberRoutes.get(
  "/sessions/:sessionId",
  authorize([{ property: "session", permission: "read" }]),
  async (req, res) => {
    try {
      const sessionId = Array.isArray(req.params.sessionId)
        ? req.params.sessionId[0]
        : req.params.sessionId;
      const response = await controller.getSessionController(sessionId);
      res.sendData(response);
    } catch (err) {
      res.sendData(err);
    }
  },
);

serialnumberRoutes.get(
  "/sessions/:sessionId/report.csv",
  authorize([{ property: "session", permission: "read" }]),
  async (req, res) => {
    try {
      const sessionId = Array.isArray(req.params.sessionId)
        ? req.params.sessionId[0]
        : req.params.sessionId;
      const result = await controller.getSessionCsvController(sessionId);
      res
        .type("text/csv")
        .attachment(result.filename)
        .send(result.csv);
    } catch (err) {
      res.sendData(err);
    }
  },
);

export default serialnumberRoutes;
