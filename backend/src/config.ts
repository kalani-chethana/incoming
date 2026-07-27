import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const backendDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const projectDirectory = path.resolve(backendDirectory, "..");

dotenv.config({ path: path.join(backendDirectory, ".env"), quiet: true });

function resolveSetting(value: string | undefined, fallback: string): string {
  const configured = value?.trim() || fallback;
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(backendDirectory, configured);
}

const defaultPython = process.platform === "win32"
  ? path.join(projectDirectory, "venv", "Scripts", "python.exe")
  : path.join(projectDirectory, "venv", "bin", "python");

export const config = {
  backendDirectory,
  projectDirectory,
  port: Number(process.env.PORT || 8000),
  host: process.env.HOST || "127.0.0.1",
  database: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    name: process.env.DB_NAME || "soldering_iron_validation",
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  },
  reportDirectory: resolveSetting(
    process.env.REPORT_DIRECTORY,
    "../data/session_reports",
  ),
  temporaryDirectory: resolveSetting(
    process.env.TEMP_DIRECTORY,
    "../data/temp",
  ),
  pythonExecutable: resolveSetting(
    process.env.PYTHON_EXECUTABLE,
    defaultPython,
  ),
};
