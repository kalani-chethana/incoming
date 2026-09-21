import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type mysql from "mysql2/promise";

import serialnumberClient, { initializeDatabase } from "../database/serialnumber_client.js";
import type { SessionInput, SessionRecord, SessionSummaryItem } from "../types/serialnumber.types.js";
import { config } from "../utils/config.js";

const reportDirectory = config.reportDirectory;

export function validateSession(session: SessionInput): void {
  if (!/^\d+$/.test(session.range_start) || !/^\d+$/.test(session.range_end)) {
    throw new Error("Serial range must contain digits only.");
  }
  if (BigInt(session.range_start) > BigInt(session.range_end)) {
    throw new Error("Range start must not exceed range end.");
  }
  if (!session.readings.length) {
    throw new Error("A session must contain at least one reading.");
  }
  if (session.selected_checks?.includes("part") && !session.expected_part_number?.trim()) {
    throw new Error("Expected part number is required.");
  }
}

export function buildSessionRecord(session: SessionInput): SessionRecord {
  validateSession(session);
  const inRange = session.readings.filter((item) => item.status === "In range");
  const duplicates = session.readings.filter((item) => item.status === "Duplicate");
  const outOfRange = session.readings.filter((item) => item.status === "Out of range");
  const notDetected = session.readings.filter((item) => item.status === "Not detected");
  return {
    session_id: null,
    saved_at: new Date().toISOString(),
    range: { start: session.range_start, end: session.range_end },
    expected_part_number: session.expected_part_number?.trim() ?? "",
    selected_checks: session.selected_checks ?? ["serial", "part"],
    expected_weight: (session.expected_capacity || session.expected_weight)?.trim() ?? "",
    summary: {
      total_readings: session.readings.length,
      total_detected: session.readings.length - notDetected.length,
      in_range: { count: inRange.length, numbers: inRange.map((item) => item.serial) },
      duplicates: { count: duplicates.length, numbers: duplicates.map((item) => item.serial) },
      out_of_range: {
        count: outOfRange.length,
        numbers: outOfRange.map((item) => item.serial),
      },
      not_detected_count: notDetected.length,
      part_match_count: session.readings.filter(
        (item) => item.part_check === "Matched",
      ).length,
      part_mismatch_count: session.readings.filter(
        (item) => item.part_check === "Mismatched",
      ).length,
      part_not_detected_count: session.readings.filter(
        (item) => item.part_check === "Not detected",
      ).length,
      weight_match_count: session.readings.filter(
        (item) => item.weight_check === "Matched",
      ).length,
      weight_mismatch_count: session.readings.filter(
        (item) => item.weight_check === "Mismatched",
      ).length,
      weight_not_detected_count: session.readings.filter(
        (item) => item.weight_check === "Not detected",
      ).length,
    },
    readings: session.readings,
  };
}

export const saveSession = async (
  record: SessionRecord,
  tx?: mysql.Connection,
): Promise<string> => {
  await initializeDatabase();
  await mkdir(reportDirectory, { recursive: true });

  const client = tx || (await serialnumberClient.getConnection());
  const isDedicatedTx = Boolean(tx);
  let jsonPath: string | null = null;

  try {
    if (!isDedicatedTx) {
      await (client as mysql.PoolConnection).beginTransaction();
    }
    const summary = record.summary;
    const [insertResult] = await client.query<mysql.ResultSetHeader>(
      `INSERT INTO scan_sessions (
        saved_at, range_start, range_end, expected_part_number, expected_weight,
        total_readings, total_detected,
        in_range_count, in_range_numbers_json,
        duplicate_count, duplicate_numbers_json,
        out_of_range_count, out_of_range_numbers_json,
        not_detected_count, part_match_count, part_mismatch_count,
        part_not_detected_count, weight_match_count, weight_mismatch_count,
        weight_not_detected_count, json_file
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.saved_at,
        record.range.start,
        record.range.end,
        record.expected_part_number,
        record.expected_weight,
        summary.total_readings,
        summary.total_detected,
        summary.in_range.count,
        JSON.stringify(summary.in_range.numbers),
        summary.duplicates.count,
        JSON.stringify(summary.duplicates.numbers),
        summary.out_of_range.count,
        JSON.stringify(summary.out_of_range.numbers),
        summary.not_detected_count,
        summary.part_match_count,
        summary.part_mismatch_count,
        summary.part_not_detected_count,
        summary.weight_match_count,
        summary.weight_mismatch_count,
        summary.weight_not_detected_count,
        "",
      ],
    );

    record.session_id = insertResult.insertId;

    for (const reading of record.readings) {
      await client.query(
        `INSERT INTO scan_readings (
          session_id, captured_at, serial_number, serial_status,
          part_number, part_check, weight_number, weight_check
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.session_id,
          reading.time,
          reading.serial,
          reading.status,
          reading.part_number ?? "Not checked",
          reading.part_check,
          reading.weight ?? "Not checked",
          reading.weight_check ?? "Not checked",
        ],
      );
    }

    jsonPath = path.join(reportDirectory, `${record.session_id}.json`);
    const temporaryPath = `${jsonPath}.tmp`;
    const jsonText = JSON.stringify(record, null, 2);
    await writeFile(temporaryPath, jsonText, "utf8");
    await rename(temporaryPath, jsonPath);

    await client.query(
      "UPDATE scan_sessions SET json_file = ? WHERE session_id = ?",
      [jsonPath, record.session_id],
    );

    if (!isDedicatedTx) {
      await (client as mysql.PoolConnection).commit();
    }
    return jsonPath;
  } catch (error) {
    if (!isDedicatedTx) {
      await (client as mysql.PoolConnection).rollback();
    }
    if (jsonPath) await unlink(jsonPath).catch(() => undefined);
    throw error;
  } finally {
    if (!isDedicatedTx) {
      (client as mysql.PoolConnection).release();
    }
  }
};

