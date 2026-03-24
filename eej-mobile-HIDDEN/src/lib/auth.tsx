import React, { createContext, useContext, useState, useEffect } from "react";
import type { User, Role } from "@/types";

const SESSION_KEY = "eej_session_v2";
const TOKEN_KEY   = "eej_token_v2";
const API_BASE    = "/api";// keep as is

interface AuthContextValue {
  user: User | null;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
  token: string | null;
}

const AuthContext = createContext<AuthContextValue>({
  user:   null,
  login:  async () => "Not initialised",
  logout: () => {},
  token:  null,
});

function isValidUser(obj: unknown): obj is User {
  if (!obj || typeof obj !== "object") return false;
  const u = obj as Record<string, unknown>;
  return (
    typeof u.role  === "string" &&
    typeof u.tier  === "number" &&
    typeof u.name  === "string" &&
    typeof u.email === "string" &&
    typeof u.designation === "string" &&
    typeof u.shortName   === "string"
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (isValidUser(parsed)) return parsed;
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(TOKEN_KEY);
    }
    return null;
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_KEY);
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(TOKEN_KEY);
    }
  }, [user]);

  async function login(email: string, password: string): Promise<string | null> {
    try {
      const res = await fetch(`${API_BASE}/eej/auth/login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json() as {
        error?: string;
        token?: string;
        user?: {
          name: string; email: string; role: string;
          tier: number; designation: string; shortName: string;
        };
      };

      if (!res.ok || data.error) {
        return data.error ?? "Login failed. Please try again.";
      }

      if (!data.token || !data.user) {
        return "Unexpected server response. Please try again.";
      }

      const u: User = {
        role:        data.user.role as Role,
        tier:        data.user.tier as 1 | 2 | 3 | 4,
        designation: data.user.designation,
        shortName:   data.user.shortName,
        name:        data.user.name,
        email:       data.user.email,
      };

      setToken(data.token);
      setUser(u);
      localStorage.setItem(TOKEN_KEY, data.token);
      return null;

    } catch {
      return "Cannot reach the server. Check your connection and try again.";
    }
  }

  function logout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
