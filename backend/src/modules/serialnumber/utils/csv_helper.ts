import type { SessionRecord } from "../types/serialnumber.types.js";

export function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function sessionReportToCsv(record: SessionRecord): string {
  const lines: unknown[][] = [
    ["Session ID", record.session_id],
    ["Saved at", record.saved_at],
    ["Range start", record.range.start],
    ["Range end", record.range.end],
    ["Expected part number", record.expected_part_number],
    ["Expected weight", record.expected_weight],
    ["Expected capacity", record.expected_weight],
    ["Selected checks", record.selected_checks.join(" | ")],
    ["Total readings", record.summary.total_readings],
    ["Total detected", record.summary.total_detected],
    ["In-range count", record.summary.in_range.count],
    ["In-range numbers", record.summary.in_range.numbers.join(" | ")],
    ["Duplicate count", record.summary.duplicates.count],
    ["Duplicate numbers", record.summary.duplicates.numbers.join(" | ")],
    ["Out-of-range count", record.summary.out_of_range.count],
    ["Out-of-range numbers", record.summary.out_of_range.numbers.join(" | ")],
    ["Not detected count", record.summary.not_detected_count],
    ["Part matched count", record.summary.part_match_count],
    ["Part mismatched count", record.summary.part_mismatch_count],
    ["Part not detected count", record.summary.part_not_detected_count],
    ["Weight matched count", record.summary.weight_match_count],
    ["Weight mismatched count", record.summary.weight_mismatch_count],
    ["Weight not detected count", record.summary.weight_not_detected_count],
    ["Capacity matched count", record.summary.weight_match_count],
    ["Capacity mismatched count", record.summary.weight_mismatch_count],
    ["Capacity not detected count", record.summary.weight_not_detected_count],
    [],
    ["Time", "Serial number", "Status", "Part number", "Part check", "Weight", "Weight check"],
    ["Time", "Serial number", "Status", "Part number", "Part check", "Capacity", "Capacity check"],
    ...record.readings.map((reading) => [
      reading.time,
      reading.serial,
      reading.status,
      reading.part_number,
      reading.part_check,
      reading.weight,
      reading.weight_check,
    ]),
  ];
  return lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
}

export default sessionReportToCsv;

