import React, { useMemo, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  History,
  Layers,
  Search,
  XCircle,
} from "lucide-react";
import {
  CheckStatusBadge,
  ReadingStatusBadge,
} from "../components";
import { extractDigits } from "../libs/normalization";
import {
  downloadCsvBlob,
  useSessionQuery,
  useSessionsQuery,
} from "../services/serialnumber.service";
import type {
  SessionRecord,
  SessionSummaryItem,
} from "../types/serialnumber.type";

export const SerialNumberReport: React.FC = () => {
  const [filterQuery, setFilterQuery] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);

  // Queries
  const {
    data: sessionsData,
    isLoading: isLoadingSessions,
    isError: isErrorSessions,
    error: sessionsError,
  } = useSessionsQuery(100);

  const {
    data: singleSessionData,
    isLoading: isLoadingSingle,
    isError: isErrorSingle,
    error: singleError,
  } = useSessionQuery(activeSessionId);

  const sessionsList: SessionSummaryItem[] = useMemo(() => {
    return sessionsData?.data || [];
  }, [sessionsData]);

  const activeRecord: SessionRecord | undefined = singleSessionData?.data;

  // Filtered sessions list
  const filteredSessions = useMemo(() => {
    if (!filterQuery.trim()) return sessionsList;
    const q = filterQuery.toLowerCase().trim();
    return sessionsList.filter((s) => {
      const idMatch = s.session_id.toString().includes(q);
      const partMatch = (s.expected_part_number || "").toLowerCase().includes(q);
      const weightMatch = (s.expected_weight || "").toLowerCase().includes(q);
      const rangeMatch =
        (s.range_start || "").toLowerCase().includes(q) ||
        (s.range_end || "").toLowerCase().includes(q);
      return idMatch || partMatch || weightMatch || rangeMatch;
    });
  }, [sessionsList, filterQuery]);

  // Sorting state for Historical Sessions Table
  const [sessionsSort, setSessionsSort] = useState<{
    key: keyof SessionSummaryItem;
    direction: "asc" | "desc";
  }>({
    key: "session_id",
    direction: "desc",
  });

  const handleSessionsSort = (key: keyof SessionSummaryItem) => {
    setSessionsSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortedSessions = useMemo(() => {
    return [...filteredSessions].sort((a, b) => {
      const aVal = a[sessionsSort.key];
      const bVal = b[sessionsSort.key];

      const numericKeys = [
        "session_id",
        "total_readings",
        "total_detected",
        "in_range_count",
        "out_of_range_count",
        "duplicate_count",
        "not_detected_count",
        "part_match_count",
        "part_mismatch_count",
        "weight_match_count",
        "weight_mismatch_count",
      ];

      if (numericKeys.includes(String(sessionsSort.key))) {
        const aNum = Number(aVal) || 0;
        const bNum = Number(bVal) || 0;
        return sessionsSort.direction === "asc" ? aNum - bNum : bNum - aNum;
      }

      if (sessionsSort.key === "saved_at") {
        const aTime = new Date(String(aVal)).getTime() || 0;
        const bTime = new Date(String(bVal)).getTime() || 0;
        return sessionsSort.direction === "asc" ? aTime - bTime : bTime - aTime;
      }

      const cmp = String(aVal ?? "").localeCompare(String(bVal ?? ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });
      return sessionsSort.direction === "asc" ? cmp : -cmp;
    });
  }, [filteredSessions, sessionsSort]);

  // Sorting state for Single Session Readings Table
  const [readingsSort, setReadingsSort] = useState<{
    key: "index" | "serial" | "part_number" | "weight" | "status";
    direction: "asc" | "desc";
  }>({
    key: "index",
    direction: "asc",
  });

  const handleReadingsSort = (
    key: "index" | "serial" | "part_number" | "weight" | "status",
  ) => {
    setReadingsSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortedReadings = useMemo(() => {
    if (!activeRecord?.readings) return [];
    const withOriginalIndex = activeRecord.readings.map((r, idx) => ({
      ...r,
      _originalIndex: idx + 1,
    }));

    return withOriginalIndex.sort((a, b) => {
      if (readingsSort.key === "index") {
        return readingsSort.direction === "asc"
          ? a._originalIndex - b._originalIndex
          : b._originalIndex - a._originalIndex;
      }

      if (readingsSort.key === "serial") {
        const aNum = BigInt(extractDigits(a.serial) || "0");
        const bNum = BigInt(extractDigits(b.serial) || "0");
        if (aNum !== bNum) {
          return readingsSort.direction === "asc"
            ? aNum < bNum ? -1 : 1
            : aNum > bNum ? -1 : 1;
        }
      }

      const aVal = String(a[readingsSort.key] || "");
      const bVal = String(b[readingsSort.key] || "");
      const cmp = aVal.localeCompare(bVal, undefined, {
        numeric: true,
        sensitivity: "base",
      });
      return readingsSort.direction === "asc" ? cmp : -cmp;
    });
  }, [activeRecord?.readings, readingsSort]);

  const handleDownload = async (sessionId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDownloading(sessionId);
    try {
      await downloadCsvBlob(sessionId);
    } catch {
      // Handled in service/toast
    } finally {
      setDownloading(null);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#d6ebd9]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#2da755] flex items-center justify-center shadow-md shadow-[#2da755]/20 text-white font-black text-xl tracking-tight">
            <FileSpreadsheet className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                Inspection Reports
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#1b4d2b] text-[#86efac] rounded-md">
                CSV Export
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Historical inspection sessions up to now and piece-by-piece verification logs
            </p>
          </div>
        </div>

        {activeSessionId && (
          <button
            type="button"
            onClick={() => setActiveSessionId(null)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-[#d6ebd9] shadow-2xs transition cursor-pointer self-start sm:self-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#2da755]" />
            Back to All Sessions
          </button>
        )}
      </header>

      {/* VIEW 1: ACTIVE SESSION DETAIL VIEW */}
      {activeSessionId !== null ? (
        <div className="space-y-6">
          {/* Active Session Top Bar */}
          <div className="bg-white border border-[#d6ebd9] rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveSessionId(null)}
                className="w-8 h-8 rounded-xl bg-[#f0f9f2] text-[#2da755] hover:bg-[#dff3e5] flex items-center justify-center transition cursor-pointer"
                title="Return to sessions table"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-slate-900 text-base">
                    Session {activeSessionId}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#e8f7ec] text-[#22c55e] border border-[#bcf0da] rounded-md">
                    Active Details
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium">
                  {activeRecord?.saved_at ? formatDate(activeRecord.saved_at) : "Loading session…"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                disabled={downloading === activeSessionId || isLoadingSingle}
                onClick={() => handleDownload(activeSessionId)}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-[#2da755] hover:bg-[#258e47] text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                {downloading === activeSessionId ? "Downloading…" : "Export Session CSV"}
              </button>
              <button
                type="button"
                onClick={() => setActiveSessionId(null)}
                className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl border border-[#d6ebd9] transition cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>

          {/* Loading Single Session */}
          {isLoadingSingle && (
            <div className="bg-white border border-[#d6ebd9] rounded-2xl p-12 text-center text-xs text-slate-500 font-medium animate-pulse">
              Loading session {activeSessionId} details…
            </div>
          )}

          {/* Error Single Session */}
          {isErrorSingle && (
            <div className="bg-[#fee2e2]/40 border border-[#fecaca] rounded-2xl p-6 text-center text-xs text-[#dc2626] font-medium">
              {(singleError as Error)?.message || `Failed to load details for session ${activeSessionId}.`}
            </div>
          )}

          {/* Loaded Single Session Details */}
          {activeRecord && !isLoadingSingle && (
            <>
              {/* Summary Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-[#d6ebd9] shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      TOTAL READINGS
                    </span>
                    <div className="w-7 h-7 rounded-xl bg-[#e8f7ec] text-[#22c55e] flex items-center justify-center">
                      <Activity className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-3xl font-bold text-slate-900 tracking-tight">
                      {activeRecord.summary?.total_readings ?? activeRecord.readings?.length ?? 0}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                      Total pieces recorded
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-[#d6ebd9] shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      IN RANGE (PASS)
                    </span>
                    <div className="w-7 h-7 rounded-xl bg-[#e8f7ec] text-[#22c55e] flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-3xl font-bold text-[#10b981] tracking-tight">
                      {activeRecord.summary?.in_range?.count ?? 0}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                      Verified compliant pieces
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-[#d6ebd9] shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      OUT OF RANGE
                    </span>
                    <div className="w-7 h-7 rounded-xl bg-[#fde8e8] text-[#ef4444] flex items-center justify-center">
                      <XCircle className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-3xl font-bold text-[#e11d48] tracking-tight">
                      {activeRecord.summary?.out_of_range?.count ?? 0}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                      Non-compliant range values
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-[#d6ebd9] shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      DUPLICATES
                    </span>
                    <div className="w-7 h-7 rounded-xl bg-[#fef3c7] text-[#f59e0b] flex items-center justify-center">
                      <History className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-3xl font-bold text-slate-900 tracking-tight">
                      {activeRecord.summary?.duplicates?.count ?? 0}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                      Duplicate serials detected
                    </p>
                  </div>
                </div>
              </div>

              {/* Session Metadata Info */}
              <div className="bg-white border border-[#d6ebd9] rounded-2xl p-5 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">
                      Session ID
                    </span>
                    <span className="font-mono font-bold text-slate-800 text-sm">
                      {activeRecord.session_id}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">
                      Serial Range
                    </span>
                    <span className="font-mono font-bold text-slate-800">
                      {activeRecord.range?.start} – {activeRecord.range?.end}
                    </span>
                  </div>
                  {activeRecord.expected_part_number && (
                    <div>
                      <span className="text-slate-400 font-bold block text-[10px] uppercase">
                        Expected Part #
                      </span>
                      <span className="font-mono font-bold text-slate-800">
                        {activeRecord.expected_part_number}
                      </span>
                    </div>
                  )}
                  {activeRecord.expected_weight && (
                    <div>
                      <span className="text-slate-400 font-bold block text-[10px] uppercase">
                        Expected Weight / Capacity
                      </span>
                      <span className="font-mono font-bold text-slate-800">
                        {activeRecord.expected_weight}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">
                      Saved At
                    </span>
                    <span className="text-slate-700 font-medium">
                      {formatDate(activeRecord.saved_at)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Session Readings Table */}
              <div className="bg-white border border-[#d6ebd9] rounded-2xl overflow-hidden shadow-2xs">
                <div className="p-4 sm:p-5 border-b border-[#d6ebd9]/80 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">
                      Verified Pieces Log
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#def7ec] text-[#03543f] border border-[#bcf0da]">
                      {activeRecord.readings?.length ?? 0} pieces
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSessionId(null)}
                    className="text-xs text-[#2da755] hover:text-[#258e47] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to all sessions
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#d6ebd9]/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-[#f9fbf9] select-none">
                        <th
                          onClick={() => handleReadingsSort("index")}
                          className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition"
                        >
                          <div className="flex items-center gap-1">
                            <span>#</span>
                            {readingsSort.key === "index" ? (
                              readingsSort.direction === "asc" ? (
                                <ArrowUp className="w-3 h-3 text-[#2da755]" />
                              ) : (
                                <ArrowDown className="w-3 h-3 text-[#2da755]" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleReadingsSort("serial")}
                          className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition"
                        >
                          <div className="flex items-center gap-1">
                            <span>Serial Number</span>
                            {readingsSort.key === "serial" ? (
                              readingsSort.direction === "asc" ? (
                                <ArrowUp className="w-3 h-3 text-[#2da755]" />
                              ) : (
                                <ArrowDown className="w-3 h-3 text-[#2da755]" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleReadingsSort("part_number")}
                          className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition"
                        >
                          <div className="flex items-center gap-1">
                            <span>Part Number</span>
                            {readingsSort.key === "part_number" ? (
                              readingsSort.direction === "asc" ? (
                                <ArrowUp className="w-3 h-3 text-[#2da755]" />
                              ) : (
                                <ArrowDown className="w-3 h-3 text-[#2da755]" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleReadingsSort("weight")}
                          className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition"
                        >
                          <div className="flex items-center gap-1">
                            <span>Weight / Capacity</span>
                            {readingsSort.key === "weight" ? (
                              readingsSort.direction === "asc" ? (
                                <ArrowUp className="w-3 h-3 text-[#2da755]" />
                              ) : (
                                <ArrowDown className="w-3 h-3 text-[#2da755]" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleReadingsSort("status")}
                          className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition"
                        >
                          <div className="flex items-center gap-1">
                            <span>Status</span>
                            {readingsSort.key === "status" ? (
                              readingsSort.direction === "asc" ? (
                                <ArrowUp className="w-3 h-3 text-[#2da755]" />
                              ) : (
                                <ArrowDown className="w-3 h-3 text-[#2da755]" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                            )}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf5f0] text-xs">
                      {sortedReadings.map((row) => (
                        <tr key={row._originalIndex} className="hover:bg-[#f4f9f5] transition-colors">
                          <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                            {row._originalIndex}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-[#fee2e2]/70 text-[#dc2626] border border-[#fecaca] inline-block">
                              {row.serial}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-mono text-slate-800 text-[11px]">
                              {row.part_number || "—"}
                            </div>
                            {row.part_check && <CheckStatusBadge check={row.part_check} />}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-mono text-slate-800 text-[11px]">
                              {row.weight || "—"}
                            </div>
                            {row.weight_check && <CheckStatusBadge check={row.weight_check} />}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <ReadingStatusBadge status={row.status} />
                          </td>
                        </tr>
                      ))}
                      {(!activeRecord.readings || activeRecord.readings.length === 0) && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 font-medium">
                            No piece inspection records found for this session.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        /* VIEW 2: ALL HISTORICAL SESSIONS TABLE (UP TO NOW) */
        <div className="bg-white border border-[#d6ebd9] rounded-2xl overflow-hidden shadow-2xs">
        {/* Table Header Controls */}
        <div className="p-4 sm:p-5 border-b border-[#d6ebd9]/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#e8f7ec] text-[#22c55e] flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  All Inspection Sessions (Up to Now)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#def7ec] text-[#03543f] border border-[#bcf0da]">
                  {sessionsList.length} Sessions
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Click any row or column to view full session details and piece inspection logs
              </p>
            </div>
          </div>

          {/* Quick Search / Filter Input */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search session ID, part #, range..."
              className="w-full pl-10 pr-3.5 py-2 bg-[#f9fbf9] border border-[#d6ebd9] rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2da755] transition"
            />
          </div>
        </div>

        {/* Loading Sessions */}
        {isLoadingSessions && (
          <div className="p-12 text-center text-xs text-slate-500 font-medium">
            Loading historical inspection sessions…
          </div>
        )}

        {/* Error Sessions */}
        {isErrorSessions && (
          <div className="p-6 bg-[#fee2e2]/40 text-center text-xs text-[#dc2626] font-medium border-b border-[#fecaca]">
            {(sessionsError as Error)?.message || "Failed to load sessions list."}
          </div>
        )}

        {/* Table Body */}
        {!isLoadingSessions && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#d6ebd9]/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-[#f9fbf9] select-none">
                  <th
                    onClick={() => handleSessionsSort("session_id")}
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>Session ID</span>
                      {sessionsSort.key === "session_id" ? (
                        sessionsSort.direction === "asc" ? (
                          <ArrowUp className="w-3 h-3 text-[#2da755]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#2da755]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSessionsSort("saved_at")}
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>Date & Time</span>
                      {sessionsSort.key === "saved_at" ? (
                        sessionsSort.direction === "asc" ? (
                          <ArrowUp className="w-3 h-3 text-[#2da755]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#2da755]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSessionsSort("range_start")}
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>Serial Range</span>
                      {sessionsSort.key === "range_start" ? (
                        sessionsSort.direction === "asc" ? (
                          <ArrowUp className="w-3 h-3 text-[#2da755]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#2da755]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSessionsSort("expected_part_number")}
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>Expected Part #</span>
                      {sessionsSort.key === "expected_part_number" ? (
                        sessionsSort.direction === "asc" ? (
                          <ArrowUp className="w-3 h-3 text-[#2da755]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#2da755]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSessionsSort("expected_weight")}
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>Expected Weight / Cap</span>
                      {sessionsSort.key === "expected_weight" ? (
                        sessionsSort.direction === "asc" ? (
                          <ArrowUp className="w-3 h-3 text-[#2da755]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#2da755]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSessionsSort("total_readings")}
                    className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Total Pieces</span>
                      {sessionsSort.key === "total_readings" ? (
                        sessionsSort.direction === "asc" ? (
                          <ArrowUp className="w-3 h-3 text-[#2da755]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#2da755]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSessionsSort("in_range_count")}
                    className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>In Range</span>
                      {sessionsSort.key === "in_range_count" ? (
                        sessionsSort.direction === "asc" ? (
                          <ArrowUp className="w-3 h-3 text-[#2da755]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#2da755]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSessionsSort("out_of_range_count")}
                    className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Out of Range</span>
                      {sessionsSort.key === "out_of_range_count" ? (
                        sessionsSort.direction === "asc" ? (
                          <ArrowUp className="w-3 h-3 text-[#2da755]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#2da755]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSessionsSort("duplicate_count")}
                    className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Duplicates</span>
                      {sessionsSort.key === "duplicate_count" ? (
                        sessionsSort.direction === "asc" ? (
                          <ArrowUp className="w-3 h-3 text-[#2da755]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#2da755]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf5f0] text-xs">
                {sortedSessions.map((session) => {
                  const isSelected = activeSessionId === session.session_id;
                  return (
                    <tr
                      key={session.session_id}
                      onClick={() => {
                        setActiveSessionId(session.session_id);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[#e8f7ec] font-semibold text-slate-900"
                          : "hover:bg-[#f0f9f2] text-slate-700"
                      }`}
                      title={`Click to view Session ${session.session_id} full details`}
                    >
                      {/* Session ID */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-[#2da755]/10 text-[#1b4d2b] border border-[#2da755]/20 inline-flex items-center gap-1">
                          {session.session_id}
                        </span>
                      </td>

                      {/* Date & Time */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-medium text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatDate(session.saved_at)}</span>
                        </div>
                      </td>

                      {/* Serial Range */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-mono text-slate-800 font-semibold">
                          {session.range_start} – {session.range_end}
                        </span>
                      </td>

                      {/* Part Number */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {session.expected_part_number ? (
                          <span className="font-mono text-slate-800 text-[11px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {session.expected_part_number}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Expected Weight */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {session.expected_weight ? (
                          <span className="font-mono text-slate-800 text-[11px]">
                            {session.expected_weight}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Total Pieces */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap font-bold text-slate-900">
                        {session.total_readings}
                      </td>

                      {/* In Range (Pass) */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#def7ec] text-[#03543f] border border-[#bcf0da]">
                          <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />
                          {session.in_range_count}
                        </span>
                      </td>

                      {/* Out of Range */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {session.out_of_range_count > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#fee2e2] text-[#991b1b] border border-[#fecaca]">
                            <XCircle className="w-3 h-3 text-[#dc2626]" />
                            {session.out_of_range_count}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] font-mono">0</span>
                        )}
                      </td>

                      {/* Duplicates */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {session.duplicate_count > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#fef3c7] text-[#92400e] border border-[#fde68a]">
                            <History className="w-3 h-3 text-[#f59e0b]" />
                            {session.duplicate_count}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] font-mono">0</span>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => handleDownload(session.session_id, e)}
                            disabled={downloading === session.session_id}
                            className="p-1.5 text-slate-500 hover:text-[#2da755] hover:bg-white rounded-lg border border-transparent hover:border-[#d6ebd9] transition cursor-pointer"
                            title="Export CSV"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2da755] hover:text-[#258e47]">
                            Details
                            <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredSessions.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400 font-medium">
                      {filterQuery ? (
                        <div>
                          <p className="text-sm font-semibold text-slate-600">No matching sessions</p>
                          <p className="text-xs text-slate-400 mt-1">
                            No session found matching &quot;{filterQuery}&quot;. Try clearing the filter.
                          </p>
                        </div>
                      ) : (
                        <div>
                          <History className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                          <p className="text-sm font-semibold text-slate-600">No sessions recorded yet</p>
                          <p className="text-xs text-slate-400 mt-1">
                            Sessions will appear here once saved from the inspection page.
                          </p>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  );
};

export default SerialNumberReport;
