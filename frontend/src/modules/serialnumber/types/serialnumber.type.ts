export interface CheckItem {
  id: "serial" | "part" | "weight" | "capacity";
  label: string;
}

export interface ReadingRow {
  id: number;
  time: string;
  serial: string;
  status: string;
  part_number: string;
  part_check: string;
  weight: string;
  weight_check: string;
}

export interface ResultState {
  type: string;
  value: string | null;
  attempt: number;
  extraSummary?: string;
}

export interface SessionReading {
  time: string;
  serial: string;
  status: string;
  part_check: string;
  part_number?: string;
  weight?: string;
  weight_check?: string;
}

export interface SessionInput {
  range_start: string;
  range_end: string;
  expected_part_number: string;
  selected_checks?: string[];
  expected_weight?: string;
  readings: SessionReading[];
}

export interface SessionSummary {
  total_readings: number;
  total_detected: number;
  in_range: { count: number; numbers: string[] };
  duplicates: { count: number; numbers: string[] };
  out_of_range: { count: number; numbers: string[] };
  not_detected_count: number;
  part_match_count: number;
  part_mismatch_count: number;
  part_not_detected_count: number;
  weight_match_count: number;
  weight_mismatch_count: number;
  weight_not_detected_count: number;
}

export interface SessionRecord {
  session_id: number | null;
  saved_at: string;
  range: { start: string; end: string };
  expected_part_number: string;
  selected_checks: string[];
  expected_weight: string;
  summary: SessionSummary;
  readings: SessionReading[];
}

export interface OcrResponseData {
  detected: boolean;
  serial_number: string | null;
  value: string | null;
  check_type: "serial" | "part" | "weight" | "capacity";
  confidence: number;
  enhancement: string | null;
  values?: Record<string, string | null>;
}

export interface CreateSessionResponseData {
  session_id: number;
  saved_at: string;
  database_connection: string;
  json_path: string;
}

