export type ReadingStatus =
  | "In range"
  | "Duplicate"
  | "Out of range"
  | "Not detected";

export interface SessionReading {
  time: string;
  serial: string;
  status: ReadingStatus;
  part_check: "Matched" | "Mismatched" | "Not detected" | "Not checked";
  part_number?: string;
  weight?: string;
  weight_check?: "Matched" | "Mismatched" | "Not detected" | "Not checked";
}

export interface SessionInput {
  range_start: string;
  range_end: string;
  expected_part_number: string;
  selected_checks?: string[];
  expected_weight?: string;
  expected_capacity?: string;
  readings: SessionReading[];
}

export interface OcrResult {
  detected: boolean;
  serial_number: string | null;
  value: string | null;
  check_type: "serial" | "part" | "weight" | "capacity";
  confidence: number;
  enhancement: string | null;
  values?: Record<string, string | null>;
}

export interface SessionRecord {
  session_id: number | null;
  saved_at: string;
  range: { start: string; end: string };
  expected_part_number: string;
  selected_checks: string[];
  expected_weight: string;
  summary: {
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
  };
  readings: SessionReading[];
}

export interface DataResponse<T> {
  status: number;
  message: string;
  data: T;
}

export interface SessionCreateResult {
  session_id: number | null;
  saved_at: string;
  database_connection: string;
  json_path: string;
}

export interface ReadSerialQueryParams {
  minimum_confidence?: string | number;
  check_type?: string;
  range_start?: string;
  range_end?: string;
  expected_part?: string;
  expected_part_number?: string;
  expected_weight?: string;
  expected_capacity?: string;
  exclude_serial?: string;
  check_types?: string;
}

