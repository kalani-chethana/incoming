import type { LucideIcon } from "lucide-react";

export interface Permission {
  property: string;
  permission: "read" | "create" | "update" | "delete";
}

export interface SidebarSubItem {
  title: string;
  url: string;
  permissions?: Permission[];
}

export interface SidebarItem {
  title: string;
  url?: string;
  icon: LucideIcon;
  permissions?: Permission[];
  items?: SidebarSubItem[];
}

