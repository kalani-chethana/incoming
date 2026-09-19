import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Response {
      sendData(payload: any): void;
    }
  }
}

export const responseHandler = (_req: Request, res: Response, next: NextFunction): void => {
  res.sendData = function (payload: any) {
    if (
      payload instanceof Error ||
      (payload && typeof payload.status === "number" && payload.status >= 400)
    ) {
      const statusCode = payload.status || 500;
      const message = payload.message || "Internal server error";
      res.status(statusCode).json({
        status: statusCode,
        message,
        detail: message,
        error: message,
      });
      return;
    }

    const statusCode = payload?.status || 200;
    const message = payload?.message || "Success";
    const data = payload?.data !== undefined ? payload.data : payload;

    // Dual-format support:
    // Unpacks top-level fields for direct consumers while providing structured { status, message, data }
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      res.status(statusCode).json({
        status: statusCode,
        message,
        data,
        ...data,
      });
    } else {
      res.status(statusCode).json({
        status: statusCode,
        message,
        data,
      });
    }
  };
  next();
};

export default responseHandler;

