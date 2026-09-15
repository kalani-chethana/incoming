import { useEffect, useRef, useState } from "react";

const CHECKS = [
  { id: "serial", label: "Serial number" },
  { id: "part", label: "Part number" },
  { id: "weight", label: "Weight number" },
];

function ScanIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10M8 9h8M9 15h6" /></svg>;
}

function App() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [selected, setSelected] = useState({ serial: true, part: true, weight: true });
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [expectedPart, setExpectedPart] = useState("");
  const [expectedWeight, setExpectedWeight] = useState("");
  const [started, setStarted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [piece, setPiece] = useState({});
  const [result, setResult] = useState(null);
  const [readings, setReadings] = useState([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [finished, setFinished] = useState(false);
  const [savedSession, setSavedSession] = useState(null);
  const [saveError, setSaveError] = useState("");

  const steps = CHECKS.filter((check) => selected[check.id]);
  const currentStep = steps[stepIndex];
  const serialConfigured = !selected.serial || (
    rangeStart && rangeEnd && BigInt(rangeStart) <= BigInt(rangeEnd)
  );
  const configurationReady = steps.length > 0 && serialConfigured &&
    (!selected.part || expectedPart.trim()) &&
    (!selected.weight || expectedWeight.trim());

  useEffect(() => {
    if (!started || !configurationReady || finished) return;
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({
      video: { facingMode: { ideal: "environment" } }, audio: false,
    }).then((stream) => {
      if (cancelled) return stream.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    }).catch((error) => {
      const messages = {
        NotAllowedError: "Camera permission is blocked in Edge.",
        NotFoundError: "No camera was found.",
        NotReadableError: "The camera is being used by another application.",
      };
      setCameraError(messages[error.name] || "The camera could not be started.");
    });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [started, configurationReady, finished]);

  function normalize(value) {
    return value.trim().toUpperCase().replace(/[_–—]/g, "-").replace(/\s+/g, " ");
  }

  function normalizeWeight(value) {
    return value.trim().toUpperCase().replace(/\s+/g, "");
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth) return Promise.resolve(null);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(
      blob ? new File([blob], "capture.jpg", { type: "image/jpeg" }) : null
    ), "image/jpeg", .95));
  }

  function finishPiece(values) {
    const serial = values.serial || "Not detected";
    let status = selected.serial ? "Not detected" : "Not checked";
    if (values.serial) {
      const numeric = BigInt(values.serial.replace(/\D/g, ""));
      if (numeric < BigInt(rangeStart) || numeric > BigInt(rangeEnd)) status = "Out of range";
      else if (readings.some((item) => item.serial.replace(/\D/g, "") === values.serial.replace(/\D/g, ""))) status = "Duplicate";
      else status = "In range";
    }
    const row = {
      id: Date.now(), time: new Date().toLocaleTimeString(), serial, status,
      part_number: values.part || (selected.part ? "Not detected" : "Not checked"),
      part_check: !selected.part ? "Not checked" : !values.part ? "Not detected" : normalize(values.part) === normalize(expectedPart) ? "Matched" : "Mismatched",
      weight: values.weight || (selected.weight ? "Not detected" : "Not checked"),
      weight_check: !selected.weight ? "Not checked" : !values.weight ? "Not detected" : normalizeWeight(values.weight) === normalizeWeight(expectedWeight) ? "Matched" : "Mismatched",
    };
    setReadings((items) => [row, ...items]);
    setPiece({});
    setStepIndex(0);
    setAttemptCount(0);
  }

  async function parseJsonResponse(response, defaultError) {
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const message = payload?.detail || payload?.error || (text && text.length < 200 ? text : null) || `${defaultError} (HTTP ${response.status})`;
      throw new Error(message);
    }
    return payload || {};
  }

  async function readImage(image) {
    if (!image || !currentStep) return;
    setIsReading(true);
    setSaveError("");
    try {
      const form = new FormData();
      form.append("image", image);
      const response = await fetch(`/api/read-serial?check_type=${currentStep.id}&minimum_confidence=0.30`, { method: "POST", body: form });
      const payload = await parseJsonResponse(response, "OCR failed");
      const value = payload.value || null;
      const attempt = attemptCount + 1;
      setResult({ type: currentStep.id, value, attempt });
      if (!value && attempt < 3) {
        setAttemptCount(attempt);
        return;
      }
      setAttemptCount(0);
      const nextPiece = { ...piece, [currentStep.id]: value };
      setPiece(nextPiece);
      if (stepIndex === steps.length - 1) finishPiece(nextPiece);
      else setStepIndex((index) => index + 1);
    } catch (error) {
      setSaveError(
        error instanceof TypeError
          ? "Cannot reach the OCR server. Please check backend connection."
          : error.message || "An unexpected error occurred."
      );
    } finally {
      setIsReading(false);
    }
  }

  async function captureAndRead() {
    await readImage(await capturePhoto());
  }

  async function uploadAndRead(event) {
    const image = event.target.files?.[0];
    event.target.value = "";
    if (image) await readImage(image);
  }

  async function finishSession() {
    setSaveError("");
    try {
      const response = await fetch("/api/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          range_start: rangeStart || "0", range_end: rangeEnd || "0",
          expected_part_number: expectedPart,
          selected_checks: steps.map((step) => step.id),
          expected_weight: expectedWeight,
          readings: readings.slice().reverse(),
        }),
      });
      const payload = await parseJsonResponse(response, "Session could not be saved");
      setSavedSession(payload); setFinished(true);
    } catch (error) {
      setSaveError(
        error instanceof TypeError
          ? "Cannot reach the database server. Please check backend connection."
          : error.message || "Session could not be saved."
      );
    }
  }

  async function downloadReport() {
    const response = await fetch(`/api/sessions/${savedSession.session_id}/report.csv`);
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url; link.download = `forgelens-session-${savedSession.session_id}.csv`; link.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setFinished(false); setSavedSession(null); setReadings([]); setResult(null);
    setPiece({}); setStepIndex(0); setRangeStart(""); setRangeEnd("");
    setAttemptCount(0);
    setExpectedPart(""); setExpectedWeight("");
    setCameraReady(false); setCameraError("");
    setStarted(false);
  }

  return <main className="shell">
    {started && <section className="inspection-overview">
      <div className="overview-values">
        {selected.serial && <div><span>Serial range</span><strong>{rangeStart} – {rangeEnd}</strong></div>}
        {selected.part && <div><span>Part number</span><strong>{expectedPart}</strong></div>}
        {selected.weight && <div><span>Weight</span><strong>{expectedWeight}</strong></div>}
      </div>
      <div className="flow-steps">
        {steps.map((step, index) => {
          const completed = Object.prototype.hasOwnProperty.call(piece, step.id);
          const active = index === stepIndex && !finished;
          return <div className={`flow-step ${active ? "active" : ""} ${completed ? "complete" : ""}`} key={step.id}>
            <span>{completed ? "✓" : index + 1}</span><strong>{step.label}</strong>
          </div>;
        })}
      </div>
    </section>}
    <section className={`workspace ${!started ? "setup-workspace" : ""}`}>
      <div className="panel capture-panel">
        {!started && <div className="operator-setup">
          <div className="operator-heading"><span>1</span><div><h2>Set up inspection</h2><p>Select checks and enter the required values.</p></div></div>
          <div className="operator-rows">
            <div className={`operator-row ${selected.serial ? "selected" : ""}`}>
              <label className="operator-check"><input type="checkbox" checked={selected.serial} onChange={(e) => setSelected({ ...selected, serial: e.target.checked })} /><span>Serial number</span></label>
              <div className="operator-inputs">{selected.serial ? <><label><span>Range start</span><input inputMode="numeric" value={rangeStart} onChange={(e) => setRangeStart(e.target.value.replace(/\D/g, ""))} placeholder="7700000" /></label><label><span>Range end</span><input inputMode="numeric" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value.replace(/\D/g, ""))} placeholder="7799999" /></label></> : <span className="select-hint">Tick to add serial range</span>}</div>
            </div>
            <div className={`operator-row ${selected.part ? "selected" : ""}`}>
              <label className="operator-check"><input type="checkbox" checked={selected.part} onChange={(e) => setSelected({ ...selected, part: e.target.checked })} /><span>Part number</span></label>
              <div className="operator-inputs">{selected.part ? <label><span>Expected part number</span><input value={expectedPart} onChange={(e) => setExpectedPart(e.target.value)} placeholder="07-1076 05" /></label> : <span className="select-hint">Tick to add part number</span>}</div>
            </div>
            <div className={`operator-row ${selected.weight ? "selected" : ""}`}>
              <label className="operator-check"><input type="checkbox" checked={selected.weight} onChange={(e) => setSelected({ ...selected, weight: e.target.checked })} /><span>Weight number</span></label>
              <div className="operator-inputs">{selected.weight ? <label><span>Expected weight</span><input value={expectedWeight} onChange={(e) => setExpectedWeight(e.target.value)} placeholder="25lb" /></label> : <span className="select-hint">Tick to add weight</span>}</div>
            </div>
          </div>
          <button className="primary-button" disabled={!configurationReady} onClick={() => { setStarted(true); setCameraReady(false); setCameraError(""); }}>Start inspection</button>
        </div>}
        <h2 className="legacy-setup">1. Select checks</h2>
        <div className="check-selector legacy-setup">
          {CHECKS.map((check) => <label key={check.id}>
            <input type="checkbox" checked={selected[check.id]} disabled={readings.length > 0 || Object.keys(piece).length > 0}
              onChange={(event) => { setSelected({ ...selected, [check.id]: event.target.checked }); setStepIndex(0); }} />
            <span>{check.label}</span>
          </label>)}
        </div>
        <div className="serial-range legacy-setup">
          {selected.serial && <><label><span>Start serial number</span><input inputMode="numeric" value={rangeStart} onChange={(e) => setRangeStart(e.target.value.replace(/\D/g, ""))} placeholder="7700000" /></label>
          <label><span>End serial number</span><input inputMode="numeric" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value.replace(/\D/g, ""))} placeholder="7799999" /></label></>}
          {selected.part && <label><span>Expected part number</span><input value={expectedPart} onChange={(e) => setExpectedPart(e.target.value)} placeholder="07-1076 05" /></label>}
          {selected.weight && <label><span>Expected weight</span><input value={expectedWeight} onChange={(e) => setExpectedWeight(e.target.value)} placeholder="25lb" /></label>}
        </div>
        <div className="detection-windows legacy-flow">
          {CHECKS.map((check, index) => {
            const enabled = selected[check.id];
            const active = enabled && currentStep?.id === check.id && !finished;
            const value = piece[check.id] ??
              (result?.type === check.id && stepIndex === 0 ? result.value : null);
            const completed = enabled && Object.prototype.hasOwnProperty.call(piece, check.id);
            return <div
              className={`detection-window ${active ? "window-active" : ""} ${completed ? "window-complete" : ""} ${!enabled ? "window-disabled" : ""}`}
              key={check.id}
            >
              <div className="window-heading">
                <span className="window-number">{index + 1}</span>
                <strong>{check.label}</strong>
              </div>
              <div className="window-value">
                {!enabled ? "Not selected" : value || (completed ? "Not detected" : "Waiting")}
              </div>
              <small>
                {!enabled ? "This step will be skipped" :
                  active ? "Active — capture this value now" :
                  completed ? "Completed" : "Waiting for previous step"}
              </small>
            </div>;
          })}
        </div>
        {started && <><div className="panel-heading camera-heading"><div><h2>Camera view</h2><span className="step">{currentStep?.label}</span></div></div>
        <div className="step-banner">{`Place the ${currentStep?.label?.toLowerCase()} in the camera view · Attempt ${attemptCount + 1} of 3`}</div>
        <div className="camera-view">
          {!finished ? <video ref={videoRef} autoPlay playsInline muted onCanPlay={() => setCameraReady(true)} /> :
            <div className="camera-message">{finished ? "Session finished" : "Select checks and enter required values."}</div>}
          {cameraError && <div className="camera-message">{cameraError}</div>}
        </div>
        <button className="primary-button" disabled={!configurationReady || finished || isReading || !cameraReady} onClick={captureAndRead}>
          <ScanIcon />{isReading ? "Reading…" : `Capture ${currentStep?.label || ""}`}
        </button>
        <label className={`upload-button ${finished || isReading ? "disabled" : ""}`}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={finished || isReading}
            onChange={uploadAndRead}
          />
          Upload image for {currentStep?.label}
        </label>
        <div className="detected-value"><span>Last detected {result?.type || "value"}</span><strong>{result ? result.value || "Not detected" : "—"}</strong></div>
        {result && !result.value && attemptCount > 0 && <p className="retry-message">
          Not detected. Adjust the item and capture again — {3 - attemptCount} chance{3 - attemptCount === 1 ? "" : "s"} remaining.
        </p>}
        {Object.keys(piece).length > 0 && <p className="sequence-note">Continue with the next step for the same piece.</p>}
        </>}
      </div>
      <div className={`panel readings-panel ${!started ? "setup-hidden" : ""}`}>
        <h2>OCR result</h2>
        {!readings.length ? <div className="empty-readings">A completed piece will appear after all selected checks.</div> :
          <div className="readings-grid">
            <div className="reading-row reading-header"><span>Serial</span><span>Part number</span><span>Weight</span><span>Status</span></div>
            {readings.map((row) => <div className={`reading-row row-${row.status.toLowerCase().replaceAll(" ", "-")}`} key={row.id}>
              <strong data-label="Serial">{row.serial}</strong>
              <span data-label="Part">{row.part_number}<small>{row.part_check}</small></span>
              <span data-label="Weight">{row.weight}<small>{row.weight_check}</small></span>
              <span data-label="Status" className="status-label">{row.status}</span>
            </div>)}
          </div>}
        {!finished ? <button className="finish-button" disabled={!readings.length || isReading} onClick={finishSession}>Finish session</button> :
          <div className="report-actions"><button className="primary-button" onClick={downloadReport}>Download CSV</button><button className="finish-button" onClick={reset}>Start new range</button></div>}
        {savedSession && <p className="saved-message">Saved to MySQL and JSON · ID {savedSession.session_id}</p>}
        {saveError && <p className="save-error">{saveError}</p>}
      </div>
    </section>
  </main>;
}

export default App;