export const getSessionReport = async (
  sessionId: number,
  tx?: mysql.Connection,
): Promise<SessionRecord | null> => {
  const client = tx || serialnumberClient;
  const [rows] = await client.query<mysql.RowDataPacket[]>(
    "SELECT json_file FROM scan_sessions WHERE session_id = ?",
    [sessionId],
  );
  if (rows.length === 0) return null;
  const jsonText = await readFile(String(rows[0].json_file), "utf8");
  return JSON.parse(jsonText) as SessionRecord;
};

export const getAllSessions = async (
  limit = 100,
  tx?: mysql.Connection,
): Promise<SessionSummaryItem[]> => {
  try {
    const client = tx || serialnumberClient;
    const [rows] = await client.query<mysql.RowDataPacket[]>(
      `SELECT
        session_id, saved_at, range_start, range_end,
        expected_part_number, expected_weight,
        total_readings, total_detected,
        in_range_count, duplicate_count, out_of_range_count, not_detected_count,
        part_match_count, part_mismatch_count,
        weight_match_count, weight_mismatch_count
      FROM scan_sessions
      ORDER BY session_id DESC
      LIMIT ?`,
      [Number(limit) || 100],
    );
    if (rows && rows.length > 0) {
      return rows as SessionSummaryItem[];
    }
  } catch (err) {
    console.warn("[Repository] Failed to query scan_sessions from database, falling back to JSON files:", err);
  }

  // Fallback: Read JSON files from reportDirectory
  try {
    const files = await readdir(reportDirectory);
    const jsonFiles = files
      .filter((f) => f.endsWith(".json") && /^\d+\.json$/.test(f))
      .sort((a, b) => parseInt(b, 10) - parseInt(a, 10))
      .slice(0, Number(limit) || 100);

    const summaries: SessionSummaryItem[] = [];
    for (const file of jsonFiles) {
      try {
        const content = await readFile(path.join(reportDirectory, file), "utf8");
        const parsed = JSON.parse(content) as SessionRecord;
        summaries.push({
          session_id: parsed.session_id || parseInt(file, 10),
          saved_at: parsed.saved_at,
          range_start: parsed.range?.start ?? "",
          range_end: parsed.range?.end ?? "",
          expected_part_number: parsed.expected_part_number ?? "",
          expected_weight: parsed.expected_weight ?? "",
          total_readings: parsed.summary?.total_readings ?? parsed.readings?.length ?? 0,
          total_detected: parsed.summary?.total_detected ?? 0,
          in_range_count: parsed.summary?.in_range?.count ?? 0,
          duplicate_count: parsed.summary?.duplicates?.count ?? 0,
          out_of_range_count: parsed.summary?.out_of_range?.count ?? 0,
          not_detected_count: parsed.summary?.not_detected_count ?? 0,
          part_match_count: parsed.summary?.part_match_count ?? 0,
          part_mismatch_count: parsed.summary?.part_mismatch_count ?? 0,
          weight_match_count: parsed.summary?.weight_match_count ?? 0,
          weight_mismatch_count: parsed.summary?.weight_mismatch_count ?? 0,
        });
      } catch {
        // ignore malformed files
      }
    }
    return summaries;
  } catch {
    return [];
  }
};

