import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const JWT_SECRET = process.env.JWT_SECRET ?? "eej-jwt-fallback-secret-2024";

export type UserRole = "admin" | "coordinator" | "manager";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  site: string | null;
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
    req.user = decoded;
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
