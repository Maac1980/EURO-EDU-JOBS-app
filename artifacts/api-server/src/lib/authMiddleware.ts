import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is required. Set it in your deployment secrets.");
  process.exit(1);
}

export const JWT_SECRET: string = process.env.JWT_SECRET;

export type UserRole = "admin" | "coordinator" | "manager";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  site: string | null;
  tenantId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized — missing token." });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    // Legacy tokens minted before multi-tenant rollout default to production tenant.
    req.user = { ...decoded, tenantId: decoded.tenantId ?? "production" };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token." });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({ error: "Unauthorized." }); return; }
  if (req.user.role !== "admin") { res.status(403).json({ error: "Admin access required." }); return; }
  next();
}

export function requireCoordinatorOrAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({ error: "Unauthorized." }); return; }
  if (req.user.role === "manager") { res.status(403).json({ error: "Coordinator or Admin access required." }); return; }
  next();
}

// RBAC middleware - check if user has required role
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ error: "Unauthorized." }); return; }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: `Access requires one of: ${roles.join(", ")}` });
      return;
    }
    next();
  };
}
