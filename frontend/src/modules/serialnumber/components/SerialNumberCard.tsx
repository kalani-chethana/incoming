import React from "react";
import { CheckCircle2, XCircle, AlertCircle, Layers } from "lucide-react";
import type { CheckItem, ReadingRow, ResultState } from "../types/serialnumber.type";
import {
  isPartMatched,
  isCapacityMatched,
  extractDigits,
} from "../libs/normalization";

interface ReadingStatusBadgeProps {
  status: string;
}

export const ReadingStatusBadge: React.FC<ReadingStatusBadgeProps> = ({ status }) => {
  const isPass = status === "In range" || status === "PASS" || status === "Pass";
  const isFail = status === "Out of range" || status === "FAIL" || status === "Fail";
  const isDuplicate = status === "Duplicate";

  if (isPass) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#def7ec] text-[#03543f] border border-[#bcf0da]">
        <CheckCircle2 className="w-3 h-3 text-[#03543f]" />
        PASS
      </span>
    );
  }

  if (isFail) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#fee2e2] text-[#dc2626] border border-[#fecaca]">
        <XCircle className="w-3 h-3 text-[#dc2626]" />
        FAIL
      </span>
    );
  }

  if (isDuplicate) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#fef3c7] text-[#92400e] border border-[#fde68a]">
        DUPLICATE
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
      {status}
    </span>
  );
};

interface CheckStatusBadgeProps {
  check: string;
}

export const CheckStatusBadge: React.FC<CheckStatusBadgeProps> = ({ check }) => {
  const color =
    check === "Matched"
      ? "text-[#047857]"
      : check === "Mismatched"
        ? "text-[#dc2626]"
        : "text-slate-400";

  return <div className={`text-[10px] font-bold ${color}`}>{check}</div>;
};

interface DetectedValueCardProps {
  steps?: CheckItem[];
  stepIndex?: number;
  piece?: Record<string, string>;
  lastCompletedRow?: ReadingRow | null;
  isReading?: boolean;
  rangeStart?: string;
  rangeEnd?: string;
  expectedPart?: string;
  expectedWeight?: string;
  result?: ResultState | null;
  attemptCount?: number;
  hasPieceData?: boolean;
}

