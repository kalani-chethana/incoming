import React from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import MainLayout from "./MainLayout";
import serialnumberRoutes from "@/modules/serialnumber/routes";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <MainLayout />,
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
