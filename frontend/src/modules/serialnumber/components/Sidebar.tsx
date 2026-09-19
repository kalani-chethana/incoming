import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Scan } from "lucide-react";
import type { SidebarItem, SidebarSubItem } from "../../../types/layout.types";

interface SidebarProps {
  items: SidebarItem[];
  isOpen: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ items, isOpen, onToggle }) => {
  const location = useLocation();

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#edf5f0] text-slate-700 transition-transform duration-300 ease-in-out border-r border-[#d6ebd9] ${
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
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
          onClick={onToggle}
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
                onClick={() => {
                  if (isOpen) onToggle();
                }}
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
                        onClick={() => {
                          if (isOpen) onToggle();
                        }}
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
  );
};

export default Sidebar;
