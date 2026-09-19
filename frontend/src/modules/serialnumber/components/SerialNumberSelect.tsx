import React from "react";

interface CameraDevice {
  deviceId: string;
  label: string;
}

interface SerialNumberSelectProps {
  availableCameras: CameraDevice[];
  selectedCameraId: string;
  onCameraChange: (deviceId: string) => void;
  activeLabel?: string;
  autoCapture?: boolean;
  onAutoCaptureChange?: (enabled: boolean) => void;
}

export const SerialNumberSelect: React.FC<SerialNumberSelectProps> = ({
  availableCameras,
  selectedCameraId,
  onCameraChange,
  activeLabel,
  autoCapture = false,
  onAutoCaptureChange,
}) => {
  return (
    <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
      {availableCameras.length > 1 && (
        <select
          id="camera-device-select"
          value={selectedCameraId}
          onChange={(e) => onCameraChange(e.target.value)}
          className="text-xs bg-white hover:bg-[#edf5f0] border border-[#d6ebd9] text-slate-800 rounded-xl px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-[#2da755] transition cursor-pointer shadow-2xs max-w-[140px] sm:max-w-[190px] truncate shrink-0"
          title="Select Camera Device"
        >
          {availableCameras.map((cam) => (
            <option key={cam.deviceId} value={cam.deviceId}>
              {cam.label}
            </option>
          ))}
        </select>
      )}

      {onAutoCaptureChange && (
        <label
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border cursor-pointer select-none transition shadow-2xs shrink-0 ${
            autoCapture
              ? "bg-[#def7ec] text-[#03543f] border-[#bcf0da]"
              : "bg-white text-slate-600 border-[#d6ebd9] hover:bg-slate-50"
          }`}
          title="Toggle Hands-free Auto Capture"
        >
          <input
            type="checkbox"
            checked={autoCapture}
            onChange={(e) => onAutoCaptureChange(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-7 h-4 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1.5px] after:left-[1.5px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-[#2da755] relative"></div>
          <span className="text-[11px] whitespace-nowrap">
            Auto-capture
          </span>
          {autoCapture && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#16a34a]"></span>
            </span>
          )}
        </label>
      )}

      {activeLabel && (
        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#def7ec] text-[#03543f] border border-[#bcf0da] whitespace-nowrap shrink-0">
          Active: {activeLabel}
        </span>
      )}
    </div>
  );
};

export default SerialNumberSelect;
