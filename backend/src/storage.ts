import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

import { config } from "./config.js";
import type { SessionInput, SessionRecord } from "./types.js";

const reportDirectory = config.reportDirectory;
const pool = mysql.createPool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.name,
  connectionLimit: config.database.connectionLimit,
  waitForConnections: true,
  queueLimit: 0,
});

function validateSession(session: SessionInput): void {
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
    expected_part_number: session.expected_part_number.trim(),
    selected_checks: session.selected_checks ?? ["serial", "part"],
    expected_weight: session.expected_weight?.trim() ?? "",
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

export async function initializeDatabase(): Promise<void> {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS scan_sessions (
      session_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      saved_at VARCHAR(40) NOT NULL,
      range_start VARCHAR(100) NOT NULL,
      range_end VARCHAR(100) NOT NULL,
      expected_part_number VARCHAR(100) NOT NULL,
      expected_weight VARCHAR(100) NOT NULL DEFAULT '',
      total_readings INT NOT NULL,
      total_detected INT NOT NULL,
      in_range_count INT NOT NULL,
      in_range_numbers_json LONGTEXT NOT NULL,
      duplicate_count INT NOT NULL,
      duplicate_numbers_json LONGTEXT NOT NULL,
      out_of_range_count INT NOT NULL,
      out_of_range_numbers_json LONGTEXT NOT NULL,
      not_detected_count INT NOT NULL,
      part_match_count INT NOT NULL,
      part_mismatch_count INT NOT NULL,
      part_not_detected_count INT NOT NULL DEFAULT 0,
      weight_match_count INT NOT NULL DEFAULT 0,
      weight_mismatch_count INT NOT NULL DEFAULT 0,
      weight_not_detected_count INT NOT NULL DEFAULT 0,
      json_file VARCHAR(1024) NOT NULL,
      INDEX idx_scan_sessions_saved_at (saved_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  const [idColumns] = await pool.execute<mysql.RowDataPacket[]>(
    `
      SELECT DATA_TYPE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'scan_sessions'
        AND COLUMN_NAME = 'session_id'
    `,
    [config.database.name],
  );
  if (idColumns[0]?.DATA_TYPE !== "bigint") {
    await pool.execute(`
      ALTER TABLE scan_sessions
        DROP PRIMARY KEY,
        CHANGE COLUMN session_id legacy_session_id VARCHAR(32) NOT NULL,
        ADD COLUMN session_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT
          PRIMARY KEY FIRST
    `);
    await pool.execute(
      "ALTER TABLE scan_sessions DROP COLUMN legacy_session_id",
    );
  }
  const [columns] = await pool.execute<mysql.RowDataPacket[]>(
    `
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'scan_sessions'
        AND COLUMN_NAME = 'full_details_json'
    `,
    [config.database.name],
  );
  if (columns.length > 0) {
    await pool.execute(
      "ALTER TABLE scan_sessions DROP COLUMN full_details_json",
    );
  }
  const requiredColumns = [
    ["expected_part_number", "VARCHAR(100) NOT NULL DEFAULT ''"],
    ["expected_weight", "VARCHAR(100) NOT NULL DEFAULT ''"],
    ["part_match_count", "INT NOT NULL DEFAULT 0"],
    ["part_mismatch_count", "INT NOT NULL DEFAULT 0"],
    ["part_not_detected_count", "INT NOT NULL DEFAULT 0"],
    ["weight_match_count", "INT NOT NULL DEFAULT 0"],
    ["weight_mismatch_count", "INT NOT NULL DEFAULT 0"],
    ["weight_not_detected_count", "INT NOT NULL DEFAULT 0"],
  ];
  for (const [columnName, definition] of requiredColumns) {
    const [existing] = await pool.execute<mysql.RowDataPacket[]>(
      `
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'scan_sessions'
          AND COLUMN_NAME = ?
      `,
      [config.database.name, columnName],
    );
    if (existing.length === 0) {
      await pool.execute(
        `ALTER TABLE scan_sessions ADD COLUMN ${columnName} ${definition}`,
      );
    }
  }
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS scan_readings (
      reading_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      session_id BIGINT UNSIGNED NOT NULL,
      captured_at VARCHAR(40) NOT NULL,
      serial_number VARCHAR(100) NOT NULL,
      serial_status VARCHAR(30) NOT NULL,
      part_number VARCHAR(100) NOT NULL,
      part_check VARCHAR(30) NOT NULL,
      weight_number VARCHAR(100) NOT NULL,
      weight_check VARCHAR(30) NOT NULL,
      INDEX idx_scan_readings_session_id (session_id),
      CONSTRAINT fk_scan_readings_session
        FOREIGN KEY (session_id) REFERENCES scan_sessions(session_id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function saveSession(record: SessionRecord): Promise<string> {
  await initializeDatabase();
  await mkdir(reportDirectory, { recursive: true });
  const connection = await pool.getConnection();
  let jsonPath: string | null = null;
  try {
    await connection.beginTransaction();
    const summary = record.summary;
    const [insertResult] = await connection.execute<mysql.ResultSetHeader>(`
      INSERT INTO scan_sessions (
        saved_at, range_start, range_end, expected_part_number, expected_weight,
        total_readings, total_detected,
        in_range_count, in_range_numbers_json,
        duplicate_count, duplicate_numbers_json,
        out_of_range_count, out_of_range_numbers_json,
        not_detected_count, part_match_count, part_mismatch_count,
        part_not_detected_count, weight_match_count, weight_mismatch_count,
        weight_not_detected_count, json_file
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
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
    ]);
    record.session_id = insertResult.insertId;
    for (const reading of record.readings) {
      await connection.execute(`
        INSERT INTO scan_readings (
          session_id, captured_at, serial_number, serial_status,
          part_number, part_check, weight_number, weight_check
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        record.session_id,
        reading.time,
        reading.serial,
        reading.status,
        reading.part_number ?? "Not checked",
        reading.part_check,
        reading.weight ?? "Not checked",
        reading.weight_check ?? "Not checked",
      ]);
    }
    jsonPath = path.join(reportDirectory, `${record.session_id}.json`);
    const temporaryPath = `${jsonPath}.tmp`;
    const jsonText = JSON.stringify(record, null, 2);
    await writeFile(temporaryPath, jsonText, "utf8");
    await rename(temporaryPath, jsonPath);
    await connection.execute(
      "UPDATE scan_sessions SET json_file = ? WHERE session_id = ?",
      [jsonPath, record.session_id],
    );
    await connection.commit();
    return jsonPath;
  } catch (error) {
    await connection.rollback();
    if (jsonPath) await unlink(jsonPath).catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

export async function getSessionReport(sessionId: number): Promise<SessionRecord | null> {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    "SELECT json_file FROM scan_sessions WHERE session_id = ?",
    [sessionId],
  );
  if (rows.length === 0) return null;
  const jsonText = await readFile(String(rows[0].json_file), "utf8");
  return JSON.parse(jsonText) as SessionRecord;
}

function csvCell(value: unknown): string {
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
    [],
    ["Time", "Serial number", "Status", "Part number", "Part check", "Weight", "Weight check"],
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

export const databaseConnection =
  `mysql://${config.database.host}:${config.database.port}/${config.database.name}`;
