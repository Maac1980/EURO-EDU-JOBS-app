import React, { createContext, useContext, useState, useEffect } from "react";
import type { User, Role } from "@/types";

interface Credential {
  email: string;
  password: string;
  role: Role;
  tier: 1 | 2 | 3 | 4;
  name: string;
  designation: string;
  shortName: string;
  candidateId?: string;
}

export const CREDENTIALS: Credential[] = [
  {
    email:       "ceo@euro-edu-jobs.eu",
    password:    "EEJ2026!",
    role:        "executive",
    tier:        1,
    name:        "Anna Brzozowska",
    designation: "Executive Board & Finance",
    shortName:   "Executive",
  },
  {
    email:       "legal@euro-edu-jobs.eu",
    password:    "EEJ2026!",
    role:        "legal",
    tier:        2,
    name:        "Marta Wiśniewska",
    designation: "Head of Legal & Client Relations",
    shortName:   "Legal & Compliance",
  },
  {
    email:       "ops@euro-edu-jobs.eu",
    password:    "EEJ2026!",
    role:        "operations",
    tier:        3,
    name:        "Piotr Nowak",
    designation: "Workforce & Commercial Operations",
    shortName:   "Operations",
  },
  {
    email:       "n.petrenko@eej.eu",
    password:    "EEJ2026!",
    role:        "candidate",
    tier:        4,
    name:        "Natalia Petrenko",
    designation: "Candidate",
    shortName:   "Candidate Portal",
    candidateId: "c4",
  },
  {
    email:       "m.kowalski@eej.eu",
    password:    "EEJ2026!",
    role:        "candidate",
    tier:        4,
    name:        "Mariusz Kowalski",
    designation: "Candidate",
    shortName:   "Candidate Portal",
    candidateId: "c1",
  },
  {
    email:       "d.shevchenko@eej.eu",
    password:    "EEJ2026!",
    role:        "candidate",
    tier:        4,
    name:        "Daria Shevchenko",
    designation: "Candidate",
    shortName:   "Candidate Portal",
    candidateId: "c2",
  },
  {
    email:       "a.alrashid@eej.eu",
    password:    "EEJ2026!",
    role:        "candidate",
    tier:        4,
    name:        "Ahmed Al-Rashid",
    designation: "Candidate",
    shortName:   "Candidate Portal",
    candidateId: "c3",
  },
  {
    email:       "o.bondar@eej.eu",
    password:    "EEJ2026!",
    role:        "candidate",
    tier:        4,
    name:        "Oleksandr Bondar",
    designation: "Candidate",
    shortName:   "Candidate Portal",
    candidateId: "c5",
  },
];

const SESSION_KEY = "eej_session_v1";

interface AuthContextValue {
  user: User | null;
  login: (email: string, password: string) => string | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  login: () => "Not initialised",
  logout: () => {},
});

function sessionToUser(cred: Credential): User {
  return {
    role:        cred.role,
    tier:        cred.tier,
    designation: cred.designation,
    shortName:   cred.shortName,
    name:        cred.name,
    email:       cred.email,
    candidateId: cred.candidateId,
  };
}

function isValidUser(obj: unknown): obj is User {
  if (!obj || typeof obj !== "object") return false;
  const u = obj as Record<string, unknown>;
  return (
    typeof u.role === "string" &&
    typeof u.tier === "number" &&
    typeof u.name === "string" &&
    typeof u.email === "string" &&
    typeof u.designation === "string" &&
    typeof u.shortName === "string"
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (isValidUser(parsed)) return parsed;
        // stale/invalid session — wipe it
        localStorage.removeItem(SESSION_KEY);
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
    return null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [user]);

  function login(email: string, password: string): string | null {
    const emailNorm = email.trim().toLowerCase();
    const cred = CREDENTIALS.find(
      (c) => c.email.toLowerCase() === emailNorm && c.password === password
    );
    if (!cred) {
      return "Invalid email or password. Check your credentials and try again.";
    }
    setUser(sessionToUser(cred));
    return null;
  }

  function logout() {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
