import React, { createContext, useContext, useState, useEffect } from "react";
import { useLocation } from "wouter";

interface User {
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = "eej_auth";
const TOKEN_KEY = "eej_token";

function getApiBase() {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const token = localStorage.getItem(TOKEN_KEY);
    if (stored && token) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TOKEN_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${getApiBase()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pass }),
      });

      const data = await res.json() as { token?: string; user?: User; error?: string };

      if (!res.ok || !data.token || !data.user) {
        return { success: false, error: data.error ?? "Invalid credentials." };
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
      setUser(data.user);
      return { success: true };
    } catch (err) {
      console.error("Login fetch error:", err);
      return { success: false, error: "Cannot reach the server. Please try again." };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, isLoading }}>
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
