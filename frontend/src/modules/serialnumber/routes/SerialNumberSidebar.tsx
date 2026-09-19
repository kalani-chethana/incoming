import type { SidebarItem } from "@/types/layout.types";
import { FileSpreadsheet, Scan } from "lucide-react";

export const serialnumberSidebar: SidebarItem[] = [
  {
    title: "Live Scanner",
    url: "/serialnumber/inspection",
    icon: Scan,
    permissions: [{ property: "serialnumber", permission: "read" }],
  },
  {
    title: "Reports",
    url: "/serialnumber/reports",
    icon: FileSpreadsheet,
    permissions: [{ property: "session", permission: "read" }],
  },
];

export default serialnumberSidebar;
