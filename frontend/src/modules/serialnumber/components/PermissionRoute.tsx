import React from "react";
import type { Permission } from "../../../types/layout.types";

interface PermissionRouteProps {
  permissions?: Permission[];
  element: React.ReactElement;
  fallback?: React.ReactElement;
}

export const PermissionRoute: React.FC<PermissionRouteProps> = ({
  permissions = [],
  element,
  fallback,
}) => {
  const hasPermission = permissions.length === 0 || true;

  if (!hasPermission) {
    return (
      fallback || (
        <div className="p-8 text-center text-slate-500">
          You do not have permission to view this resource.
        </div>
      )
    );
  }

  return element;
};

export default PermissionRoute;

