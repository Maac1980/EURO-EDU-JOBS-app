import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import type { User, Role } from "@/types";

// Re-export for convenience
export type { User, Role };

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, pass: string, totpToken?: string, emailOtp?: string) => Promise<{ success: boolean; requires2FA?: boolean; requiresEmailOtp?: boolean; error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  isCoordinator: boolean;
  isManager: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = "eej_auth";
const TOKEN_KEY = "eej_token";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const WARN_BEFORE_MS = 5 * 60 * 1000;

function getApiBase() {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (stored && token) {
      try {
        setUser(JSON.parse(stored));
        setAuthToken(token);
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const doLogout = useCallback(() => {
    setUser(null);
    setAuthToken(null);
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    setLocation("/login");
  }, [setLocation]);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warnRef.current) clearTimeout(warnRef.current);
    warnRef.current = setTimeout(() => {
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(
          "Your session will expire in 5 minutes due to inactivity. Click OK to stay logged in."
        );
        if (confirmed) resetTimer();
      }
    }, SESSION_TIMEOUT_MS - WARN_BEFORE_MS);
    timeoutRef.current = setTimeout(() => {
      doLogout();
    }, SESSION_TIMEOUT_MS);
  }, [doLogout]);

  useEffect(() => {
    if (!user) return;
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warnRef.current) clearTimeout(warnRef.current);
    };
  }, [user, resetTimer]);

  const login = async (
    email: string,
    pass: string,
    totpToken?: string,
    emailOtp?: string
  ): Promise<{ success: boolean; requires2FA?: boolean; requiresEmailOtp?: boolean; error?: string }> => {
    try {
      const res = await fetch(`${getApiBase()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, password: pass,
          ...(totpToken ? { totpToken } : {}),
          ...(emailOtp ? { emailOtp } : {}),
        }),
      });

      const data = await res.json() as {
        token?: string; jwt?: string;
        user?: { name: string; email: string; role: string; tier?: number; designation?: string; shortName?: string; site?: string };
        name?: string; email?: string; role?: string;
        error?: string;
        requires2FA?: boolean; requiresEmailOtp?: boolean;
      };

      if (res.status === 202 && data.requires2FA) {
        return { success: false, requires2FA: true };
      }
      if (res.status === 202 && data.requiresEmailOtp) {
        return { success: false, requiresEmailOtp: true };
      }

      const token = data.token || data.jwt;
      if (!res.ok || !token) {
        return { success: false, error: data.error ?? "Invalid credentials." };
      }

      // Build User from API response — handle both nested and flat response shapes
      const apiUser = data.user ?? { name: data.name ?? "", email: data.email ?? email, role: data.role ?? "executive" };
      const roleLower = (apiUser.role ?? "executive").toLowerCase();
      const roleMap: Record<string, Role> = {
        admin: "executive", executive: "executive",
        legal: "legal", coordinator: "operations",
        manager: "operations", operations: "operations",
        candidate: "candidate",
      };

      const u: User = {
        role: roleMap[roleLower] ?? "executive",
        tier: (apiUser.tier ?? (roleLower === "admin" || roleLower === "executive" ? 1 : roleLower === "legal" ? 2 : roleLower === "candidate" ? 4 : 3)) as 1 | 2 | 3 | 4,
        designation: apiUser.designation ?? apiUser.role ?? "Admin",
        shortName: apiUser.shortName ?? apiUser.name?.split(" ")[0] ?? "User",
        name: apiUser.name ?? "",
        email: apiUser.email ?? email,
      };

      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      setUser(u);
      setAuthToken(token);
      return { success: true };
    } catch (err) {
      console.error("Login fetch error:", err);
      return { success: false, error: "Cannot reach the server. Please try again." };
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      token: authToken,
      login,
      logout: doLogout,
      isAuthenticated: !!user,
      isLoading,
      isAdmin: user?.role === "executive",
      isCoordinator: user?.role === "operations",
      isManager: user?.role === "legal",
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export function getAuthToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}
