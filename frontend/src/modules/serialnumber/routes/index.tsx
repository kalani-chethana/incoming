import React from "react";
import type { RouteObject } from "react-router-dom";
import PermissionRoute from "../components/PermissionRoute";
import SerialNumberInspection from "../pages/serialnumber/SerialNumberInspection";
import SerialNumberReport from "../pages/serialnumber/SerialNumberReport";

export const serialnumberRoutes: RouteObject[] = [
  {
    path: "inspection",
    element: (
      <PermissionRoute
        permissions={[{ property: "serialnumber", permission: "read" }]}
        element={<SerialNumberInspection />}
      />
    ),
  },
  {
    path: "reports",
    element: (
      <PermissionRoute
        permissions={[{ property: "session", permission: "read" }]}
        element={<SerialNumberReport />}
      />
    ),
  },
  {
    index: true,
    element: (
      <PermissionRoute
        permissions={[{ property: "serialnumber", permission: "read" }]}
        element={<SerialNumberInspection />}
      />
    ),
  },
];

export default serialnumberRoutes;