export const DetectedValueCard: React.FC<DetectedValueCardProps> = ({
  steps,
  stepIndex = 0,
  piece = {},
  lastCompletedRow,
  isReading = false,
  rangeStart = "",
  rangeEnd = "",
  expectedPart = "",
  expectedWeight = "",
  result,
  attemptCount = 0,
  hasPieceData = false,
}) => {
  // If steps are not provided, fallback to legacy single-value view
  if (!steps || steps.length === 0) {
    return (
      <div className="space-y-2">
        <div className="bg-[#f9fbf9] border border-[#d6ebd9] rounded-xl px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Last detected {result?.type || "value"}
            </span>
            <strong className="font-mono text-lg sm:text-xl font-bold text-slate-900 tracking-tight truncate block">
              {result ? result.value || "Not detected" : "—"}
            </strong>
          </div>
          {result?.extraSummary && (
            <span className="shrink-0 inline-flex items-center text-[11px] font-semibold text-[#15803d] bg-[#def7ec] border border-[#bcf0da] rounded-lg px-2.5 py-1">
              {result.extraSummary}
            </span>
          )}
        </div>

        {result && !result.value && attemptCount > 0 && (
          <div className="bg-[#fffbeb] border border-[#fef3c7] text-[#92400e] text-xs py-1.5 px-3 rounded-lg font-medium">
            Not detected. Adjust the item and capture again — {3 - attemptCount}{" "}
            chance{3 - attemptCount === 1 ? "" : "s"} remaining.
          </div>
        )}

        {hasPieceData && (
          <p className="text-[11px] text-slate-500 italic text-center">
            Continue with the next step for the same piece.
          </p>
        )}
      </div>
    );
  }

  const isPieceInProgress = Object.keys(piece).length > 0;
  const currentStep = steps[stepIndex];

  // Helper to extract value & status for each step in sequence
  const stepItems = steps.map((step, idx) => {
    let rawValue: string = "—";
    let status: "pass" | "fail" | "duplicate" | "active" | "pending" = "pending";

    if (piece[step.id] && piece[step.id].trim().length > 0 && piece[step.id] !== "Not detected") {
      rawValue = piece[step.id];
      if (step.id === "serial") {
        const numeric = extractDigits(rawValue);
        if (rangeStart && rangeEnd && numeric) {
          try {
            const numVal = BigInt(numeric);
            if (numVal < BigInt(rangeStart) || numVal > BigInt(rangeEnd)) {
              status = "fail";
            } else {
              status = "pass";
            }
          } catch {
            status = "pass";
          }
        } else {
          status = "pass";
        }
      } else if (step.id === "part") {
        if (expectedPart.trim()) {
          status = isPartMatched(rawValue, expectedPart) ? "pass" : "fail";
        } else {
          status = "pass";
        }
      } else if (step.id === "weight" || step.id === "capacity") {
        if (expectedWeight.trim()) {
          status = isCapacityMatched(rawValue, expectedWeight) ? "pass" : "fail";
        } else {
          status = "pass";
        }
      }
    } else if (idx === stepIndex) {
      status = "active";
      rawValue = isReading ? "Scanning…" : "—";
    } else {
      status = "pending";
      rawValue = "—";
    }

    return {
      step,
      idx,
      rawValue,
      status,
    };
  });

  return (
    <div className="space-y-2">
      <div className="bg-[#f9fbf9] border border-[#d6ebd9] rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 divide-x divide-[#d6ebd9]">
        {stepItems.map((item, idx) => (
          <div
            key={item.step.id}
            className={`flex-1 min-w-0 flex items-center justify-between gap-2 ${
              idx > 0 ? "pl-3 sm:pl-4" : ""
            }`}
          >
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block truncate">
                {item.step.label}
              </span>
              <strong className="font-mono text-lg sm:text-xl font-bold text-slate-900 tracking-tight truncate block">
                {item.rawValue}
              </strong>
            </div>

            {item.status === "pass" && (
              <span className="shrink-0 inline-flex items-center text-[11px] font-semibold text-[#15803d] bg-[#def7ec] border border-[#bcf0da] rounded-lg px-2 py-0.5">
                PASS
              </span>
            )}
            {item.status === "fail" && (
              <span className="shrink-0 inline-flex items-center text-[11px] font-semibold text-[#dc2626] bg-[#fee2e2] border border-[#fecaca] rounded-lg px-2 py-0.5">
                FAIL
              </span>
            )}
            {item.status === "duplicate" && (
              <span className="shrink-0 inline-flex items-center text-[11px] font-semibold text-[#92400e] bg-[#fef3c7] border border-[#fde68a] rounded-lg px-2 py-0.5">
                DUP
              </span>
            )}
            {item.status === "active" && (
              <span className="shrink-0 inline-flex items-center text-[11px] font-semibold text-[#15803d] bg-[#dcfce7] border border-[#86efac] rounded-lg px-2 py-0.5">
                Active
              </span>
            )}
          </div>
        ))}
      </div>

      {result && !result.value && attemptCount > 0 && (
        <div className="bg-[#fffbeb] border border-[#fef3c7] text-[#92400e] text-xs py-1.5 px-3 rounded-lg font-medium">
          Not detected. Adjust the item and capture again — {3 - attemptCount}{" "}
          chance{3 - attemptCount === 1 ? "" : "s"} remaining.
        </div>
      )}

      {hasPieceData && (
        <p className="text-[11px] text-slate-500 italic text-center">
          Continue with the next step for the same piece.
        </p>
      )}
    </div>
  );
};

interface CameraStatusBadgeProps {
  cameraReady: boolean;
  cameraError: string;
  started: boolean;
}

export const CameraStatusBadge: React.FC<CameraStatusBadgeProps> = ({
  cameraReady,
  cameraError,
  started,
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap shrink-0 ${
        cameraError
          ? "bg-[#fee2e2] text-[#dc2626] border-[#fecaca]"
          : cameraReady
            ? "bg-[#dcfce7] text-[#15803d] border-[#86efac]"
            : started
              ? "bg-[#fef3c7] text-[#92400e] border-[#fde68a]"
              : "bg-white text-slate-600 border-[#d6ebd9]"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          cameraError
            ? "bg-[#dc2626]"
            : cameraReady
              ? "bg-[#22c55e] animate-pulse"
              : started
                ? "bg-[#f59e0b]"
                : "bg-slate-400"
        }`}
      ></span>
      {cameraError
        ? "Camera Error"
        : cameraReady
          ? "Online"
          : started
            ? "Connecting Camera…"
            : "Standby"}
    </span>
  );
};

export default DetectedValueCard;
