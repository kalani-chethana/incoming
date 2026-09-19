import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";

import responseHandler from "./modules/common/middlewares/response_handler.js";
import { initializeDatabase } from "./modules/serialnumber/database/serialnumber_client.js";
import serialnumberRouter from "./modules/serialnumber/routes/index.js";
import { config } from "./modules/serialnumber/utils/config.js";

export const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(
          origin,
        )
      ) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
  }),
);

app.use(express.json({ limit: "2mb" }));
app.use(responseHandler);

// Modular versioned API route
app.use("/api/v1/serialnumber", serialnumberRouter);

// Direct /api mount for seamless backward-compatibility
app.use("/api", serialnumberRouter);

app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
  response.status(500).json({ detail: error.message || "Unexpected server error." });
});

await initializeDatabase();

export const server = app.listen(config.port, config.host, () => {
  console.log(`ForgeLens API running at http://${config.host}:${config.port}`);
});

export default app;
