import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createSession,
  downloadSessionReportCsv,
  fetchHealth,
  fetchSession,
  readSerialImage,
} from "../api/serialnumber.api";
import type { SessionInput } from "../types/serialnumber.type";

export const SERIAL_NUMBER_QUERY_KEYS = {
  health: ["serialnumber", "health"] as const,
  session: (id: number) => ["serialnumber", "session", id] as const,
};

export const useHealthQuery = () => {
  return useQuery({
    queryKey: SERIAL_NUMBER_QUERY_KEYS.health,
    queryFn: fetchHealth,
    staleTime: 1000 * 60,
  });
};

export const useSessionQuery = (sessionId: number | null) => {
  return useQuery({
    queryKey: SERIAL_NUMBER_QUERY_KEYS.session(sessionId || 0),
    queryFn: () => fetchSession(sessionId!),
    enabled: Boolean(sessionId && sessionId > 0),
  });
};

export const useReadSerialMutation = () => {
  return useMutation({
    mutationFn: ({
      formData,
      queryParams,
    }: {
      formData: FormData;
      queryParams: Record<string, string>;
    }) => readSerialImage(formData, queryParams),
  });
};

export const useCreateSessionMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionInput: SessionInput) => createSession(sessionInput),
    onSuccess: (data) => {
      const sessionId = data.data?.session_id ?? (data as any)?.session_id;
      toast.success(`Session saved successfully (ID: ${sessionId})`);
      if (sessionId) {
        queryClient.invalidateQueries({
          queryKey: SERIAL_NUMBER_QUERY_KEYS.session(sessionId),
        });
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save session");
    },
  });
};

export const downloadCsvBlob = async (sessionId: number): Promise<void> => {
  try {
    const blob = await downloadSessionReportCsv(sessionId);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `session-${sessionId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV report downloaded");
  } catch (error: any) {
    toast.error(error.message || "Failed to download CSV");
  }
};

