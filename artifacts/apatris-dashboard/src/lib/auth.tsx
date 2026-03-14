import React, { createContext, useContext, useState, useEffect } from "react";
import { useLocation } from "wouter";

interface User {
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, pass: string) => boolean;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = "eej_auth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setUser(JSON.parse(stored));
    }
  }, []);

  const login = (email: string, pass: string) => {
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL ?? "admin@euro-edu-jobs.eu";
    const adminPass = import.meta.env.VITE_ADMIN_PASSWORD ?? "eej2024";
    if (email === adminEmail && pass === adminPass) {
      const mockUser = { email, name: "EEJ Admin", role: "Superadmin" };
      setUser(mockUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockUser));
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
