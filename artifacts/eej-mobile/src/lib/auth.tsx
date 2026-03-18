import React, { createContext, useContext, useState } from "react";
import type { User, Role } from "@/types";

interface AuthContextValue {
  user: User | null;
  login: (role: Role) => void;
  logout: () => void;
}

const ROLE_NAMES: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  office: "Office Staff",
  worker: "Worker",
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = (role: Role) => setUser({ role, name: ROLE_NAMES[role] });
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
