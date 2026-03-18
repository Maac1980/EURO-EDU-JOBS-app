import React, { createContext, useContext, useState } from "react";
import type { User, Role } from "@/types";

interface AuthContextValue {
  user: User | null;
  login: (role: Role) => void;
  logout: () => void;
}

const ROLE_META: Record<Role, Omit<User, "role">> = {
  executive: {
    tier: 1,
    designation: "Executive Board & Finance",
    shortName: "Executive",
  },
  legal: {
    tier: 2,
    designation: "Head of Legal & Client Relations",
    shortName: "Legal & Compliance",
  },
  operations: {
    tier: 3,
    designation: "Workforce & Commercial Operations",
    shortName: "Operations",
  },
  candidate: {
    tier: 4,
    designation: "Candidate",
    shortName: "Candidate Portal",
  },
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const login = (role: Role) => setUser({ role, ...ROLE_META[role] });
  const logout = () => setUser(null);
  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
