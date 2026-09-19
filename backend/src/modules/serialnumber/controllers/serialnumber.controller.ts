import { databaseConnection } from "../database/serialnumber_client.js";
import serialnumberEvents, { SERIAL_NUMBER_EVENTS } from "../events/serialnumber.events.js";
import * as repo from "../repository/serialnumber.repository.js";
import type {
  DataResponse,
  ReadSerialQueryParams,
  SessionCreateResult,
  SessionInput,
  SessionRecord,
} from "../types/serialnumber.types.js";
import { ApiError } from "../utils/app_error.js";
import { sessionReportToCsv } from "../utils/csv_helper.js";
import { ocrClient } from "../utils/ocrClient.js";
import HTTP_STATUS from "../utils/status_codes.js";

export const getHealthController = async (): Promise<
  DataResponse<{ status: string; database: string }>
> => {
  const data = { status: "ok", database: "mysql" };
  serialnumberEvents.emit(SERIAL_NUMBER_EVENTS.HEALTH_CHECKED, data);
  return {
    status: HTTP_STATUS.OK,
    message: "Service is healthy",
    data,
  };
};

export const readSerialController = async (
  file: Express.Multer.File | undefined,
  query: ReadSerialQueryParams,
): Promise<DataResponse<any>> => {
  if (!file) {
    throw new ApiError("A JPG, PNG, or WebP image is required.", HTTP_STATUS.BAD_REQUEST);
  }

  const minimumConfidence = Number(query.minimum_confidence ?? 0.3);
  const rawCheckType = String(query.check_type ?? "serial");
  const checkType = rawCheckType === "capacity" ? "weight" : rawCheckType;

  if (!["serial", "part", "weight"].includes(checkType)) {
    throw new ApiError(
      "check_type must be serial, part, weight, or capacity.",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
    );
  }

  if (minimumConfidence < 0.1 || minimumConfidence > 0.9) {
    throw new ApiError(
      "minimum_confidence must be between 0.10 and 0.90.",
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
    );
  }

  const rangeStart = query.range_start ? String(query.range_start) : undefined;
  const rangeEnd = query.range_end ? String(query.range_end) : undefined;
  const expectedPart = (query.expected_part || query.expected_part_number)
    ? String(query.expected_part || query.expected_part_number)
    : undefined;
  const expectedWeight = (query.expected_capacity || query.expected_weight)
    ? String(query.expected_capacity || query.expected_weight)
    : undefined;
  const excludeSerial = query.exclude_serial ? String(query.exclude_serial) : undefined;
  const rawCheckTypes = query.check_types ? String(query.check_types).split(",") : undefined;
  const checkTypes = rawCheckTypes?.map((t) => (t.trim() === "capacity" ? "weight" : t.trim()));

  const extension = file.mimetype.split("/")[1].replace("jpeg", "jpg");

  const result = await ocrClient.read(
    file.buffer,
    extension,
    minimumConfidence,
    checkType,
    {
      checkTypes,
      rangeStart,
      rangeEnd,
      expectedPart,
      expectedWeight,
      excludeSerial,
    },
  );

  serialnumberEvents.emit(SERIAL_NUMBER_EVENTS.SERIAL_SCANNED, result);

  return {
    status: HTTP_STATUS.OK,
    message: "Image processed successfully",
    data: result,
  };
};

export const createSessionController = async (
  body: SessionInput,
): Promise<DataResponse<SessionCreateResult>> => {
  try {
    const record = repo.buildSessionRecord(body);
    const jsonPath = await repo.saveSession(record);
    const data: SessionCreateResult = {
      session_id: record.session_id,
      saved_at: record.saved_at,
      database_connection: databaseConnection,
      json_path: jsonPath,
    };
    serialnumberEvents.emit(SERIAL_NUMBER_EVENTS.SESSION_CREATED, data);
    return {
      status: HTTP_STATUS.CREATED,
      message: "Session created successfully",
      data,
    };
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.message || "Failed to create session", HTTP_STATUS.BAD_REQUEST);
  }
};

export const getSessionController = async (
  rawSessionId: string | number,
): Promise<DataResponse<SessionRecord>> => {
  const sessionId = Number(rawSessionId);
  if (!Number.isSafeInteger(sessionId) || sessionId < 1) {
    throw new ApiError("Invalid session ID.", HTTP_STATUS.BAD_REQUEST);
  }
  const record = await repo.getSessionReport(sessionId);
  if (!record) {
    throw new ApiError("Session not found.", HTTP_STATUS.NOT_FOUND);
  }
  return {
    status: HTTP_STATUS.OK,
    message: "Session retrieved successfully",
    data: record,
  };
};

export const getSessionCsvController = async (
  rawSessionId: string | number,
): Promise<{ csv: string; filename: string; record: SessionRecord }> => {
  const sessionId = Number(rawSessionId);
  if (!Number.isSafeInteger(sessionId) || sessionId < 1) {
    throw new ApiError("Invalid session ID.", HTTP_STATUS.BAD_REQUEST);
  }
  const record = await repo.getSessionReport(sessionId);
  if (!record) {
    throw new ApiError("Session not found.", HTTP_STATUS.NOT_FOUND);
  }
  const csv = sessionReportToCsv(record);
  return {
    csv,
    filename: `forgelens-session-${sessionId}.csv`,
    record,
  };
};

