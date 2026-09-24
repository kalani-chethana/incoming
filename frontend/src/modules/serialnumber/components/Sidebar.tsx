import React, { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Menu, Scan } from "lucide-react";
import type { SidebarItem, SidebarSubItem } from "../types/layout.types";
import { serialnumberSidebar } from "../routes/SerialNumberSidebar";

interface SidebarProps {
  items?: SidebarItem[];
  children?: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({
  items = serialnumberSidebar,
  children,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#edf5f0] flex">
      {/* Navigation Sidebar Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#edf5f0] text-slate-700 transition-transform duration-300 ease-in-out border-r border-[#d6ebd9] ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-[#d6ebd9]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#2da755] flex items-center justify-center text-white shadow-xs">
              <Scan className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-[#1b4d2b] tracking-tight">OCR Station</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer"
            aria-label="Toggle navigation"
          >
            ✕
          </button>
        </div>

        <div className="p-3 space-y-1.5 overflow-y-auto">
          {items.map((item: SidebarItem, index: number) => {
            const Icon = item.icon;
            const hasChildren = Boolean(item.items && item.items.length > 0);

            if (!hasChildren && item.url) {
              const isActive =
                location.pathname === item.url ||
                (item.url === "/serialnumber/inspection" &&
                  (location.pathname === "/" || location.pathname === "/serialnumber"));

              return (
                <Link
                  key={index}
                  to={item.url}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition text-xs font-semibold ${
                    isActive
                      ? "bg-[#2da755] text-white shadow-xs font-bold"
                      : "text-slate-700 hover:bg-[#dceddf] hover:text-slate-900"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? "text-white" : "text-[#2da755]"
                    }`}
                  />
                  <span>{item.title}</span>
                </Link>
              );
            }

            return (
              <div key={index} className="space-y-1">
                <div className="flex items-center gap-2 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <Icon className="w-3.5 h-3.5 text-[#2da755]" />
                  <span>{item.title}</span>
                </div>
                {item.items && (
                  <div className="space-y-1 pl-3">
                    {item.items.map((subItem: SidebarSubItem, sIdx: number) => {
                      const isActive = location.pathname === subItem.url;
                      return (
                        <Link
                          key={sIdx}
                          to={subItem.url}
                          onClick={() => setSidebarOpen(false)}
                          className={`block px-3 py-2 text-xs rounded-xl transition font-medium ${
                            isActive
                              ? "bg-[#2da755] text-white font-bold shadow-xs"
                              : "text-slate-700 hover:bg-[#dceddf] hover:text-slate-900"
                          }`}
                        >
                          {subItem.title}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

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
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};

export default Sidebar;
