import mysql from "mysql2/promise";
import { config } from "../utils/config.js";

export const pool = mysql.createPool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.name,
  connectionLimit: config.database.connectionLimit,
  waitForConnections: true,
  queueLimit: 0,
});

export const serialnumberClient = pool;

export const databaseConnection =
  `mysql://${config.database.host}:${config.database.port}/${config.database.name}`;

export async function pingTest(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    return true;
  } catch (error) {
    console.error("[Database] Ping test failed:", error);
    return false;
  }
}

export async function backupDatabase(): Promise<{ status: string; timestamp: string }> {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
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
    await pool.execute("ALTER TABLE scan_sessions DROP COLUMN legacy_session_id");
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
    await pool.execute("ALTER TABLE scan_sessions DROP COLUMN full_details_json");
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

export default serialnumberClient;

