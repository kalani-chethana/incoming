import api from "@/lib/api";
import type { DataResponse } from "../types/api.types";
import type {
  CreateSessionResponseData,
  OcrResponseData,
  SessionInput,
  SessionRecord,
  SessionSummaryItem,
} from "../types/serialnumber.type";

export const readSerialImage = async (
  formData: FormData,
  queryParams: Record<string, string>,
): Promise<DataResponse<OcrResponseData>> => {
  const params = new URLSearchParams(queryParams);
  const { data } = await api.post<DataResponse<OcrResponseData>>(
    `/serialnumber/read-serial?${params.toString()}`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
  return data;
};

export const createSession = async (
  sessionInput: SessionInput,
): Promise<DataResponse<CreateSessionResponseData>> => {
  const { data } = await api.post<DataResponse<CreateSessionResponseData>>(
    "/serialnumber/sessions",
    sessionInput,
  );
  return data;
};

export const fetchSession = async (
  sessionId: number,
): Promise<DataResponse<SessionRecord>> => {
  const { data } = await api.get<DataResponse<SessionRecord>>(
    `/serialnumber/sessions/${sessionId}`,
  );
  return data;
};

export const fetchSessions = async (
  limit = 100,
): Promise<DataResponse<SessionSummaryItem[]>> => {
  const { data } = await api.get<DataResponse<SessionSummaryItem[]>>(
    `/serialnumber/sessions?limit=${limit}`,
  );
  return data;
};

export const downloadSessionReportCsv = async (
  sessionId: number,
): Promise<Blob> => {
  const response = await api.get(`/serialnumber/sessions/${sessionId}/report.csv`, {
    responseType: "blob",
  });
  return response.data;
};

export const fetchHealth = async (): Promise<
  DataResponse<{ status: string; database: string }>
> => {
  const { data } = await api.get<DataResponse<{ status: string; database: string }>>(
    "/serialnumber/health",
  );
  return data;
};

