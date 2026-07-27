# ForgeLens

ForgeLens is a React and FastAPI application for reading engraved or stamped
serial numbers from metal surfaces. PaddleOCR compares multiple enhanced image
variants and returns only a digit row containing at least seven digits.

The OCR filter:

- ignores lettered labels such as `25lb`;
- does not join numbers from different text rows;
- joins serial fragments found on the same row;
- rejects numbers shorter than seven digits.

## Project structure

```text
backend/
  ocr_worker.py  The only Python backend file; PaddleOCR detection only
  src/
    server.ts    Express API routes
    ocrClient.ts Persistent bridge to the Python OCR worker
    storage.ts   MySQL and JSON persistence
    types.ts     Shared backend data types
frontend/        React TypeScript application powered by Vite
models/          Project-local PaddleOCR models
```

## Install

From PowerShell in the project directory:

```powershell
venv\Scripts\python.exe -m pip install -r requirements.txt
cd backend
npm.cmd install
cd ..\frontend
npm.cmd install
```

Python dependencies are used only by `backend/ocr_worker.py`. All API, database,
JSON report, range, duplicate, and session logic is TypeScript.

## Environment configuration

The backend reads its database connection and runtime paths from
`backend/.env`:

```dotenv
HOST=127.0.0.1
PORT=5000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=change_me
DB_NAME=incoming_db
DB_CONNECTION_LIMIT=10
REPORT_DIRECTORY=../data/session_reports
TEMP_DIRECTORY=../data/temp
PYTHON_EXECUTABLE=../venv/Scripts/python.exe
```

The TypeScript backend uses these settings to create a MySQL connection pool.
The `incoming_db` database must already exist; the
`scan_sessions` table is created automatically. Relative report and temporary
paths are resolved from the `backend` directory. `backend/.env` is ignored by
Git.

## Run

Start the frontend and backend together from the project root:

```powershell
bun install
bun run dev
```

The Bun workspace runner starts both services in parallel. The TypeScript
backend runs at `http://127.0.0.1:5000`, and React runs at
`http://localhost:5173`. The backend automatically starts and reuses the
Python OCR worker. Override its interpreter when necessary with the
`PYTHON_EXECUTABLE` environment variable.

Open `http://localhost:5173`. Vite proxies `/api` requests to the TypeScript
server at `http://127.0.0.1:5000`.

## Saved session data

Selecting **Finish session** saves the same session record in two locations:

```text
MySQL scan_sessions table        Session database records
data/session_reports/<id>.json   Full JSON report
```

The MySQL `scan_sessions` table stores the selected range, total readings,
total detected pieces, in-range count and numbers, duplicate count and numbers,
out-of-range count and numbers, not-detected count, and the JSON report file
location. `session_id` is a MySQL auto-increment number beginning at `1`.
The matching report file contains the session ID, summary, number
lists, and complete timestamped reading list.

The backend keeps the complete session as a JSON file and exposes it through
`GET /api/sessions/:sessionId`. The **Download CSV** button downloads the same
session summary and full reading list from
`GET /api/sessions/:sessionId/report.csv`.

## Test and build

```powershell
cd backend
npm.cmd run typecheck
npm.cmd run build
cd frontend
npm.cmd run typecheck
npm.cmd run build
```
