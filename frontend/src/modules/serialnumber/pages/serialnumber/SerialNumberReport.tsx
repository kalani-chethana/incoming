import React, { useState } from "react";
import {
  Activity,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Search,
  XCircle,
} from "lucide-react";
import {
  CheckStatusBadge,
  ReadingStatusBadge,
} from "../../components";
import {
  downloadCsvBlob,
  useSessionQuery,
} from "../../services/serialnumber.service";
import type { SessionRecord } from "../../types/serialnumber.type";

export const SerialNumberReport: React.FC = () => {
  const [searchInput, setSearchInput] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading, isError, error } = useSessionQuery(activeSessionId);
  const sessionRecord: SessionRecord | undefined = data?.data;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(searchInput.trim(), 10);
    if (!isNaN(id) && id > 0) {
      setActiveSessionId(id);
    }
  };

  const handleDownload = async (sessionId: number) => {
    setDownloading(true);
    try {
      await downloadCsvBlob(sessionId);
    } catch {
      // Handled in service/toast
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#d6ebd9] mb-6">
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
              View session inspection logs and export CSV verification reports
            </p>
          </div>
        </div>
      </header>

      {/* Session Lookup Form */}
      <div className="bg-white border border-[#d6ebd9] rounded-2xl p-5 sm:p-6 shadow-2xs">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="number"
              min="1"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Enter Session ID (e.g. 1, 2, 10)..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#f9fbf9] border border-[#d6ebd9] rounded-xl text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2da755] transition"
            />
          </div>
          <button
            type="submit"
            className="w-full sm:w-auto px-5 py-2.5 bg-[#2da755] hover:bg-[#258e47] text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            Load Session
          </button>
          {activeSessionId && (
            <button
              type="button"
              disabled={downloading}
              onClick={() => handleDownload(activeSessionId)}
              className="w-full sm:w-auto px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-[#d6ebd9] shadow-2xs transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-[#2da755]" />
              {downloading ? "Downloading…" : "Export CSV"}
            </button>
          )}
        </form>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="bg-white border border-[#d6ebd9] rounded-2xl p-12 text-center text-xs text-slate-500 font-medium">
          Loading session report data…
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="bg-[#fee2e2]/40 border border-[#fecaca] rounded-2xl p-6 text-center text-xs text-[#dc2626] font-medium">
          {(error as Error)?.message || "Session not found. Please check the session ID."}
        </div>
      )}

      {/* Empty State */}
      {!activeSessionId && !isLoading && (
        <div className="bg-white border-2 border-dashed border-[#d6ebd9] rounded-2xl p-12 text-center text-slate-400 space-y-2">
          <History className="w-8 h-8 mx-auto text-slate-300" />
          <p className="text-xs font-semibold text-slate-600">
            No session selected
          </p>
          <p className="text-[11px] text-slate-400">
            Enter a session ID above to inspect verified readings and download its CSV report.
          </p>
        </div>
      )}

      {/* Loaded Session Details */}
      {sessionRecord && !isLoading && (
        <div className="space-y-6">
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
                  {sessionRecord.summary?.total_readings ?? sessionRecord.readings?.length ?? 0}
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
                  {sessionRecord.summary?.in_range?.count ?? 0}
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
                  {sessionRecord.summary?.out_of_range?.count ?? 0}
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
                  {sessionRecord.summary?.duplicates?.count ?? 0}
                </div>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  Duplicate serials detected
                </p>
              </div>
            </div>
          </div>

          {/* Session Metadata Info */}
          <div className="bg-white border border-[#d6ebd9] rounded-2xl p-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <span className="text-slate-400 font-bold block text-[10px] uppercase">
                  Session ID
                </span>
                <span className="font-mono font-bold text-slate-800">
                  #{sessionRecord.session_id}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block text-[10px] uppercase">
                  Range
                </span>
                <span className="font-mono font-bold text-slate-800">
                  {sessionRecord.range?.start} – {sessionRecord.range?.end}
                </span>
              </div>
              {sessionRecord.expected_part_number && (
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">
                    Expected Part #
                  </span>
                  <span className="font-mono font-bold text-slate-800">
                    {sessionRecord.expected_part_number}
                  </span>
                </div>
              )}
              {sessionRecord.expected_weight && (
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">
                    Expected Weight
                    Expected Capacity
                  </span>
                  <span className="font-mono font-bold text-slate-800">
                    {sessionRecord.expected_weight}
                  </span>
                </div>
              )}
              <div>
                <span className="text-slate-400 font-bold block text-[10px] uppercase">
                  Saved At
                </span>
                <span className="text-slate-700 font-medium">
                  {sessionRecord.saved_at}
                </span>
              </div>
            </div>
          </div>

          {/* Session Readings Table */}
          <div className="bg-white border border-[#d6ebd9] rounded-2xl overflow-hidden shadow-2xs">
            <div className="p-4 sm:p-5 border-b border-[#d6ebd9]/80 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Verified Pieces Log
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#def7ec] text-[#03543f] border border-[#bcf0da]">
                {sessionRecord.readings?.length ?? 0} pieces
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#d6ebd9]/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-[#f9fbf9]">
                    <th className="py-3 px-4">Time</th>
                    <th className="py-3 px-4">Serial Number</th>
                    <th className="py-3 px-4">Part Number</th>
                    <th className="py-3 px-4">Weight</th>
                    <th className="py-3 px-4">Capacity</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf5f0] text-xs">
                  {sessionRecord.readings?.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#f4f9f5] transition-colors">
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap font-medium">
                        {row.time}
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
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SerialNumberReport;

