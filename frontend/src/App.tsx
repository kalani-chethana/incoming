import { useEffect, useRef, useState } from "react";

interface CheckItem {
  id: "serial" | "part" | "weight";
  label: string;
}

interface ReadingRow {
  id: number;
  time: string;
  serial: string;
  status: string;
  part_number: string;
  part_check: string;
  weight: string;
  weight_check: string;
}

interface ResultState {
  type: string;
  value: string | null;
  attempt: number;
  extraSummary?: string;
}

const CHECKS: CheckItem[] = [
  { id: "serial", label: "Serial number" },
  { id: "part", label: "Part number" },
  { id: "weight", label: "Weight number" },
];

function ScanIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10M8 9h8M9 15h6" />
    </svg>
  );
}

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({ serial: true, part: true, weight: true });
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [expectedPart, setExpectedPart] = useState("");
  const [expectedWeight, setExpectedWeight] = useState("");
  const [started, setStarted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [piece, setPiece] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ResultState | null>(null);
  const [readings, setReadings] = useState<ReadingRow[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [finished, setFinished] = useState(false);
  const [savedSession, setSavedSession] = useState<{ session_id: string } | null>(null);
  const [saveError, setSaveError] = useState("");
  const [autoCapture, setAutoCapture] = useState(true);
  const [captureFlash, setCaptureFlash] = useState(false);
  const cooldownRef = useRef(0);

  function playSuccessChime() {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // Audio might be blocked if user has not interacted with page yet
    }
  }

  function triggerSuccessFeedback() {
    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 800);
    cooldownRef.current = Date.now() + 1500;
    playSuccessChime();
  }

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
      const messages: Record<string, string> = {
        NotAllowedError: "Camera permission is blocked in browser settings.",
        NotFoundError: "No camera device was detected.",
        NotReadableError: "The camera is currently used by another application.",
      };
      setCameraError(messages[error.name] || "The camera could not be started.");
    });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [started, configurationReady, finished]);

  function normalize(value: string) {
    return value.trim().toUpperCase().replace(/[_–—\s]+/g, "-");
  }

  function normalizeWeight(value: string) {
    return value.trim().toUpperCase().replace(/\s+/g, "");
  }

  function capturePhoto(): Promise<File | null> {
    const video = videoRef.current;
    if (!video?.videoWidth) return Promise.resolve(null);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(
      blob ? new File([blob], "capture.jpg", { type: "image/jpeg" }) : null
    ), "image/jpeg", 0.95));
  }

  function finishPiece(values: Record<string, string>) {
    const serial = values.serial || "Not detected";
    let status = selected.serial ? "Not detected" : "Not checked";
    if (values.serial) {
      const numeric = BigInt(values.serial.replace(/\D/g, ""));
      if (numeric < BigInt(rangeStart) || numeric > BigInt(rangeEnd)) status = "Out of range";
      else if (readings.some((item) => item.serial.replace(/\D/g, "") === values.serial.replace(/\D/g, ""))) status = "Duplicate";
      else status = "In range";
    }
    const partExpectedDigits = expectedPart.replace(/\D/g, "");
    const partActualDigits = (values.part || "").replace(/\D/g, "");
    const partMatched = normalize(values.part || "") === normalize(expectedPart) ||
      (Boolean(partExpectedDigits) && partActualDigits === partExpectedDigits);

    const row: ReadingRow = {
      id: Date.now(), time: new Date().toLocaleTimeString(), serial, status,
      part_number: values.part || (selected.part ? "Not detected" : "Not checked"),
      part_check: !selected.part ? "Not checked" : !values.part ? "Not detected" : partMatched ? "Matched" : "Mismatched",
      weight: values.weight || (selected.weight ? "Not detected" : "Not checked"),
      weight_check: !selected.weight ? "Not checked" : !values.weight ? "Not detected" : normalizeWeight(values.weight) === normalizeWeight(expectedWeight) ? "Matched" : "Mismatched",
    };
    setReadings((items) => [row, ...items]);
    setPiece({});
    setStepIndex(0);
    setAttemptCount(0);
  }

  async function parseJsonResponse(response: Response, defaultError: string) {
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

  async function readImage(image: File | null, isAuto = false) {
    if (!image || !currentStep) return;
    setIsReading(true);
    setSaveError("");
    try {
      const form = new FormData();
      form.append("image", image);
      const params = new URLSearchParams({
        check_type: currentStep.id,
        minimum_confidence: "0.30",
      });

      if (currentStep.id === "serial") {
        params.set("check_types", selected.weight ? "serial,weight" : "serial");
      } else if (currentStep.id === "part") {
        params.set("check_types", "part");
        if (expectedPart.trim()) {
          params.set("expected_part", expectedPart.trim());
        }
        const knownSerial = piece.serial ? String(piece.serial).trim() : "";
        if (knownSerial && knownSerial !== "Not detected") {
          params.set("exclude_serial", knownSerial);
        }
      } else if (currentStep.id === "weight") {
        params.set("check_types", "weight");
      }

      const response = await fetch(`/api/read-serial?${params.toString()}`, {
        method: "POST",
        body: form,
      });
      const payload = await parseJsonResponse(response, "OCR failed");

      const detectedValues: Record<string, string> = {};
      if (payload.values && typeof payload.values === "object") {
        for (const [k, v] of Object.entries(payload.values)) {
          if (typeof v === "string" && v.trim()) {
            detectedValues[k] = v.trim();
          }
        }
      }
      if (payload.value && !detectedValues[currentStep.id]) {
        detectedValues[currentStep.id] = String(payload.value).trim();
      }

      // Safeguard: serial number digits must NEVER be assigned to part number
      const serialDigits = (detectedValues.serial || piece.serial || "").replace(/\D/g, "");
      if (detectedValues.part) {
        const partDigits = detectedValues.part.replace(/\D/g, "");
        if (serialDigits && partDigits === serialDigits) {
          delete detectedValues.part;
        }
      }

      const value = detectedValues[currentStep.id] || null;

      // In Auto-capture mode, silently ignore frames with no detection
      if (isAuto && !value) {
        return;
      }

      const attempt = attemptCount + 1;

      let extraSummary = "";
      if (currentStep.id === "serial" && selected.weight && detectedValues.weight && !piece.weight) {
        extraSummary = `Also captured Weight: ${detectedValues.weight} (Step 3 auto-completes)`;
      }

      setResult({ type: currentStep.id, value, attempt, extraSummary });

      if (!value && attempt < 3) {
        setAttemptCount(attempt);
        return;
      }

      // Visual flash & chime on successful detection
      if (value) {
        triggerSuccessFeedback();
      }

      setAttemptCount(0);

      const nextPiece: Record<string, string> = { ...piece };
      if (value) {
        nextPiece[currentStep.id] = value;
      } else {
        nextPiece[currentStep.id] = "";
      }

      // ONLY in Step 1 (serial): if weight is detected on the same surface, auto-record it
      if (currentStep.id === "serial" && selected.weight && detectedValues.weight && !nextPiece.weight) {
        nextPiece.weight = detectedValues.weight;
      }

      // Strict 1 -> 2 -> 3 workflow progression (no other skips)
      if (currentStep.id === "serial") {
        // Step 1 ALWAYS advances to Step 2 (Part number) if selected
        if (selected.part) {
          const partIndex = steps.findIndex((s) => s.id === "part");
          setPiece(nextPiece);
          setStepIndex(partIndex);
        } else if (selected.weight && !nextPiece.weight) {
          const weightIndex = steps.findIndex((s) => s.id === "weight");
          setPiece(nextPiece);
          setStepIndex(weightIndex);
        } else {
          finishPiece(nextPiece);
        }
      } else if (currentStep.id === "part") {
        // Step 2 advances to Step 3 (Weight) unless weight was already captured in Step 1
        if (selected.weight && !nextPiece.weight) {
          const weightIndex = steps.findIndex((s) => s.id === "weight");
          setPiece(nextPiece);
          setStepIndex(weightIndex);
        } else {
          finishPiece(nextPiece);
        }
      } else {
        // Step 3 (Weight) or last step finishes the piece
        finishPiece(nextPiece);
      }
    } catch (error) {
      if (!isAuto) {
        setSaveError(
          error instanceof TypeError
            ? "Cannot reach the OCR server. Please check backend connection."
            : error instanceof Error
              ? error.message
              : "An unexpected error occurred."
        );
      }
    } finally {
      setIsReading(false);
    }
  }

  async function captureAndRead() {
    await readImage(await capturePhoto(), false);
  }

  async function uploadAndRead(event: React.ChangeEvent<HTMLInputElement>) {
    const image = event.target.files?.[0];
    event.target.value = "";
    if (image) await readImage(image, false);
  }

  useEffect(() => {
    if (!autoCapture || !started || finished || !cameraReady || isReading) return;
    let active = true;
    const interval = setInterval(async () => {
      if (!active) return;
      if (Date.now() < cooldownRef.current) return;
      if (isReading) return;
      const photo = await capturePhoto();
      if (photo && active) {
        await readImage(photo, true);
      }
    }, 1200);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [autoCapture, started, finished, cameraReady, isReading, currentStep, piece, steps]);

  async function finishSession() {
    setSaveError("");
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          range_start: rangeStart || "0",
          range_end: rangeEnd || "0",
          expected_part_number: expectedPart,
          selected_checks: steps.map((step) => step.id),
          expected_weight: expectedWeight,
          readings: readings.slice().reverse(),
        }),
      });
      const payload = await parseJsonResponse(response, "Session could not be saved");
      setSavedSession(payload);
      setFinished(true);
    } catch (error) {
      setSaveError(
        error instanceof TypeError
          ? "Cannot reach the database server. Please check backend connection."
          : error instanceof Error
            ? error.message
            : "Session could not be saved."
      );
    }
  }

  async function downloadReport() {
    if (!savedSession) return;
    const response = await fetch(`/api/sessions/${savedSession.session_id}/report.csv`);
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `forgelens-session-${savedSession.session_id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setFinished(false);
    setSavedSession(null);
    setReadings([]);
    setResult(null);
    setPiece({});
    setStepIndex(0);
    setRangeStart("");
    setRangeEnd("");
    setAttemptCount(0);
    setCaptureFlash(false);
    cooldownRef.current = 0;
    setExpectedPart("");
    setExpectedWeight("");
    setCameraReady(false);
    setCameraError("");
    setStarted(false);
  }

  return (
    <main className="min-h-screen font-sans text-slate-900 pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
        {/* Modern Brand Topbar */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200/80 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-lime-500 flex items-center justify-center shadow-md shadow-lime-500/25 text-slate-950 font-black text-xl tracking-tight">
              F
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">ForgeLens</h1>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-lime-400 rounded-md">
                  Station 01
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">Precision Industrial OCR & Part Verification</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${cameraReady
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : started
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-slate-100 text-slate-600 border-slate-200"
                }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${cameraReady ? "bg-emerald-500 animate-pulse" : started ? "bg-amber-500" : "bg-slate-400"
                  }`}
              ></span>
              {cameraReady ? "Camera Live" : started ? "Connecting Camera…" : "System Ready"}
            </span>
          </div>
        </header>

        {/* Inspection Session Overview Banner (when started) */}
        {started && (
          <section className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              {selected.serial && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Serial Range</span>
                  <span className="font-mono font-bold text-slate-800">
                    {rangeStart} – {rangeEnd}
                  </span>
                </div>
              )}
              {selected.part && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expected Part #</span>
                  <span className="font-mono font-bold text-slate-800">{expectedPart}</span>
                </div>
              )}
              {selected.weight && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expected Weight</span>
                  <span className="font-mono font-bold text-slate-800">{expectedWeight}</span>
                </div>
              )}
            </div>

            {/* Stepper (1 -> 2 -> 3) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
              {steps.map((step, index) => {
                const completed = Object.prototype.hasOwnProperty.call(piece, step.id);
                const active = index === stepIndex && !finished;
                return (
                  <div
                    key={step.id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${active
                        ? "bg-lime-500 text-slate-950 border-lime-600 shadow-sm"
                        : completed
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : "bg-slate-100 text-slate-400 border-slate-200"
                      }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${active
                          ? "bg-slate-950 text-lime-400"
                          : completed
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-200 text-slate-500"
                        }`}
                    >
                      {completed ? "✓" : index + 1}
                    </span>
                    <span>{step.label}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Main Workspace */}
        {!started ? (
          /* Operator Setup Card */
          <div className="max-w-2xl mx-auto w-full">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
              <div className="flex items-center gap-3.5 mb-6 pb-5 border-b border-slate-100">
                <div className="w-10 h-10 rounded-2xl bg-lime-500 text-slate-950 font-black text-lg flex items-center justify-center shadow-sm">
                  1
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">Set up inspection</h2>
                  <p className="text-xs text-slate-500">Select the required checks and specify target values.</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                {/* Serial check option */}
                <div
                  className={`p-4 rounded-2xl border transition-all ${selected.serial
                      ? "bg-lime-50/40 border-lime-200 ring-1 ring-lime-200"
                      : "bg-slate-50/60 border-slate-200"
                    }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <label className="flex items-center gap-3 cursor-pointer font-bold text-sm text-slate-800 select-none">
                      <input
                        type="checkbox"
                        checked={selected.serial}
                        onChange={(e) => setSelected({ ...selected, serial: e.target.checked })}
                        className="w-4 h-4 rounded text-lime-600 focus:ring-lime-500 accent-lime-600 cursor-pointer"
                      />
                      <span>Serial number</span>
                    </label>
                    {selected.serial ? (
                      <div className="grid grid-cols-2 gap-2 sm:w-72">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                            Range Start
                          </label>
                          <input
                            inputMode="numeric"
                            value={rangeStart}
                            onChange={(e) => setRangeStart(e.target.value.replace(/\D/g, ""))}
                            placeholder="7700000"
                            className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                            Range End
                          </label>
                          <input
                            inputMode="numeric"
                            value={rangeEnd}
                            onChange={(e) => setRangeEnd(e.target.value.replace(/\D/g, ""))}
                            placeholder="7799999"
                            className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Check box to enable</span>
                    )}
                  </div>
                </div>

                {/* Part check option */}
                <div
                  className={`p-4 rounded-2xl border transition-all ${selected.part
                      ? "bg-lime-50/40 border-lime-200 ring-1 ring-lime-200"
                      : "bg-slate-50/60 border-slate-200"
                    }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <label className="flex items-center gap-3 cursor-pointer font-bold text-sm text-slate-800 select-none">
                      <input
                        type="checkbox"
                        checked={selected.part}
                        onChange={(e) => setSelected({ ...selected, part: e.target.checked })}
                        className="w-4 h-4 rounded text-lime-600 focus:ring-lime-500 accent-lime-600 cursor-pointer"
                      />
                      <span>Part number</span>
                    </label>
                    {selected.part ? (
                      <div className="sm:w-72">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Expected Part Number
                        </label>
                        <input
                          value={expectedPart}
                          onChange={(e) => setExpectedPart(e.target.value)}
                          placeholder="07-1076 05"
                          className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-500 focus:border-transparent"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Check box to enable</span>
                    )}
                  </div>
                </div>

                {/* Weight check option */}
                <div
                  className={`p-4 rounded-2xl border transition-all ${selected.weight
                      ? "bg-lime-50/40 border-lime-200 ring-1 ring-lime-200"
                      : "bg-slate-50/60 border-slate-200"
                    }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <label className="flex items-center gap-3 cursor-pointer font-bold text-sm text-slate-800 select-none">
                      <input
                        type="checkbox"
                        checked={selected.weight}
                        onChange={(e) => setSelected({ ...selected, weight: e.target.checked })}
                        className="w-4 h-4 rounded text-lime-600 focus:ring-lime-500 accent-lime-600 cursor-pointer"
                      />
                      <span>Weight number</span>
                    </label>
                    {selected.weight ? (
                      <div className="sm:w-72">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Expected Weight
                        </label>
                        <input
                          value={expectedWeight}
                          onChange={(e) => setExpectedWeight(e.target.value)}
                          placeholder="25lb"
                          className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-500 focus:border-transparent"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Check box to enable</span>
                    )}
                  </div>
                </div>
              </div>

              <button
                disabled={!configurationReady}
                onClick={() => {
                  setStarted(true);
                  setCameraReady(false);
                  setCameraError("");
                }}
                className="w-full py-3.5 px-6 rounded-2xl bg-lime-500 hover:bg-lime-400 active:scale-[0.99] text-slate-950 font-bold text-sm tracking-wide transition shadow-lg shadow-lime-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                Start Inspection Session
              </button>
            </div>
          </div>
        ) : (
          /* Active Inspection 2-Column Grid */
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Live Camera & Controls */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
                {/* View Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Camera View</h2>
                    <p className="text-xs text-slate-500">Live optical inspection station</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-lime-100 text-lime-900 border border-lime-300/80">
                    Active: {currentStep?.label}
                  </span>
                </div>

                {/* Auto-Capture Toggle Bar */}
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoCapture}
                      onChange={(e) => setAutoCapture(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-lime-500 relative"></div>
                    <span className="text-xs font-bold text-slate-800">Auto-capture (Hands-free)</span>
                  </label>
                  {autoCapture && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      Auto-scanning live
                    </span>
                  )}
                </div>

                {/* Guidance Banner */}
                <div className="bg-lime-50/60 border border-lime-200/80 rounded-xl px-3.5 py-2.5 text-xs text-lime-900 font-medium flex items-center gap-2">
                  <span className="text-lime-700 font-bold">ℹ</span>
                  {autoCapture
                    ? `Hold the ${currentStep?.label?.toLowerCase()} steadily in camera view for hands-free capture.`
                    : `Place the ${currentStep?.label?.toLowerCase()} in camera view · Attempt ${attemptCount + 1} of 3.`}
                </div>

                {/* Video View Box */}
                <div className="relative w-full aspect-[4/3] bg-slate-950 rounded-2xl overflow-hidden border-2 border-slate-900 shadow-inner flex items-center justify-center">
                  {!finished ? (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        onCanPlay={() => setCameraReady(true)}
                        className="w-full h-full object-cover"
                      />
                      {autoCapture && cameraReady && !isReading && <div className="scan-laser-line"></div>}
                      {captureFlash && (
                        <div className="absolute inset-0 bg-lime-500/20 backdrop-blur-[2px] border-4 border-lime-400 flex items-center justify-center transition-all">
                          <span className="bg-lime-500 text-slate-950 font-black px-4 py-2 rounded-full shadow-lg text-sm tracking-wide">
                            ✓ Captured
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-slate-400 text-xs font-semibold">Inspection session finished</div>
                  )}
                  {cameraError && (
                    <div className="absolute inset-x-4 bottom-4 bg-rose-900/90 text-white text-xs p-3 rounded-xl backdrop-blur-sm border border-rose-700">
                      {cameraError}
                    </div>
                  )}
                </div>

                {/* Primary Action Buttons */}
                <button
                  disabled={!configurationReady || finished || isReading || !cameraReady}
                  onClick={captureAndRead}
                  className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-sm text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ScanIcon />
                  {isReading
                    ? "Reading…"
                    : autoCapture
                      ? "Capture now (Manual click)"
                      : `Capture ${currentStep?.label || ""}`}
                </button>

                <label
                  className={`w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition flex items-center justify-center cursor-pointer border border-slate-200 ${finished || isReading ? "opacity-50 pointer-events-none" : ""
                    }`}
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={finished || isReading}
                    onChange={uploadAndRead}
                    className="hidden"
                  />
                  Upload image for {currentStep?.label}
                </label>

                {/* Detected Value Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Last detected {result?.type || "value"}
                  </span>
                  <strong className="font-mono text-xl font-bold text-slate-900 tracking-tight">
                    {result ? result.value || "Not detected" : "—"}
                  </strong>
                  {result?.extraSummary && (
                    <div className="mt-1 inline-flex items-center text-xs font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 rounded-lg px-2.5 py-1 w-fit">
                      {result.extraSummary}
                    </div>
                  )}
                </div>

                {/* Retry / Guidance Feedback */}
                {result && !result.value && attemptCount > 0 && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs p-3 rounded-xl font-medium">
                    Not detected. Adjust the item and capture again — {3 - attemptCount} chance
                    {3 - attemptCount === 1 ? "" : "s"} remaining.
                  </div>
                )}
                {Object.keys(piece).length > 0 && (
                  <p className="text-xs text-slate-500 italic text-center">
                    Continue with the next step for the same piece.
                  </p>
                )}
              </div>
            </div>

            {/* Right Column: OCR Results & Inspection Log Table */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col min-h-[520px]">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">OCR result</h2>
                    <p className="text-xs text-slate-500">Completed pieces verification log</p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                    {readings.length} {readings.length === 1 ? "piece" : "pieces"}
                  </span>
                </div>

                {!readings.length ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs leading-relaxed">
                    <span className="text-2xl mb-2">📋</span>
                    <span>A completed piece will appear after all selected checks.</span>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto max-h-[460px] border border-slate-200 rounded-xl divide-y divide-slate-100">
                    <div className="grid grid-cols-4 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 sticky top-0 z-10">
                      <span>Serial</span>
                      <span>Part number</span>
                      <span>Weight</span>
                      <span>Status</span>
                    </div>
                    {readings.map((row) => {
                      const statusBg =
                        row.status === "In range"
                          ? "border-l-4 border-l-emerald-500 bg-emerald-50/40"
                          : row.status === "Duplicate"
                            ? "border-l-4 border-l-amber-500 bg-amber-50/40"
                            : row.status === "Out of range"
                              ? "border-l-4 border-l-rose-500 bg-rose-50/40"
                              : "border-l-4 border-l-slate-400 bg-slate-50/40";
                      return (
                        <div
                          key={row.id}
                          className={`grid grid-cols-4 items-center px-3 py-2.5 text-xs transition-colors hover:bg-slate-50 ${statusBg}`}
                        >
                          <span className="font-mono font-bold text-slate-900 truncate pr-1">{row.serial}</span>
                          <div className="truncate pr-1">
                            <div className="font-mono text-slate-800 text-[11px] truncate">{row.part_number}</div>
                            <div
                              className={`text-[9px] font-bold ${row.part_check === "Matched"
                                  ? "text-emerald-700"
                                  : row.part_check === "Mismatched"
                                    ? "text-rose-600"
                                    : "text-slate-400"
                                }`}
                            >
                              {row.part_check}
                            </div>
                          </div>
                          <div className="truncate pr-1">
                            <div className="font-mono text-slate-800 text-[11px] truncate">{row.weight}</div>
                            <div
                              className={`text-[9px] font-bold ${row.weight_check === "Matched"
                                  ? "text-emerald-700"
                                  : row.weight_check === "Mismatched"
                                    ? "text-rose-600"
                                    : "text-slate-400"
                                }`}
                            >
                              {row.weight_check}
                            </div>
                          </div>
                          <div>
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${row.status === "In range"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : row.status === "Duplicate"
                                    ? "bg-amber-100 text-amber-800"
                                    : row.status === "Out of range"
                                      ? "bg-rose-100 text-rose-800"
                                      : "bg-slate-200 text-slate-700"
                                }`}
                            >
                              {row.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Session Action Buttons */}
                <div className="pt-4 border-t border-slate-100 mt-4 space-y-3">
                  {!finished ? (
                    <button
                      disabled={!readings.length || isReading}
                      onClick={finishSession}
                      className="w-full py-3 bg-white hover:bg-slate-50 border-2 border-slate-300 hover:border-slate-400 text-slate-800 font-bold rounded-xl transition text-xs tracking-wide disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Finish session
                    </button>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={downloadReport}
                        className="py-3 px-4 bg-lime-500 hover:bg-lime-400 text-slate-950 font-bold rounded-xl transition text-xs shadow-sm"
                      >
                        Download CSV
                      </button>
                      <button
                        onClick={reset}
                        className="py-3 px-4 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold rounded-xl transition text-xs"
                      >
                        Start new range
                      </button>
                    </div>
                  )}

                  {savedSession && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium text-center">
                      Saved to MySQL and JSON · ID <strong className="font-mono">{savedSession.session_id}</strong>
                    </div>
                  )}
                  {saveError && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium text-center">
                      {saveError}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default App;
