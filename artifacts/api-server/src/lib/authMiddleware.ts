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
  // T23 — per-user permission flags (only present on mobile-app JWTs from
  // /eej/auth/login). Admin-side JWTs (auth.ts /auth/login) don't include them;
  // gates treat absence as unrestricted (admin path bypasses the flag).
  canViewFinancials?: boolean;
  nationalityScope?: string | null;
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

// T23 — business-level financial gate. Blocks callers whose JWT has
// canViewFinancials explicitly false. Admin-side JWTs without the flag pass
// through (Anna's admin path retains financial access). Mobile-app JWTs from
// /eej/auth/login carry the flag baked in; users with false are denied.
//
// Applied to: invoices, revenue forecasting/actuals/summary, admin/stats.
// NOT applied to: worker-level financial fields (salary/advance on
// /api/workers/* — those remain accessible to all team).
export function requireFinancialAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({ error: "Unauthorized." }); return; }
  if (req.user.canViewFinancials === false) {
    res.status(403).json({ error: "Financial access required." });
    return;
  }
  next();
}

// T1 or T2 gate — accepts both the mobile-app role names (executive/legal) and
// legacy admin/T1/T2 labels so it works across every auth path in the project.
export function requireT1T2(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({ error: "Unauthorized." }); return; }
  const role = req.user.role as string;
  const allowed = ["admin", "executive", "legal", "T1", "T2"];
  if (!allowed.includes(role)) {
    res.status(403).json({ error: "Insufficient permissions. T1 or T2 required." });
    return;
  }
  next();
}
