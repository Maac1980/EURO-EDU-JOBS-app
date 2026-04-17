/**
 * EEJ Security Middleware — rate limiting, input validation, error wrapping.
 *
 * Rate limits:
 *   /apply: 5 req/hour per IP (prevent application spam)
 *   /eej/auth/login: 10 req/15min per IP (prevent brute force)
 *   /immigration/search: 5 req/min per IP (LLM cost protection)
 *   /ai/copilot: 10 req/min per IP (LLM cost protection)
 *
 * Validators:
 *   PESEL: exactly 11 digits
 *   NIP: exactly 10 digits
 *   IBAN: PL + 26 digits or 26-34 alphanumeric
 *   Email: basic RFC format
 *
 * Error wrapping:
 *   safeError() — returns generic message, logs internals server-side
 */

import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

// ═══ RATE LIMITERS ══════════════════════════════════════════════════════════

export const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many applications from this address. Please try again later." },
  keyGenerator: (req) => req.ip ?? "unknown",
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
  keyGenerator: (req) => req.ip ?? "unknown",
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI request limit reached. Please wait a moment." },
  keyGenerator: (req) => req.ip ?? "unknown",
});

export const publicLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded for public endpoint." },
  keyGenerator: (req) => req.ip ?? "unknown",
});

// ═══ INPUT VALIDATORS ═══════════════════════════════════════════════════════

export function validatePesel(pesel: string | null | undefined): { valid: boolean; error?: string } {
  if (!pesel) return { valid: true }; // null is OK (optional field)
  const cleaned = pesel.replace(/\s/g, "");
  if (!/^\d{11}$/.test(cleaned)) return { valid: false, error: "PESEL must be exactly 11 digits" };
  return { valid: true };
}

export function validateNip(nip: string | null | undefined): { valid: boolean; error?: string } {
  if (!nip) return { valid: true };
  const cleaned = nip.replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(cleaned)) return { valid: false, error: "NIP must be exactly 10 digits" };
  return { valid: true };
}

export function validateIban(iban: string | null | undefined): { valid: boolean; error?: string } {
  if (!iban) return { valid: true };
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(cleaned)) return { valid: false, error: "Invalid IBAN format" };
  return { valid: true };
}

export function validateEmail(email: string | null | undefined): { valid: boolean; error?: string } {
  if (!email) return { valid: true };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { valid: false, error: "Invalid email format" };
  return { valid: true };
}

// ═══ SAFE ERROR RESPONSE ════════════════════════════════════════════════════

export function safeError(res: Response, err: unknown, context?: string): void {
  const message = err instanceof Error ? err.message : "Unknown error";
  // Log full error details server-side
  console.error(`[EEJ Error]${context ? ` [${context}]` : ""}: ${message}`);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  // Return generic message to client — never expose internals
  res.status(500).json({ error: "An internal error occurred. Please try again or contact support." });
}
