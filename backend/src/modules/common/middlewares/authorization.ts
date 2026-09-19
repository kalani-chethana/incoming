import type { NextFunction, Request, Response } from "express";

export interface PermissionRequirement {
  property: string;
  permission: "read" | "create" | "update" | "delete";
}

export const authorize = (_permissions: PermissionRequirement[]) => {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    // RBAC validation hook: allows plug-and-play role-based authorization
    next();
  };
};

export default authorize;

