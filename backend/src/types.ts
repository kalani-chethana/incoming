export type ReadingStatus =
  | "In range"
  | "Duplicate"
  | "Out of range"
  | "Not detected";

export interface SessionReading {
  time: string;
  serial: string;
  status: ReadingStatus;
}

export interface SessionInput {
  range_start: string;
  range_end: string;
  readings: SessionReading[];
}

export interface OcrResult {
  detected: boolean;
  serial_number: string | null;
  confidence: number;
  enhancement: string | null;
}

export interface SessionRecord {
  session_id: number | null;
  saved_at: string;
  range: { start: string; end: string };
  summary: {
    total_readings: number;
    total_detected: number;
    in_range: { count: number; numbers: string[] };
    duplicates: { count: number; numbers: string[] };
    out_of_range: { count: number; numbers: string[] };
    not_detected_count: number;
  };
  readings: SessionReading[];
}
