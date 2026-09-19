import React, { useEffect, useRef, useState } from "react";
import {
  CameraStatusBadge,
  CheckStatusBadge,
  DetectedValueCard,
  ReadingStatusBadge,
  SerialNumberSelect,
} from "../../components";
import { playAlertTone, playSuccessChime } from "../../libs/audio";
import {
  extractDigits,
  isCapacityMatched,
  isPartMatched,
  normalize,
  normalizeWeight,
} from "../../libs/normalization";
import { toast } from "sonner";
import {
  downloadCsvBlob,
  useCreateSessionMutation,
  useReadSerialMutation,
} from "../../services/serialnumber.service";
import type {
  CheckItem,
  CreateSessionResponseData,
  OcrResponseData,
  ReadingRow,
  ResultState,
} from "../../types/serialnumber.type";

const CHECKS: CheckItem[] = [
  { id: "serial", label: "Serial number" },
  { id: "part", label: "Part number" },
  { id: "weight", label: "Capacity" },
];

function ScanIcon() {
  return (
    <svg
      className="w-4 h-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10M8 9h8M9 15h6"
      />
    </svg>
  );
}

export const SerialNumberInspection: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({
    serial: true,
    part: true,
    weight: true,
  });
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
  const [cameraRetryCount, setCameraRetryCount] = useState(0);
  const [availableCameras, setAvailableCameras] = useState<
    { deviceId: string; label: string }[]
  >([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [isReading, setIsReading] = useState(false);
  const [finished, setFinished] = useState(false);
  const [savedSession, setSavedSession] = useState<CreateSessionResponseData | null>(null);
  const [saveError, setSaveError] = useState("");
  const [autoCapture, setAutoCapture] = useState(true);
  const [captureFlash, setCaptureFlash] = useState<{
    show: boolean;
    status: "pass" | "duplicate" | "out_of_range" | "normal";
    message: string;
  }>({ show: false, status: "normal", message: "" });
  const cooldownRef = useRef(0);
  const leftCardRef = useRef<HTMLDivElement>(null);
  const [leftCardHeight, setLeftCardHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!started) return;
    const updateHeight = () => {
      if (typeof window !== "undefined" && window.innerWidth >= 1024 && leftCardRef.current) {
        setLeftCardHeight(leftCardRef.current.offsetHeight);
      } else {
        setLeftCardHeight(null);
      }
    };
    updateHeight();

    const node = leftCardRef.current;
    if (!node) return;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [started]);

  const readSerialMutation = useReadSerialMutation();
  const createSessionMutation = useCreateSessionMutation();

  function triggerSuccessFeedback(msg = "✓ Captured") {
    setCaptureFlash({ show: true, status: "pass", message: msg });
    setTimeout(() => setCaptureFlash({ show: false, status: "normal", message: "" }), 900);
    cooldownRef.current = Date.now() + 1500;
    playSuccessChime();
  }

  function triggerAlertFeedback(type: "duplicate" | "out_of_range", serial: string) {
    const isDup = type === "duplicate";
    setCaptureFlash({
      show: true,
      status: type,
      message: isDup ? `⚠ Duplicate: ${serial}` : `✕ Out of Range: ${serial}`,
    });
    setTimeout(() => setCaptureFlash({ show: false, status: "normal", message: "" }), 1400);
    cooldownRef.current = Date.now() + 2000;
    playAlertTone();
  }

  const steps = CHECKS.filter((check) => selected[check.id]);
  const currentStep = steps[stepIndex];
  const serialConfigured =
    !selected.serial ||
    (rangeStart && rangeEnd && BigInt(rangeStart) <= BigInt(rangeEnd));
  const configurationReady =
    steps.length > 0 &&
    serialConfigured &&
    (!selected.part || expectedPart.trim().length > 0) &&
    (!selected.weight || expectedWeight.trim().length > 0);

  // Camera Management Effect
  useEffect(() => {
    if (!started || !configurationReady || finished) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
      return;
    }

    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "[::1]";

    if (!window.isSecureContext && !isLocalhost) {
      setCameraError(
        "Camera blocked: Browsers require HTTPS (or localhost). When connecting over Wi-Fi/LAN (e.g. 192.168.x.x), please open via http://localhost:5173 or run with HTTPS.",
      );
      setCameraReady(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Camera API is not supported in this browser. Please use Chrome, Edge, or Firefox.",
      );
      setCameraReady(false);
      return;
    }

    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    async function initCamera(isRetry = false) {
      setCameraError("");

      const primaryConstraints: MediaStreamConstraints = {
        audio: false,
        video: selectedCameraId
          ? { deviceId: { exact: selectedCameraId } }
          : {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
      };

      const fallbackConstraints: MediaStreamConstraints = {
        audio: false,
        video: true,
      };

      let stream: MediaStream | null = null;
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia(primaryConstraints);
        } catch (constraintError) {
          console.warn(
            "Primary camera constraints failed, attempting fallback:",
            constraintError,
          );
          stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const error = err as { name?: string; message?: string };

        if (error.name === "NotReadableError" && !isRetry) {
          retryTimeout = setTimeout(() => {
            if (!cancelled) initCamera(true);
          }, 600);
          return;
        }

        const messages: Record<string, string> = {
          NotAllowedError:
            "Camera permission is blocked in browser settings. Please click the lock/camera icon in your address bar and allow camera access.",
          NotFoundError:
            "No camera device was detected. Please connect a webcam or USB camera.",
          NotReadableError:
            "The camera is currently used by another application (e.g. Teams, Zoom, or another browser tab). Please close it and click Retry.",
          OverconstrainedError:
            "The requested camera settings could not be satisfied by your camera hardware.",
        };
        setCameraError(
          messages[error.name || ""] ||
            `Camera could not be started: ${
              error.message || error.name || "Unknown error"
            }`,
        );
        setCameraReady(false);
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playError) {
          console.warn("Video play() pending interaction:", playError);
        }
        setCameraReady(true);
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices
          .filter((d) => d.kind === "videoinput")
          .map((d, index) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${index + 1}`,
          }));
        setAvailableCameras(videoInputs);
      } catch {
        // Enumerate devices is optional
      }
    }

    initCamera();

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
    };
  }, [started, configurationReady, finished, selectedCameraId, cameraRetryCount]);

  function capturePhoto(): Promise<File | null> {
    const video = videoRef.current;
    if (!video?.videoWidth) return Promise.resolve(null);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    return new Promise((resolve) =>
      canvas.toBlob(
        (blob) =>
          resolve(
            blob ? new File([blob], "capture.jpg", { type: "image/jpeg" }) : null,
          ),
        "image/jpeg",
        0.95,
      ),
    );
  }

  function finishPiece(values: Record<string, string>, alreadyAlerted = false) {
    const serial = values.serial || "Not detected";
    let status = selected.serial ? "Not detected" : "Not checked";
    if (values.serial) {
      const numeric = BigInt(extractDigits(values.serial));
      if (rangeStart && rangeEnd && (numeric < BigInt(rangeStart) || numeric > BigInt(rangeEnd))) {
        status = "Out of range";
        if (!alreadyAlerted) {
          toast.error(`Out of Range: ${serial}`, {
            description: `Serial #${serial} is outside the allowed range (${rangeStart} – ${rangeEnd}).`,
            duration: 4500,
          });
          triggerAlertFeedback("out_of_range", serial);
        }
      } else if (
        readings.some(
          (item) => extractDigits(item.serial) === extractDigits(values.serial),
        )
      ) {
        status = "Duplicate";
        if (!alreadyAlerted) {
          toast.warning(`Duplicate Serial: ${serial}`, {
            description: `Serial #${serial} has already been recorded in this session.`,
            duration: 4500,
          });
          triggerAlertFeedback("duplicate", serial);
        }
      } else {
        status = "In range";
      }
    }
    const partMatched = isPartMatched(values.part || "", expectedPart);
    const capacityMatched = isCapacityMatched(values.weight || "", expectedWeight);

    const row: ReadingRow = {
      id: Date.now(),
      time: new Date().toLocaleTimeString(),
      serial,
      status,
      part_number: values.part || (selected.part ? "Not detected" : "Not checked"),
      part_check: !selected.part
        ? "Not checked"
        : !values.part
          ? "Not detected"
          : partMatched
            ? "Matched"
            : "Mismatched",
      weight: values.weight || (selected.weight ? "Not detected" : "Not checked"),
      weight_check: !selected.weight
        ? "Not checked"
        : !values.weight
          ? "Not detected"
          : capacityMatched
            ? "Matched"
            : "Mismatched",
    };
    setReadings((items) => [row, ...items]);
    setPiece({});
    setStepIndex(0);
    setAttemptCount(0);
  }

  async function readImage(image: File | null, isAuto = false) {
    if (!image || !currentStep) return;
    setIsReading(true);
    setSaveError("");
    try {
      const form = new FormData();
      form.append("image", image);
      const queryParams: Record<string, string> = {
        check_type: currentStep.id,
        minimum_confidence: "0.30",
      };

      if (currentStep.id === "serial") {
        queryParams.check_types = selected.weight ? "serial,weight" : "serial";
      } else if (currentStep.id === "part") {
        queryParams.check_types = "part";
        if (expectedPart.trim()) {
          queryParams.expected_part = expectedPart.trim();
        }
        const knownSerial = piece.serial ? String(piece.serial).trim() : "";
        if (knownSerial && knownSerial !== "Not detected") {
          queryParams.exclude_serial = knownSerial;
        }
      } else if (currentStep.id === "weight") {
        queryParams.check_types = "weight";
      }

      const response = await readSerialMutation.mutateAsync({
        formData: form,
        queryParams,
      });

      const data: OcrResponseData = (
        response?.data !== undefined ? response.data : response
      ) as unknown as OcrResponseData;

      const detectedValues: Record<string, string | null> = data?.values || {
        [data?.check_type || currentStep.id]: data?.value || null,
      };

      let value = detectedValues[currentStep.id] || null;

      if (currentStep.id === "serial") {
        const rawSerial = data?.serial_number || value;
        const digits = extractDigits(rawSerial);
        const expectedLen = rangeStart ? rangeStart.length : 7;
        value = digits.length >= expectedLen ? digits.slice(-expectedLen) : digits;
      } else if (currentStep.id === "part") {
        value = value || data?.value || null;
      } else if (currentStep.id === "weight") {
        value = normalizeWeight(value || data?.value || null);
      }

      const attempt = attemptCount + 1;

      let extraSummary = "";
      if (
        currentStep.id === "serial" &&
        selected.weight &&
        detectedValues.weight &&
        !piece.weight
      ) {
        extraSummary = `Also captured Capacity: ${detectedValues.weight} (Step 3 auto-completes)`;
      }

      setResult({
        type: currentStep.id === "weight" ? "capacity" : currentStep.id,
        value,
        attempt,
        extraSummary,
      });

      if (!value && attempt < 3) {
        setAttemptCount(attempt);
        return;
      }

      let alreadyAlerted = false;
      if (currentStep.id === "serial" && value) {
        const numeric = BigInt(extractDigits(value));
        if (rangeStart && rangeEnd && (numeric < BigInt(rangeStart) || numeric > BigInt(rangeEnd))) {
          toast.error(`Out of Range: ${value}`, {
            description: `Serial #${value} is outside the specified range (${rangeStart} – ${rangeEnd}).`,
            duration: 4500,
          });
          triggerAlertFeedback("out_of_range", value);
          alreadyAlerted = true;
        } else if (
          readings.some((item) => extractDigits(item.serial) === extractDigits(value))
        ) {
          toast.warning(`Duplicate Serial: ${value}`, {
            description: `Serial #${value} has already been recorded in this session.`,
            duration: 4500,
          });
          triggerAlertFeedback("duplicate", value);
          alreadyAlerted = true;
        }
      }

      if (!alreadyAlerted && value) {
        triggerSuccessFeedback();
      }

      setAttemptCount(0);

      const nextPiece: Record<string, string> = { ...piece };
      if (value) {
        nextPiece[currentStep.id] = value;
      } else {
        nextPiece[currentStep.id] = "";
      }

      if (
        currentStep.id === "serial" &&
        selected.weight &&
        detectedValues.weight &&
        !nextPiece.weight
      ) {
        nextPiece.weight = detectedValues.weight;
      }

      if (currentStep.id === "serial") {
        if (selected.part) {
          const partIndex = steps.findIndex((s) => s.id === "part");
          setPiece(nextPiece);
          setStepIndex(partIndex);
        } else if (selected.weight && !nextPiece.weight) {
          const weightIndex = steps.findIndex((s) => s.id === "weight");
          setPiece(nextPiece);
          setStepIndex(weightIndex);
        } else {
          finishPiece(nextPiece, alreadyAlerted);
        }
      } else if (currentStep.id === "part") {
        if (selected.weight && !nextPiece.weight) {
          const weightIndex = steps.findIndex((s) => s.id === "weight");
          setPiece(nextPiece);
          setStepIndex(weightIndex);
        } else {
          finishPiece(nextPiece);
        }
      } else {
        finishPiece(nextPiece);
      }
    } catch (error: any) {
      if (!isAuto) {
        setSaveError(
          error instanceof TypeError
            ? "Cannot reach the OCR server. Please check backend connection."
            : error.message || "An unexpected error occurred.",
        );
      }
    } finally {
      setIsReading(false);
    }
  }

  async function captureAndRead() {
    await readImage(await capturePhoto(), false);
  }

  // Auto-Capture Loop
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
  }, [
    autoCapture,
    started,
    finished,
    cameraReady,
    isReading,
    currentStep,
    piece,
    steps,
  ]);

  async function finishSession() {
    setSaveError("");
    try {
      const response = await createSessionMutation.mutateAsync({
        range_start: rangeStart || "0",
        range_end: rangeEnd || "0",
        expected_part_number: expectedPart,
        selected_checks: steps.map((step) => step.id),
        expected_weight: expectedWeight,
        readings: readings.slice().reverse(),
      });
      const payload: CreateSessionResponseData = (
        response?.data !== undefined ? response.data : response
      ) as unknown as CreateSessionResponseData;
      setSavedSession(payload);
      setFinished(true);
    } catch (error: any) {
      setSaveError(
        error instanceof TypeError
          ? "Cannot reach the database server. Please check backend connection."
          : error.message || "Session could not be saved.",
      );
    }
  }

  async function downloadReport() {
    if (!savedSession?.session_id) return;
    await downloadCsvBlob(savedSession.session_id);
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
    setCaptureFlash({ show: false, status: "normal", message: "" });
    cooldownRef.current = 0;
    setExpectedPart("");
    setExpectedWeight("");
    setCameraReady(false);
    setCameraError("");
    setStarted(false);
  }

  return (
    <div className="space-y-3.5">
      {/* Inspection Overview Banner (when started) */}
      {started && (
        <section className="bg-white border border-[#d6ebd9] rounded-xl p-2.5 sm:p-3 shadow-2xs mb-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Stepper (1 -> 2 -> 3) on the left */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {steps.map((step, index) => {
              const completed = Object.prototype.hasOwnProperty.call(piece, step.id);
              const active = index === stepIndex && !finished;
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-all border ${
                    active
                      ? "bg-[#2da755] text-white border-[#2da755] shadow-xs"
                      : completed
                        ? "bg-[#def7ec] text-[#03543f] border-[#bcf0da]"
                        : "bg-white text-slate-400 border-[#d6ebd9]"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                      active
                        ? "bg-white text-[#2da755]"
                        : completed
                          ? "bg-[#047857] text-white"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {completed ? "✓" : index + 1}
                  </span>
                  <span>{step.label}</span>
                </div>
              );
            })}
          </div>

          {/* Expected details on the right */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {selected.serial && (
              <div className="bg-[#f9fbf9] border border-[#d6ebd9] rounded-lg px-2.5 py-1 flex flex-col">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  Serial Range
                </span>
                <span className="font-mono font-bold text-slate-800 text-xs">
                  {rangeStart} – {rangeEnd}
                </span>
              </div>
            )}
            {selected.part && (
              <div className="bg-[#f9fbf9] border border-[#d6ebd9] rounded-lg px-2.5 py-1 flex flex-col">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  Expected Part #
                </span>
                <span className="font-mono font-bold text-slate-800 text-xs">
                  {expectedPart}
                </span>
              </div>
            )}
            {selected.weight && (
              <div className="bg-[#f9fbf9] border border-[#d6ebd9] rounded-lg px-2.5 py-1 flex flex-col">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  Expected Capacity
                </span>
                <span className="font-mono font-bold text-slate-800 text-xs">
                  {expectedWeight}
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {!started ? (
        /* Operator Setup Card */
        <div className="max-w-2xl mx-auto w-full">
          <div className="bg-white border border-[#d6ebd9] rounded-3xl p-6 sm:p-8 shadow-2xs">
            <div className="flex items-center justify-between pb-5 border-b border-[#d6ebd9]/60 mb-6">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-[#2da755] text-white font-black text-lg flex items-center justify-center shadow-xs">
                  1
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                    Set up inspection
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Select the required checks and specify target values.
                  </p>
                </div>
              </div>
              <CameraStatusBadge
                cameraReady={cameraReady}
                cameraError={cameraError}
                started={started}
              />
            </div>

            <div className="space-y-4 mb-6">
              {/* Serial check option */}
              <div
                className={`p-4 rounded-2xl border transition-all ${
                  selected.serial
                    ? "bg-[#def7ec]/30 border-[#86efac] ring-1 ring-[#86efac]"
                    : "bg-[#f9fbf9] border-[#d6ebd9]"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <label className="flex items-center gap-3 cursor-pointer font-bold text-sm text-slate-800 select-none">
                    <input
                      type="checkbox"
                      checked={selected.serial}
                      onChange={(e) =>
                        setSelected({ ...selected, serial: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-[#2da755] focus:ring-[#2da755] accent-[#2da755] cursor-pointer"
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
                          onChange={(e) =>
                            setRangeStart(e.target.value.replace(/\D/g, ""))
                          }
                          placeholder="7700000"
                          className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#d6ebd9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2da755] focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Range End
                        </label>
                        <input
                          inputMode="numeric"
                          value={rangeEnd}
                          onChange={(e) =>
                            setRangeEnd(e.target.value.replace(/\D/g, ""))
                          }
                          placeholder="7799999"
                          className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#d6ebd9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2da755] focus:border-transparent"
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">
                      Check box to enable
                    </span>
                  )}
                </div>
              </div>

              {/* Part check option */}
              <div
                className={`p-4 rounded-2xl border transition-all ${
                  selected.part
                    ? "bg-[#def7ec]/30 border-[#86efac] ring-1 ring-[#86efac]"
                    : "bg-[#f9fbf9] border-[#d6ebd9]"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <label className="flex items-center gap-3 cursor-pointer font-bold text-sm text-slate-800 select-none">
                    <input
                      type="checkbox"
                      checked={selected.part}
                      onChange={(e) =>
                        setSelected({ ...selected, part: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-[#2da755] focus:ring-[#2da755] accent-[#2da755] cursor-pointer"
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
                        className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#d6ebd9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2da755] focus:border-transparent"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">
                      Check box to enable
                    </span>
                  )}
                </div>
              </div>

              {/* Capacity check option */}
              <div
                className={`p-4 rounded-2xl border transition-all ${
                  selected.weight
                    ? "bg-[#def7ec]/30 border-[#86efac] ring-1 ring-[#86efac]"
                    : "bg-[#f9fbf9] border-[#d6ebd9]"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <label className="flex items-center gap-3 cursor-pointer font-bold text-sm text-slate-800 select-none">
                    <input
                      type="checkbox"
                      checked={selected.weight}
                      onChange={(e) =>
                        setSelected({ ...selected, weight: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-[#2da755] focus:ring-[#2da755] accent-[#2da755] cursor-pointer"
                    />
                    <span>Capacity</span>
                  </label>
                  {selected.weight ? (
                    <div className="sm:w-72">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Expected Capacity
                      </label>
                      <input
                        value={expectedWeight}
                        onChange={(e) => setExpectedWeight(e.target.value)}
                        placeholder="25lb"
                        className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#d6ebd9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2da755] focus:border-transparent"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">
                      Check box to enable
                    </span>
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
                setCameraRetryCount((c) => c + 1);
              }}
              className="w-full py-3.5 px-6 rounded-2xl bg-[#2da755] hover:bg-[#258e47] active:scale-[0.99] text-white font-bold text-sm tracking-wide transition shadow-lg shadow-[#2da755]/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer"
            >
              Start Inspection Session
            </button>
          </div>
        </div>
      ) : (
        /* Active Inspection 2-Column Grid */
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
          {/* Left Column: Live Camera, Detected Value, & Triggers */}
          <div className="lg:col-span-7">
            <div
              ref={leftCardRef}
              className="bg-white border border-[#d6ebd9] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3.5"
            >
              {/* View Header */}
              <div className="flex items-center justify-between pb-2.5 border-b border-[#d6ebd9]/80 gap-2 flex-wrap sm:flex-nowrap">
                <div className="min-w-0 shrink-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-bold text-slate-900 whitespace-nowrap">Camera View</h2>
                    <CameraStatusBadge
                      cameraReady={cameraReady}
                      cameraError={cameraError}
                      started={started}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 whitespace-nowrap">
                    Live optical inspection station
                  </p>
                </div>
                <div className="shrink-0">
                  <SerialNumberSelect
                    availableCameras={availableCameras}
                    selectedCameraId={selectedCameraId}
                    onCameraChange={setSelectedCameraId}
                    activeLabel={currentStep?.label}
                    autoCapture={autoCapture}
                    onAutoCaptureChange={setAutoCapture}
                  />
                </div>
              </div>

              {/* Video View Box */}
              <div
                style={{ minHeight: "390px", maxHeight: "450px" }}
                className="relative w-full aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-900 shadow-inner flex items-center justify-center"
              >
                {!finished ? (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      onCanPlay={() => setCameraReady(true)}
                      onLoadedMetadata={() => {
                        videoRef.current?.play().catch(() => {});
                        setCameraReady(true);
                      }}
                      className="w-full h-full object-contain bg-slate-950"
                    />
                    {autoCapture && cameraReady && !isReading && (
                      <div className="scan-laser-line"></div>
                    )}
                    {captureFlash.show && (
                      <div
                        className={`absolute inset-0 backdrop-blur-[2px] border-4 flex items-center justify-center transition-all z-20 ${
                          captureFlash.status === "duplicate"
                            ? "bg-amber-500/20 border-amber-500"
                            : captureFlash.status === "out_of_range"
                              ? "bg-rose-600/25 border-rose-600"
                              : "bg-[#2da755]/20 border-[#22c55e]"
                        }`}
                      >
                        <span
                          className={`font-black px-4 py-2 rounded-full shadow-lg text-sm tracking-wide text-white ${
                            captureFlash.status === "duplicate"
                              ? "bg-amber-600"
                              : captureFlash.status === "out_of_range"
                                ? "bg-rose-600"
                                : "bg-[#2da755]"
                          }`}
                        >
                          {captureFlash.message}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-slate-400 text-xs font-semibold">
                    Inspection session finished
                  </div>
                )}

                {cameraError && (
                  <div className="absolute inset-x-3 bottom-3 bg-rose-950/95 text-white text-xs p-3 rounded-xl backdrop-blur-md border border-rose-500/80 shadow-xl flex items-center justify-between gap-3 z-10">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="text-rose-400 font-bold text-sm shrink-0">⚠</span>
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-semibold text-rose-100 truncate">
                          Camera Connection Failed
                        </p>
                        <p className="text-rose-200/90 text-[11px] leading-snug line-clamp-2">
                          {cameraError}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCameraError("");
                        setCameraRetryCount((c) => c + 1);
                      }}
                      className="shrink-0 px-3 py-1.5 bg-rose-500 hover:bg-rose-400 active:scale-95 text-white font-bold rounded-lg text-xs transition shadow-sm cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>

              {/* Capture Action Button */}
              <button
                disabled={!configurationReady || finished || isReading || !cameraReady}
                onClick={captureAndRead}
                className="w-full py-3 px-4 bg-[#2da755] hover:bg-[#258e47] active:scale-[0.99] text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-sm text-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ScanIcon />
                <span className="truncate">
                  {isReading
                    ? "Reading…"
                    : autoCapture
                      ? "Capture now (Manual click)"
                      : `Capture ${currentStep?.label || ""}`}
                </span>
              </button>

              {/* Detected Value Card */}
              <DetectedValueCard
                result={result}
                attemptCount={attemptCount}
                hasPieceData={Object.keys(piece).length > 0}
              />
            </div>
          </div>

          {/* Right Column: OCR Results & Inspection Log Table */}
          <div className="lg:col-span-5">
            <div
              style={leftCardHeight ? { height: `${leftCardHeight}px` } : undefined}
              className="bg-white border border-[#d6ebd9] rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#d6ebd9]/80 mb-3.5 shrink-0">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">OCR result</h2>
                  <p className="text-[11px] text-slate-500">
                    Completed pieces verification log
                  </p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#def7ec] text-[#03543f] border border-[#bcf0da]">
                  {readings.length} {readings.length === 1 ? "piece" : "pieces"}
                </span>
              </div>

              {!readings.length ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#d6ebd9] rounded-xl text-center text-slate-400 text-xs leading-relaxed min-h-0">
                  <span className="text-2xl mb-2">📋</span>
                  <span>A completed piece will appear after all selected checks.</span>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto min-h-0 border border-[#d6ebd9] rounded-xl divide-y divide-[#edf5f0]">
                  <div className="grid grid-cols-4 bg-[#f9fbf9] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 sticky top-0 z-10 border-b border-[#d6ebd9]">
                    <span>Serial</span>
                    <span>Part #</span>
                    <span>Capacity</span>
                    <span>Status</span>
                  </div>
                  {readings.map((row) => {
                    const statusBg =
                      row.status === "In range"
                        ? "border-l-4 border-l-[#2da755] bg-[#def7ec]/30"
                        : row.status === "Duplicate"
                          ? "border-l-4 border-l-amber-500 bg-amber-50/40"
                          : row.status === "Out of range"
                            ? "border-l-4 border-l-rose-500 bg-rose-50/40"
                            : "border-l-4 border-l-slate-400 bg-slate-50/40";
                    return (
                      <div
                        key={row.id}
                        className={`grid grid-cols-4 items-center px-3 py-2 text-xs transition-colors hover:bg-[#f4f9f5] ${statusBg}`}
                      >
                        <span className="font-mono font-bold text-slate-900 truncate pr-1">
                          {row.serial}
                        </span>
                        <div className="truncate pr-1">
                          <div className="font-mono text-slate-800 text-[11px] truncate">
                            {row.part_number}
                          </div>
                          <CheckStatusBadge check={row.part_check} />
                        </div>
                        <div className="truncate pr-1">
                          <div className="font-mono text-slate-800 text-[11px] truncate">
                            {row.weight}
                          </div>
                          <CheckStatusBadge check={row.weight_check} />
                        </div>
                        <div>
                          <ReadingStatusBadge status={row.status} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Session Action Buttons */}
              <div className="pt-3.5 border-t border-[#d6ebd9] mt-auto shrink-0 space-y-2">
                {!finished ? (
                  <button
                    disabled={!readings.length || isReading}
                    onClick={finishSession}
                    className="w-full py-3 bg-white hover:bg-[#f9fbf9] border border-[#d6ebd9] hover:border-slate-400 text-slate-800 font-bold rounded-xl transition text-xs tracking-wide disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
                  >
                    Finish session
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={downloadReport}
                      className="py-3 px-3 bg-[#2da755] hover:bg-[#258e47] text-white font-bold rounded-xl transition text-xs shadow-xs cursor-pointer text-center"
                    >
                      Download CSV
                    </button>
                    <button
                      onClick={reset}
                      className="py-3 px-3 bg-white hover:bg-slate-50 border border-[#d6ebd9] text-slate-800 font-bold rounded-xl transition text-xs cursor-pointer shadow-2xs text-center"
                    >
                      Start new range
                    </button>
                  </div>
                )}

                {savedSession && (
                  <div className="p-2 rounded-xl bg-[#def7ec] border border-[#bcf0da] text-[#03543f] text-[11px] font-semibold text-center">
                    Saved to MySQL and JSON · ID{" "}
                    <strong className="font-mono">{savedSession.session_id}</strong>
                  </div>
                )}
                {saveError && (
                  <div className="p-2 rounded-xl bg-[#fee2e2] border border-[#fecaca] text-[#dc2626] text-[11px] font-semibold text-center">
                    {saveError}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
  
export default SerialNumberInspection;