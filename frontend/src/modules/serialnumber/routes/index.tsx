import React from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  type RouteObject,
} from "react-router-dom";
import PermissionRoute from "../components/PermissionRoute";
import Sidebar from "../components/Sidebar";
import SerialNumberInspection from "../pages/SerialNumberInspection";
import SerialNumberReport from "../pages/SerialNumberReport";

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

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Sidebar />,
    children: [
      {
        index: true,
        element: <Navigate to="/serialnumber/inspection" replace />,
      },
      {
        path: "serialnumber",
        children: serialnumberRoutes,
      },
      {
        path: "*",
        element: <Navigate to="/serialnumber/inspection" replace />,
      },
    ],
  },
]);

export const AppRouter: React.FC = () => {
  return <RouterProvider router={router} />;
};

export default AppRouter;
