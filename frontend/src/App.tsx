import { useEffect, useRef, useState } from "react";

function ScanIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10M8 9h8M9 15h6" />
    </svg>
  );
}

function App() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [result, setResult] = useState(null);
  const [readings, setReadings] = useState([]);
  const [error, setError] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [finished, setFinished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedSession, setSavedSession] = useState(null);

  const validRange =
    rangeStart.length > 0 &&
    rangeEnd.length > 0 &&
    BigInt(rangeStart) <= BigInt(rangeEnd);
  const rangeInvalid =
    rangeStart.length > 0 &&
    rangeEnd.length > 0 &&
    BigInt(rangeStart) > BigInt(rangeEnd);

  const summary = {
    inRange: readings.filter((reading) => reading.status === "In range").length,
    duplicates: readings.filter((reading) => reading.status === "Duplicate").length,
    outOfRange: readings.filter((reading) => reading.status === "Out of range").length,
    notDetected: readings.filter((reading) => reading.status === "Not detected").length,
  };

  useEffect(() => {
    if (!file) {
      setPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      if (!validRange || finished || file) return;
      setCameraError("");
      setCameraReady(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Live camera requires localhost or HTTPS.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (cameraFailure) {
        const messages = {
          NotAllowedError: "Camera permission is blocked in Edge.",
          NotFoundError: "No camera was found on this device.",
          NotReadableError: "The camera is being used by another application.",
        };
        setCameraError(messages[cameraFailure.name] || "The camera could not be started.");
      }
    }

    startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [validRange, finished, file]);

  function serialIsInRange(serial) {
    const value = BigInt(serial);
    return value >= BigInt(rangeStart) && value <= BigInt(rangeEnd);
  }

  async function readSerial(imageFile) {
    if (!imageFile || isReading) return;
    setIsReading(true);
    setError("");
    const form = new FormData();
    form.append("image", imageFile);

    try {
      const response = await fetch(
        "/api/read-serial?minimum_confidence=0.30",
        { method: "POST", body: form },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "The image could not be processed.");

      let status = "Not detected";
      if (payload.detected) {
        if (!serialIsInRange(payload.serial_number)) {
          status = "Out of range";
        } else if (readings.some((reading) => reading.serial === payload.serial_number)) {
          status = "Duplicate";
        } else {
          status = "In range";
        }
      }

      setResult({ ...payload, status });
      setReadings((current) => [
        {
          id: `${Date.now()}-${payload.serial_number || "none"}`,
          time: new Date().toLocaleTimeString(),
          serial: payload.serial_number || "Not detected",
          status,
        },
        ...current,
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof TypeError
          ? "Cannot reach the OCR server. Make sure the backend is running."
          : requestError.message,
      );
    } finally {
      setIsReading(false);
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video?.videoHeight) return Promise.resolve(null);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(
          blob
            ? new File([blob], "camera-capture.jpg", { type: "image/jpeg" })
            : null,
        );
      }, "image/jpeg", 0.95);
    });
  }

  async function captureAndRead() {
    const capturedFile = await capturePhoto();
    if (!capturedFile) return;
    setFile(capturedFile);
    await readSerial(capturedFile);
    setFile(null);
  }

  async function finishSession() {
    setIsSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          range_start: rangeStart,
          range_end: rangeEnd,
          readings: readings
            .slice()
            .reverse()
            .map(({ time, serial, status }) => ({ time, serial, status })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "The session could not be saved.");
      setSavedSession(payload);
      setFinished(true);
    } catch (requestError) {
      setSaveError(
        requestError instanceof TypeError
          ? "Cannot reach the server. The session was not saved."
          : requestError.message,
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadReport() {
    if (!savedSession?.session_id) return;
    setSaveError("");
    try {
      const response = await fetch(
        `/api/sessions/${savedSession.session_id}/report.csv`,
      );
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.detail || "The CSV report could not be downloaded.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `forgelens-session-${savedSession.session_id}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setSaveError(requestError.message);
    }
  }

  function startNewSession() {
    setFinished(false);
    setReadings([]);
    setResult(null);
    setError("");
    setSaveError("");
    setSavedSession(null);
    setRangeStart("");
    setRangeEnd("");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="ForgeLens home">
          <span className="brand-mark"><ScanIcon /></span>
          <span>ForgeLens</span>
        </a>
      </header>

      <section className="workspace">
        <div className="panel capture-panel">
          <div className="serial-range">
            <label>
              <span>Start serial number</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 7700000"
                value={rangeStart}
                disabled={readings.length > 0 || finished}
                onChange={(event) => setRangeStart(event.target.value.replace(/\D/g, ""))}
              />
            </label>
            <label>
              <span>End serial number</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 7799999"
                value={rangeEnd}
                disabled={readings.length > 0 || finished}
                onChange={(event) => setRangeEnd(event.target.value.replace(/\D/g, ""))}
              />
            </label>
          </div>
          {rangeInvalid && <p className="range-error">End serial must be greater than or equal to start serial.</p>}

          {!validRange || finished ? (
            <div className="camera-view camera-waiting">
              <div className="camera-message">
                {finished ? "Session finished" : "Enter a valid start and end range to activate the camera."}
              </div>
            </div>
          ) : preview ? (
            <div className="preview">
              <img src={preview} alt="Captured serial number surface" />
              <span>Reading captured photo</span>
            </div>
          ) : (
            <div className="camera-view">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                aria-label="Live camera preview"
                onLoadedMetadata={(event) => event.currentTarget.play().catch(() => {})}
                onCanPlay={() => setCameraReady(true)}
              />
              {!cameraReady && !cameraError && <div className="camera-message">Starting camera…</div>}
              {cameraError && <div className="camera-message">{cameraError}</div>}
            </div>
          )}

          <button
            className="primary-button"
            disabled={!validRange || finished || isReading || !cameraReady}
            onClick={captureAndRead}
          >
            {isReading
              ? <><span className="spinner" /> Reading surface…</>
              : <><ScanIcon /> Capture & read</>}
          </button>

          <div className={`detected-value status-${result?.status?.toLowerCase().replaceAll(" ", "-") || "empty"}`}>
            <span>Detected serial number</span>
            <strong>{error ? "Read error" : result?.serial_number || (result ? "Not detected" : "—")}</strong>
            {result && <small>{result.status}</small>}
          </div>
        </div>

        <div className="panel readings-panel">
          <div className="panel-heading">
            <div><h2>OCR result</h2></div>
          </div>

          {readings.length === 0 ? (
            <div className="empty-readings">Captured readings will be stored in this table.</div>
          ) : (
            <div className="readings-grid">
              <div className="reading-row reading-header">
                <span>Time</span>
                <span>Serial number</span>
                <span>Status</span>
              </div>
              {readings.map((reading) => (
                <div
                  className={`reading-row row-${reading.status.toLowerCase().replaceAll(" ", "-")}`}
                  key={reading.id}
                >
                  <span data-label="Time">{reading.time}</span>
                  <strong data-label="Serial number">{reading.serial}</strong>
                  <span data-label="Status" className="status-label">{reading.status}</span>
                </div>
              ))}
            </div>
          )}

          {!finished ? (
            <button
              className="finish-button"
              disabled={readings.length === 0 || isReading || isSaving}
              onClick={finishSession}
            >
              {isSaving ? "Saving session…" : "Finish session"}
            </button>
          ) : (
            <>
              <div className="summary">
                <h3>Session summary</h3>
                {savedSession && (
                  <p className="saved-message">
                    Saved to database and JSON · ID {savedSession.session_id}
                  </p>
                )}
                <div className="summary-grid">
                  <div><strong>{summary.inRange}</strong><span>In-range pieces</span></div>
                  <div><strong>{summary.duplicates}</strong><span>Duplicates</span></div>
                  <div><strong>{summary.outOfRange}</strong><span>Out of range</span></div>
                  <div><strong>{summary.notDetected}</strong><span>Not detected</span></div>
                </div>
              </div>
              <div className="report-actions">
                <button className="primary-button" onClick={downloadReport}>Download CSV</button>
                <button className="finish-button" onClick={startNewSession}>Start new range</button>
              </div>
            </>
          )}
          {saveError && <p className="save-error">{saveError}</p>}
        </div>
      </section>

      <footer>Images are processed locally by your ForgeLens server and are not saved.</footer>
    </main>
  );
}

export default App;
