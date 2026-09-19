import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu, Scan } from "lucide-react";
import { Sidebar } from "@/modules/serialnumber/components/Sidebar";
import { serialnumberSidebar } from "@/modules/serialnumber/routes/SerialNumberSidebar";

export const MainLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#edf5f0] flex">
      {/* Navigation Sidebar */}
      <Sidebar
        items={serialnumberSidebar}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-xs lg:hidden"
        ></div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        {/* Mobile Header Bar */}
        <div className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-[#d6ebd9]">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-slate-700 hover:bg-[#dceddf] rounded-xl cursor-pointer"
            aria-label="Open sidebar menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#2da755] flex items-center justify-center text-white">
              <Scan className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-sm text-[#1b4d2b]">Live Scanner</span>
          </div>
          <div className="w-9"></div>
        </div>

        <main className="flex-1 w-full max-w-[1700px] mx-auto px-3 sm:px-6 py-3 sm:py-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
