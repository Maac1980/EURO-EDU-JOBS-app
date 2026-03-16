import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";

export type UserRole = "admin" | "coordinator" | "manager";

export interface User {
  id?: string;
  email: string;
  name: string;
  role: UserRole;
  site: string | null;
}

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
    const stored = localStorage.getItem(STORAGE_KEY);
    const token = localStorage.getItem(TOKEN_KEY);
    if (stored && token) {
      try {
        setUser(JSON.parse(stored));
        setAuthToken(token);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TOKEN_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const doLogout = useCallback(() => {
    setUser(null);
    setAuthToken(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setLocation("/login");
  }, [setLocation]);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warnRef.current) clearTimeout(warnRef.current);
    warnRef.current = setTimeout(() => {
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(
          "Twoja sesja wygaśnie za 5 minut z powodu braku aktywności. Kliknij OK, aby pozostać zalogowanym."
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
        token?: string; user?: User; error?: string;
        requires2FA?: boolean; requiresEmailOtp?: boolean;
      };

      if (res.status === 202 && data.requires2FA) {
        return { success: false, requires2FA: true };
      }
      if (res.status === 202 && data.requiresEmailOtp) {
        return { success: false, requiresEmailOtp: true };
      }

      if (!res.ok || !data.token || !data.user) {
        return { success: false, error: data.error ?? "Invalid credentials." };
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
      setUser(data.user);
      setAuthToken(data.token);
      return { success: true };
    } catch (err) {
      console.error("Login fetch error:", err);
      return { success: false, error: "Cannot reach the server. Please try again." };
    }
  };

  const logout = () => {
    doLogout();
  };

  return (
    <AuthContext.Provider value={{
      user,
      token: authToken,
      login,
      logout,
      isAuthenticated: !!user,
      isLoading,
      isAdmin: user?.role === "admin",
      isCoordinator: user?.role === "coordinator",
      isManager: user?.role === "manager",
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
  return localStorage.getItem(TOKEN_KEY);
}
